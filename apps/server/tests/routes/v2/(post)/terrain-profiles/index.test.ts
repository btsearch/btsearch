import { beforeEach, describe, expect, it, vi } from "vitest";

import route from "../../../../../src/routes/v2/(post)/terrain-profiles/index.js";
import { dbMock, redisMock, userSession } from "../../../../helpers/boundaries.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

const now = "2026-10-06T10:00:00.000Z";
const receiver = { latitude: 52.01, longitude: 21, heightMeters: 2 };
const body = { stationId: 1, receiver };
const profileId = "20ddf715-e424-4e63-8c73-cc1326c74b3a";

function station(source: "internal" | "uke" = "internal") {
  dbMock.enqueueFor("select", "countries", []);
  const row = { id: 1, station_id: "A1", location: { id: 2, latitude: 52, longitude: 21 }, operator: null, permits: [] };
  if (source === "internal") {
    dbMock.query.stations.findFirst.mockResolvedValue(row);
    dbMock.query.stationsPermits.findMany.mockResolvedValue([]);
  } else dbMock.query.ukeStations.findFirst.mockResolvedValue(row);
}

function cached(status = "pending", source = "internal") {
  return {
    id: profileId,
    status,
    createdAt: now,
    updatedAt: now,
    expiresAt: "2026-10-06T11:00:00.000Z",
    request: { station: { source, id: 1 }, receiver },
    antenna: null,
    report: null,
    result: null,
    failure: null,
    candidates: [],
    propagation: null,
  };
}

