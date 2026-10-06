import { stations } from "@openbts/drizzle";
import { type SQL, getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import searchStations from "../../../../../src/routes/v2/(get)/search/index.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { readStation, readUserId } from "../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

describe("searchStations", () => {
  it.each([false, true])("does not search beyond an empty public list with totals=%s", async (includeTotal) => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue({ is_public: true, stations: { internal: [] } });
    dbMock.enqueueFor("select", "countries", []);
    const app = await createRouteHarness(searchStations);
    const response = await app.inject({ url: `/search?q=Łódź&listId=${readUserId}&includeTotal=${includeTotal}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, nextCursor: null, ...(includeTotal ? { total: 0 } : {}) } });
    expect(dbMock.calls.some((call) => call.table === getTableName(stations))).toBe(false);
  });

  it("requires staff permission before applying an editable-only search", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const app = await createRouteHarness(searchStations, { session: userSession(readUserId) });
    expect((await app.inject({ url: "/search?q=Łódź&editableOnly=true" })).statusCode).toBe(403);
    expect(dbMock.calls).toHaveLength(0);
  });

  it("restricts an editable-only search to the editor's granted regions", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "role_grants", [{ countryCode: "PL", grantRole: "editor", isCountryWide: false, regionId: 7 }]);
    dbMock.enqueueFor("select", getTableName(stations), []);
    const app = await createRouteHarness(searchStations, { session: userSession(readUserId, "editor") });
    const response = await app.inject({ url: "/search?q=rat:lte&editableOnly=true" });
    expect(response.statusCode).toBe(200);
    const where = dbMock.calls.find((call) => call.table === getTableName(stations))?.clauses.where?.[0] as SQL;
    expect(new PgDialect().sqlToQuery(where).params).toContain(7);
  });

  it("preserves free-text match fields and stops cursor paging at the supported offset", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor(
      "select",
      getTableName(stations),
      [1, 2].map((id) => ({ station: { ...readStation, id }, rank: 0, field: "siteId", value: "Łódź-1", total: 0 })),
    );
    dbMock.enqueueFor("select", "extra_identificators", []);
    const app = await createRouteHarness(searchStations);
    const response = await app.inject({ url: "/search?q=Łódź-1&offset=100000&limit=1" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [{ match: { field: "siteId", value: "Łódź-1", type: "exact" } }],
      paging: { limit: 1, nextCursor: null },
    });
    expect(dbMock.calls.find((call) => call.table === getTableName(stations))?.clauses.offset).toEqual([100000]);
  });

  it("keeps keyword-only matches null and calculates pagination from the extra row", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor(
      "select",
      getTableName(stations),
      [1, 2].map((id) => ({ station: { ...readStation, id }, rank: null, field: null, value: null, total: 7 })),
    );
    dbMock.enqueueFor("select", "extra_identificators", []);
    const app = await createRouteHarness(searchStations);
    const response = await app.inject({ url: "/search?q=rat:lte%20status:inactive&limit=1&includeTotal=true" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: [{ id: 1, match: null }], paging: { limit: 1, total: 7, nextCursor: expect.any(String) } });
    const where = dbMock.calls.find((call) => call.table === getTableName(stations))?.clauses.where?.[0] as SQL;
    expect(new PgDialect().sqlToQuery(where).params).toEqual(expect.arrayContaining(["LTE", "inactive"]));
  });

  it("counts an empty offset page independently instead of reporting a zero total", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", getTableName(stations), [], [{ total: 3 }]);
    const app = await createRouteHarness(searchStations);
    const response = await app.inject({ url: "/search?q=Łódź&offset=9&includeTotal=true" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, total: 3, nextCursor: null } });
    expect(dbMock.calls.filter((call) => call.table === getTableName(stations))).toHaveLength(2);
  });

  it.each(["q=rat:invalid", "q=staus:active", "q=gps:999,1", "q=ok&cursor=broken", "q=ok&cursor=broken&offset=1", "q=%20%20"])(
    "rejects invalid search expressions: %s",
    async (query) => {
      dbMock.enqueueFor("select", "countries", []);
      const app = await createRouteHarness(searchStations);
      const response = await app.inject({ url: `/search?${query}` });
      expect(response.statusCode).toBe(400);
      expect(dbMock.calls.some((call) => call.table === getTableName(stations))).toBe(false);
    },
  );
});
