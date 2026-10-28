import { curatedCellSummaries, stations } from "@openbts/drizzle";
import { type SQL, getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import getStation from "../../../../../src/routes/v2/(get)/stations/[id].js";
import getStations from "../../../../../src/routes/v2/(get)/stations/index.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { readCell, readStation, readUserId } from "../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

const table = getTableName(stations);
const summaryTable = getTableName(curatedCellSummaries);
const band = { id: 3, rat: "LTE", code: "B3", name: "1800", value: 1800, duplex: "FDD", variant: "commercial" };

describe("getStations", () => {
  it.each([false, true])("does not load stations when the public list has no internal members with totals=%s", async (includeTotal) => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue({ is_public: true, stations: { official: [1], internal: [] } });
    dbMock.enqueueFor("select", "countries", []);
    const app = await createRouteHarness(getStations);
    const response = await app.inject({ url: `/stations?listId=${readUserId}&includeTotal=${includeTotal}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, nextCursor: null, ...(includeTotal ? { total: 0 } : {}) } });
    expect(dbMock.calls.some((call) => call.table === table)).toBe(false);
  });

  it.each([false, true])("returns a bounded page with conditional totals (%s)", async (includeTotal) => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", table, [
      { station: readStation, key: 1 },
      { station: { ...readStation, id: 2 }, key: 2 },
    ]);
    if (includeTotal) dbMock.enqueueFor("select", table, [{ total: 7 }]);
    dbMock.enqueueFor("select", "extra_identificators", [{ id: 1, station_id: 1, networks_id: 0, networks_name: null, mno_name: "Zero network" }]);
    const app = await createRouteHarness(getStations);
    const response = await app.inject({ method: "GET", url: `/stations?limit=1&includeTotal=${includeTotal}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0]).toMatchObject({
      id: 1,
      siteId: "Łódź-1",
      status: "active",
      locationId: null,
      identifiers: [
        { kind: "networksId", value: "0" },
        { kind: "operatorName", value: "Zero network" },
      ],
    });
    expect(response.json().paging).toMatchObject({ limit: 1, nextCursor: expect.any(String) });
    if (includeTotal) expect(response.json().paging.total).toBe(7);
    else expect(response.json().paging).not.toHaveProperty("total");
    expect(dbMock.calls.find((call) => call.table === table)?.clauses.limit).toEqual([2]);
  });

  it("translates combined status, band, technology and confirmation filters into one query", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", table, []);
    const app = await createRouteHarness(getStations);
    const response = await app.inject({
      method: "GET",
      url: "/stations?statuses=inactive&rats=lte&bandIds=unknown&isConfirmed=false&supportsIot=true",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, nextCursor: null } });
    const where = dbMock.calls.find((call) => call.table === table)?.clauses.where?.[0] as SQL;
    const query = new PgDialect().sqlToQuery(where);
    expect(query.params).toEqual(expect.arrayContaining(["inactive", "LTE", 0]));
    expect(query.sql).toContain("IS NOT TRUE");
    expect(query.sql).toContain("supports_iot");
  });

  it.each(["cursor=opaque&offset=0", "limit=1001", "statuses=published", "include=location.invalid", "supportsIot=1"])(
    "rejects invalid combinations before querying: %s",
    async (query) => {
      const app = await createRouteHarness(getStations);
      expect((await app.inject({ method: "GET", url: `/stations?${query}` })).statusCode).toBe(400);
      expect(dbMock.calls).toHaveLength(0);
    },
  );

  it("adds each station's days from its cells with include=sightings, and none to the cells", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", table, [
      { station: readStation, key: 1 },
      { station: { ...readStation, id: 2 }, key: 2 },
    ]);
    dbMock.enqueueFor("select", "extra_identificators", []);
    dbMock.enqueueFor("select", "cells", [readCell]);
    dbMock.enqueueFor("select", "bands", [band]);
    dbMock.enqueueFor("select", undefined, [{ stationId: 1, firstSeenOn: "2026-10-01", lastSeenOn: "2026-10-30" }]);
    const app = await createRouteHarness(getStations);
    const response = await app.inject({ method: "GET", url: "/stations?include=sightings,cells" });
    expect(response.statusCode).toBe(200);
    const [seen, unseen] = response.json().data;
    expect(seen.sightings).toEqual({ firstSeenOn: "2026-10-01", lastSeenOn: "2026-10-30" });
    expect(seen.cells[0]).not.toHaveProperty("sightings");
    expect(unseen.sightings).toBeNull();
  });

  it("requires edit permission when editableOnly is requested", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const app = await createRouteHarness(getStations, { session: userSession(readUserId, "user") });
    const response = await app.inject({ method: "GET", url: "/stations?editableOnly=true" });
    expect(response.statusCode).toBe(403);
    expect(response.json().errors[0].code).toBe("INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toHaveLength(0);
  });
});

describe("getStation", () => {
  it("returns requested empty relations and nullable placement without inventing data", async () => {
    dbMock.enqueueFor("select", table, [{ station: readStation, countryCode: null }]);
    dbMock.enqueueFor("select", "extra_identificators", []);
    dbMock.enqueueFor("select", "cells", []);
    dbMock.enqueueFor("select", "bands", []);
    dbMock.enqueueFor("select", "station_sectors", []);
    dbMock.enqueueFor("select", "station_uplinks", []);
    const app = await createRouteHarness(getStation);
    const response = await app.inject({ method: "GET", url: "/stations/1?include=operator,location.region,cells.band,sectors,backhaul" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ id: 1, operator: null, location: null, cells: [], sectors: [], backhaul: null });
  });

  it("adds each cell's sightings with include=cells.sightings, and none to the station", async () => {
    dbMock.enqueueFor("select", table, [{ station: readStation, countryCode: null }]);
    dbMock.enqueueFor("select", "extra_identificators", []);
    dbMock.enqueueFor("select", "cells", [readCell, { ...readCell, cell: { ...readCell.cell, id: 2 } }]);
    dbMock.enqueueFor("select", "bands", [band]);
    dbMock.enqueueFor("select", summaryTable, [{ cellId: 1, rat: "LTE", firstSeenOn: "2026-10-22", lastSeenOn: "2026-10-30", bandwidthKhz: 20000 }]);
    const app = await createRouteHarness(getStation);
    const response = await app.inject({ method: "GET", url: "/stations/1?include=cells.sightings" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).not.toHaveProperty("sightings");
    expect(response.json().data.cells.map((cell: { sightings: unknown }) => cell.sightings)).toEqual([
      { firstSeenOn: "2026-10-22", lastSeenOn: "2026-10-30", bandwidthKhz: 20000 },
      null,
    ]);
  });

  it.each(["missing", "hidden"])("hides a %s station", async (kind) => {
    dbMock.enqueueFor("select", table, kind === "missing" ? [] : [{ station: readStation, countryCode: "PL" }]);
    if (kind === "hidden") dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    const app = await createRouteHarness(getStation);
    const response = await app.inject({ method: "GET", url: "/stations/1" });
    expect(response.statusCode).toBe(404);
    expect(response.json().errors[0].code).toBe("NOT_FOUND");
  });
});