describe("POST /terrain-profiles", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    redisMock.set.mockResolvedValue(null);
  });

  it.each(["internal", "uke"] as const)("creates and caches a pending %s profile with poll headers", async (source) => {
    station(source);
    const app = await createRouteHarness(route, { session: userSession(undefined, "admin") });
    const payload = source === "internal" ? body : { officialSiteId: 1, receiver };
    const response = await app.inject({ method: "POST", url: "/terrain-profiles?include=candidates,propagation", payload });

    expect(response.statusCode, response.body).toBe(201);
    expect(response.headers["retry-after"]).toBe("2");
    expect(response.headers["x-retry-after"]).toBe("2");
    expect(response.json().data).toMatchObject({
      status: "pending",
      stationId: source === "internal" ? 1 : null,
      officialSiteId: source === "uke" ? 1 : null,
      receiver,
      createdAt: now,
      expiresAt: "2026-10-06T11:00:00.000Z",
      antenna: null,
      report: null,
      result: null,
      failure: null,
      candidates: [],
      propagation: null,
    });
    const id: string = response.json().data.id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(redisMock.setEx).toHaveBeenCalledWith(`terrain:profile:v1:${id}`, 3600, expect.any(String));
    expect(redisMock.setEx).toHaveBeenCalledWith(expect.stringMatching(/^terrain:profile:request:v1:/), 3600, id);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("reuses a pending profile without storing a new profile or consuming the start quota", async () => {
    station();
    redisMock.get.mockResolvedValueOnce(profileId).mockResolvedValueOnce(JSON.stringify(cached()));
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: "/terrain-profiles", payload: body });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.id).toBe(profileId);
    expect(response.headers["retry-after"]).toBe("2");
    expect(response.json().data).not.toHaveProperty("candidates");
    expect(response.json().data).not.toHaveProperty("propagation");
    expect(redisMock.setEx).not.toHaveBeenCalled();
    expect(redisMock.eval).not.toHaveBeenCalled();
  });

  it("reuses a ready profile without sending poll headers", async () => {
    station();
    redisMock.get.mockResolvedValueOnce(profileId).mockResolvedValueOnce(JSON.stringify(cached("ready")));
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: "/terrain-profiles", payload: body });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe("ready");
    expect(response.headers).not.toHaveProperty("retry-after");
    expect(response.headers).not.toHaveProperty("x-retry-after");
    expect(redisMock.setEx).not.toHaveBeenCalled();
  });

  it.each(["failed", "cancelled"])("starts a new analysis instead of reusing a %s profile", async (status) => {
    station();
    redisMock.get.mockResolvedValueOnce(profileId).mockResolvedValueOnce(JSON.stringify(cached(status)));
    const app = await createRouteHarness(route, { session: userSession(undefined, "admin") });
    const response = await app.inject({ method: "POST", url: "/terrain-profiles", payload: body });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.status).toBe("pending");
    expect(response.json().data.id).not.toBe(profileId);
  });

  it("replaces a stale request index whose profile has expired", async () => {
    station();
    redisMock.get.mockResolvedValueOnce(profileId).mockResolvedValueOnce(null);
    const app = await createRouteHarness(route, { session: userSession(undefined, "admin") });

    expect((await app.inject({ method: "POST", url: "/terrain-profiles", payload: body })).statusCode).toBe(201);
    expect(redisMock.setEx).toHaveBeenCalledTimes(2);
  });

  it("does not resolve a station when Poland is inaccessible", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "POST", url: "/terrain-profiles", payload: body })).statusCode).toBe(404);
    expect(dbMock.query.stations.findFirst).not.toHaveBeenCalled();
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it.each([undefined, { id: 1, location: null }])("returns 404 when the station is absent or has no location", async (row) => {
    station();
    dbMock.query.stations.findFirst.mockResolvedValue(row);
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "POST", url: "/terrain-profiles", payload: body })).statusCode).toBe(404);
    expect(redisMock.get).not.toHaveBeenCalled();
    expect(redisMock.setEx).not.toHaveBeenCalled();
  });

  it.each([
    ["coincident receiver", { ...receiver, latitude: 52 }],
    ["receiver closer than ten metres", { ...receiver, latitude: 52.00001 }],
    ["receiver farther than thirty kilometres", { ...receiver, latitude: 53 }],
  ])("rejects a %s before starting or caching analysis", async (_name, point) => {
    station();
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: "/terrain-profiles", payload: { ...body, receiver: point } });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].code).toBe("BAD_REQUEST");
    expect(redisMock.get).not.toHaveBeenCalled();
    expect(redisMock.setEx).not.toHaveBeenCalled();
  });

  it.each([
    ["no station source", { receiver }],
    ["both station sources", { ...body, officialSiteId: 1 }],
    ["zero station id", { ...body, stationId: 0 }],
    ["fractional station id", { ...body, stationId: 1.5 }],
    ["negative official id", { officialSiteId: -1, receiver }],
    ["unknown field", { ...body, extra: true }],
    ["empty antenna key", { ...body, antennaKey: "" }],
    ["too-long antenna key", { ...body, antennaKey: "a".repeat(65) }],
    ["latitude below coverage", { ...body, receiver: { ...receiver, latitude: 48.799 } }],
    ["latitude above coverage", { ...body, receiver: { ...receiver, latitude: 55.201 } }],
    ["longitude below coverage", { ...body, receiver: { ...receiver, longitude: 13.799 } }],
    ["longitude above coverage", { ...body, receiver: { ...receiver, longitude: 24.501 } }],
    ["height below minimum", { ...body, receiver: { ...receiver, heightMeters: 0.999 } }],
    ["height above maximum", { ...body, receiver: { ...receiver, heightMeters: 100.001 } }],
    ["string coordinates", { ...body, receiver: { ...receiver, latitude: "52" } }],
    ["null receiver", { ...body, receiver: null }],
  ])("rejects %s before any database or cache call", async (_name, payload) => {
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: "/terrain-profiles", payload });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].code).toBe("VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it.each(["include=unknown", "unknown=1"])("rejects invalid query %s before station resolution", async (query) => {
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "POST", url: `/terrain-profiles?${query}`, payload: body })).statusCode).toBe(400);
    expect(dbMock.calls).toEqual([]);
  });

  it("does not claim success when caching a new profile fails", async () => {
    station();
    redisMock.setEx.mockRejectedValue(new Error("Redis unavailable"));
    const app = await createRouteHarness(route, { session: userSession(undefined, "admin") });

    expect((await app.inject({ method: "POST", url: "/terrain-profiles", payload: body })).statusCode).toBe(500);
    expect(redisMock.setEx).toHaveBeenCalledTimes(1);
  });

  it.each(["editor", "admin"] as const)("lets a signed-in %s start a profile without the start counter", async (role) => {
    station();
    const app = await createRouteHarness(route, { session: userSession(undefined, role) });

    expect((await app.inject({ method: "POST", url: "/terrain-profiles", payload: body })).statusCode).toBe(201);
    expect(redisMock.eval).not.toHaveBeenCalled();
  });

  it("returns 429 with the counter retry delay and saves no profile when the start quota is exhausted", async () => {
    station();
    redisMock.eval.mockResolvedValueOnce([16, 123]);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: "/terrain-profiles", payload: body });

    expect(response.statusCode).toBe(429);
    expect(response.headers["x-retry-after"]).toBe("123");
    expect(redisMock.setEx).not.toHaveBeenCalled();
  });

  it("returns 503 and saves no profile when the start counter is unavailable", async () => {
    station();
    redisMock.isReady = false;
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: "/terrain-profiles", payload: body });

    expect(response.statusCode).toBe(503);
    expect(redisMock.setEx).not.toHaveBeenCalled();
  });
});
