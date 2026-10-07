import { describe, expect, it } from "vitest";

import getTerrainProfileRoute from "../../../../../src/routes/v2/(get)/terrain-profiles/[id].js";
import { dbMock, redisMock } from "../../../../helpers/boundaries.js";
import { readUserId } from "../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

describe("getTerrainProfileRoute", () => {
  it.each(["pending", "failed", "cancelled"])("serializes a %s profile and sends polling headers only while pending", async (status) => {
    dbMock.enqueueFor("select", "countries", []);
    redisMock.get.mockResolvedValue(
      JSON.stringify({
        id: readUserId,
        status,
        createdAt: "2026-10-06T10:00:00Z",
        updatedAt: "9998-01-01T00:00:00Z",
        expiresAt: "9998-01-01T01:00:00Z",
        request: { station: { source: "internal", id: 1 }, receiver: { latitude: 52, longitude: 21, heightMeters: 2 } },
        antenna: null,
        report: null,
        result: null,
        failure: status === "failed" ? { reason: "antennaDataUnavailable", message: "No antenna data" } : null,
        candidates: [],
        propagation: null,
      }),
    );
    const app = await createRouteHarness(getTerrainProfileRoute);
    const response = await app.inject({ url: `/terrain-profiles/${readUserId}?include=candidates,propagation` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      status,
      stationId: 1,
      officialSiteId: null,
      receiver: { heightMeters: 2 },
      candidates: [],
      propagation: null,
    });
    expect(redisMock.get).toHaveBeenCalledWith(`terrain:profile:v1:${readUserId}`);
    if (status === "pending") expect(response.headers).toMatchObject({ "retry-after": "2", "x-retry-after": "2" });
    else expect(response.headers).not.toHaveProperty("retry-after");
  });

  it.each(["expired", "hidden"])("hides a %s profile", async (kind) => {
    dbMock.enqueueFor("select", "countries", kind === "hidden" ? [{ code: "PL" }] : []);
    const app = await createRouteHarness(getTerrainProfileRoute);
    expect((await app.inject({ url: `/terrain-profiles/${readUserId}` })).statusCode).toBe(404);
    if (kind === "hidden") expect(redisMock.get).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", `${readUserId}?include=invalid`])("rejects malformed requests before reading profiles: %s", async (path) => {
    const app = await createRouteHarness(getTerrainProfileRoute);
    expect((await app.inject({ url: `/terrain-profiles/${path}` })).statusCode).toBe(400);
    expect(redisMock.get).not.toHaveBeenCalled();
  });
});
