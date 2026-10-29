import { curatedCellSummaries } from "@openbts/drizzle";
import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { getRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import getLocation from "../../../../../src/routes/v2/(get)/locations/[id].js";
import getLocations from "../../../../../src/routes/v2/(get)/locations/index.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { readCell, readLocation, readStation, readUserId } from "../../../../helpers/readFixtures.js";
import { createRouteHarness, createRouteHarnessWithErrors } from "../../../../helpers/routeHarness.js";

describe("getLocations", () => {
  it.each([false, true])("skips location reads for an empty public list with totals=%s", async (includeTotal) => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue({ is_public: true, stations: { internal: [] } });
    dbMock.enqueueFor("select", "countries", []);
    const app = await createRouteHarness(getLocations);
    const response = await app.inject({ url: `/locations?listId=${readUserId}&includeTotal=${includeTotal}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, nextCursor: null, ...(includeTotal ? { total: 0 } : {}) } });
    expect(dbMock.calls.some((call) => call.table === "locations")).toBe(false);
  });

  it.each(["includeEmpty=true", "hasStations=false", "includeEmpty=true&hasStations=true", "includeEmpty=true&q=Łódź"])(
    "permits staff to select locations without matching stations: %s",
    async (query) => {
      dbMock.enqueueFor("select", "countries", []);
      dbMock.enqueueFor("select", "locations", [{ ...readLocation, key: 1 }]);
      const app = await createRouteHarness(getLocations, { session: userSession(readUserId, "admin") });
      const response = await app.inject({ url: `/locations?${query}` });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject([{ id: 1, city: "Łódź" }]);
      if (query === "includeEmpty=true") expect(dbMock.calls.find((call) => call.table === "locations")?.clauses.where?.[0]).toBeUndefined();
    },
  );

  it.each([false, true])("paginates locations and embeds the requested region with totals=%s", async (includeTotal) => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "locations", [
      { ...readLocation, key: 1 },
      { ...readLocation, location: { ...readLocation.location, id: 2 }, key: 2 },
    ]);
    if (includeTotal) dbMock.enqueueFor("select", "locations", [{ total: 5 }]);
    const app = await createRouteHarness(getLocations);
    const response = await app.inject({ method: "GET", url: `/locations?limit=1&include=region&includeTotal=${includeTotal}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0]).toMatchObject({
      id: 1,
      countryCode: "PL",
      city: "Łódź",
      region: readLocation.region,
      structure: { type: null, owner: null, note: null },
    });
    expect(response.json().paging).toMatchObject({ limit: 1, nextCursor: expect.any(String) });
    if (includeTotal) expect(response.json().paging.total).toBe(5);
    else expect(response.json().paging).not.toHaveProperty("total");
  });

  it("loads embedded stations while the exact total is still pending", async () => {
    vi.useFakeTimers();
    let finishTotal: ((rows: { total: number }[]) => void) | undefined;
    const total = new Promise<{ total: number }[]>((resolve) => {
      finishTotal = resolve;
    });
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "locations", [{ ...readLocation, key: 1 }], total);
    dbMock.enqueueFor("select", "stations", [{ station: { ...readStation, location_id: 1 } }], []);
    dbMock.enqueueFor("select", "extra_identificators", []);
    const app = await createRouteHarness(getLocations);
    const response = Promise.resolve(app.inject({ url: "/locations?include=stations&includeTotal=true" }));
    try {
      await vi.waitFor(() => expect(dbMock.calls.some((call) => call.table === "extra_identificators")).toBe(true), {
        timeout: 100,
        interval: 1,
      });
    } finally {
      finishTotal?.([{ total: 7 }]);
    }
    const result = await response;
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ data: [{ id: 1, stations: [{ id: 1 }] }], paging: { total: 7 } });
  });

  it("accepts a page of 1500 locations and preserves the continuation cursor", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor(
      "select",
      "locations",
      Array.from({ length: 1501 }, (_, index) => ({
        ...readLocation,
        location: { ...readLocation.location, id: index + 1 },
        key: index + 1,
      })),
    );
    const app = await createRouteHarness(getLocations);
    const response = await app.inject({ url: "/locations?limit=1500" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1500);
    expect(response.json().paging).toMatchObject({ limit: 1500, nextCursor: expect.any(String) });
    expect(dbMock.calls.find((call) => call.table === "locations")?.clauses.limit).toEqual([1501]);
  });

  it.each(["total", "stations"])("returns a controlled failure when the %s query rejects", async (failedQuery) => {
    const failure = new Error(`Failed ${failedQuery} query`);
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "locations", [{ ...readLocation, key: 1 }], failedQuery === "total" ? failure : [{ total: 7 }]);
    dbMock.enqueueFor("select", "stations", failedQuery === "stations" ? failure : [{ station: { ...readStation, location_id: 1 } }], []);
    dbMock.enqueueFor("select", "extra_identificators", []);
    const { app, errors } = await createRouteHarnessWithErrors(getLocations);
    const response = await app.inject({ url: "/locations?include=stations&includeTotal=true" });
    expect(response.statusCode).toBe(500);
    expect(errors).toContain(failure);
  });

  it.each(["includeEmpty=true", "hasStations=false", "editableOnly=true"])("protects staff-only selector %s", async (query) => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const app = await createRouteHarness(getLocations, { session: userSession(readUserId) });
    const response = await app.inject({ method: "GET", url: `/locations?${query}` });
    expect(response.statusCode).toBe(403);
    expect(response.json().errors[0].code).toBe("INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toHaveLength(0);
  });

  it.each(["limit=1501", "cursor=x&offset=0", "hasStations=0", "include=stations.invalid", "q=%00", "structureTypes=unknownValue"])(
    "rejects an invalid location query before access: %s",
    async (query) => {
      const app = await createRouteHarness(getLocations);
      expect((await app.inject({ method: "GET", url: `/locations?${query}` })).statusCode).toBe(400);
      expect(dbMock.calls).toHaveLength(0);
    },
  );
});

