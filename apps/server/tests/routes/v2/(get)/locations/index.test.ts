import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import getLocation from "../../../../../src/routes/v2/(get)/locations/[id].js";
import getLocations from "../../../../../src/routes/v2/(get)/locations/index.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { readLocation, readUserId } from "../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

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
      const where = dbMock.calls.find((call) => call.table === "locations")?.clauses.where?.[0] as SQL | undefined;
      const sql = where ? new PgDialect().sqlToQuery(where).sql : "";
      if (query.includes("hasStations")) expect(sql).toContain("EXISTS");
      if (query.includes("q=")) expect(sql).toContain(" OR ");
      if (query === "includeEmpty=true") expect(sql).not.toContain("EXISTS");
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

  it.each(["includeEmpty=true", "hasStations=false", "editableOnly=true"])("protects staff-only selector %s", async (query) => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const app = await createRouteHarness(getLocations, { session: userSession(readUserId) });
    const response = await app.inject({ method: "GET", url: `/locations?${query}` });
    expect(response.statusCode).toBe(403);
    expect(response.json().errors[0].code).toBe("INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toHaveLength(0);
  });

  it("returns an empty collection with zero total for a valid empty page", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "locations", [], []);
    const app = await createRouteHarness(getLocations);
    const response = await app.inject({ method: "GET", url: "/locations?includeTotal=true" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, nextCursor: null, total: 0 } });
  });

  it.each(["limit=1001", "cursor=x&offset=0", "hasStations=0", "include=stations.invalid", "q=%00", "structureTypes=unknownValue"])(
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
    const where = dbMock.calls.find((call) => call.table === "stations")?.clauses.where?.[0] as SQL;
    expect(new PgDialect().sqlToQuery(where).sql).toContain("false");
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

  it.each(["missing", "hidden"])("returns 404 for a %s location", async (kind) => {
    dbMock.enqueueFor("select", "locations", kind === "missing" ? [] : [readLocation]);
    if (kind === "hidden") dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    const app = await createRouteHarness(getLocation);
    const response = await app.inject({ method: "GET", url: "/locations/1" });
    expect(response.statusCode).toBe(404);
    expect(response.json().errors[0].code).toBe("NOT_FOUND");
  });
});