describe("getLocation", () => {
  it("keeps a location visible while an empty list excludes every embedded station", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue({ is_public: true, stations: { internal: [] } });
    dbMock.enqueueFor("select", "locations", [readLocation]);
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "stations", []);
    const app = await createRouteHarness(getLocation);
    const response = await app.inject({ url: `/locations/1?include=stations&listId=${readUserId}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ id: 1, stations: [] });
  });

  it("omits embedded relations when no include is requested", async () => {
    dbMock.enqueueFor("select", "locations", [readLocation]);
    dbMock.enqueueFor("select", "countries", []);
    const app = await createRouteHarness(getLocation);
    const response = await app.inject({ url: "/locations/1" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).not.toHaveProperty("stations");
    expect(response.json().data).not.toHaveProperty("region");
    expect(dbMock.calls.some((call) => call.table === "stations")).toBe(false);
  });

  it("returns the visible location with an explicitly requested empty station relation", async () => {
    dbMock.enqueueFor("select", "locations", [readLocation]);
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "stations", []);
    const app = await createRouteHarness(getLocation);
    const response = await app.inject({ method: "GET", url: "/locations/1?include=region,stations" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ id: 1, region: readLocation.region, stations: [], latitude: 52, longitude: 21 });
  });

  it("carries each station's and each cell's sightings with include=stations.sightings,stations.cells.sightings", async () => {
    dbMock.enqueueFor("select", "locations", [readLocation]);
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "stations", [{ station: { ...readStation, location_id: 1 } }], []);
    dbMock.enqueueFor("select", "extra_identificators", []);
    dbMock.enqueueFor("select", "cells", [readCell]);
    dbMock.enqueueFor("select", "bands", [{ id: 3, rat: "LTE", code: "B3", name: "1800", value: 1800, duplex: "FDD", variant: "commercial" }]);
    dbMock.enqueueFor("select", getTableName(curatedCellSummaries), [{ stationId: 1, firstSeenOn: "2026-10-01", lastSeenOn: "2026-10-30" }]);
    dbMock.enqueueFor("select", getTableName(curatedCellSummaries), [
      { cellId: 1, rat: "LTE", firstSeenOn: "2026-10-22", lastSeenOn: "2026-10-30", bandwidthKhz: 20000 },
    ]);
    const app = await createRouteHarness(getLocation);
    const response = await app.inject({ url: "/locations/1?include=stations.sightings,stations.cells.sightings" });
    expect(response.statusCode).toBe(200);
    const [station] = response.json().data.stations;
    expect(station.sightings).toEqual({ firstSeenOn: "2026-10-01", lastSeenOn: "2026-10-30" });
    expect(station.cells[0].sightings).toEqual({ firstSeenOn: "2026-10-22", lastSeenOn: "2026-10-30", bandwidthKhz: 20000 });
  });

  it.each(["missing", "hidden"])("returns 404 for a %s location", async (kind) => {
    dbMock.enqueueFor("select", "locations", kind === "missing" ? [] : [readLocation]);
    if (kind === "hidden") dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    const app = await createRouteHarness(getLocation);
    const response = await app.inject({ method: "GET", url: "/locations/1" });
    expect(response.statusCode).toBe(404);
    expect(response.json().errors[0].code).toBe("NOT_FOUND");
  });
});
