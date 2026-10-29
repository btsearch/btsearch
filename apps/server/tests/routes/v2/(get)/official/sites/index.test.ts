import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { decodeCursor, encodeCursor } from "../../../../../../src/lib/cursor.js";
import { getRuntimeSettings } from "../../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../../src/routes/v2/(get)/official/sites/index.js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";
import {
  expectDocumented,
  officialPermitRow,
  officialSectorRow,
  officialSiteRows,
  regionRow,
  renderedWhere,
  scriptAdminVisibility,
  scriptGuestVisibility,
  servedLocation,
  servedPermit,
  servedSector,
  servedSite,
  tablesRead,
} from "../../../../../helpers/officialDataFixtures.js";
import { signInAs } from "../../../../../helpers/officialFixtures.js";

const request = { method: "GET" as const, url: "/official/sites" };
const PUBLIC_LOCATION = '"official"."locations"."source_id" in ($1)';

function listed(id: number, key: string | null = null) {
  return { ...officialSiteRows, site: { ...officialSiteRows.site, id }, key };
}

function pageCall() {
  return dbMock.calls.find((call) => call.table === "official.sites");
}

function renderedOrder(): string[] {
  const dialect = new PgDialect();
  return ((pageCall()?.clauses.orderBy ?? []) as SQL[]).map((part) => dialect.sqlToQuery(part).sql.replace(/\s+/g, " "));
}

async function sitesFor(query: string, hidden: string[] = []) {
  scriptGuestVisibility([1], hidden);
  dbMock.enqueueFor("select", "official.sites", []);
  const response = await injectMutation(route, { ...request, url: `/official/sites?${query}` });
  expect(response.statusCode, response.body).toBe(200);
  return renderedWhere("official.sites");
}

describe("GET /official/sites", () => {
  it("is documented for guests with the permit permission", () => {
    expectDocumented(route);
    expect(route.config).toMatchObject({ permissions: ["read:official_permits"], allowGuestAccess: true });
  });

  it("returns a guest the sites of public sources, newest first, each with its linked station", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.sites", [listed(31)]);
    dbMock.enqueueFor("select", "stations_official_sites", [{ officialSiteId: 31, stationId: 9 }]);

    const response = await injectMutation(route, request);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ data: [{ ...servedSite, stationId: 9 }], paging: { limit: 50, nextCursor: null } });
    expect(renderedWhere("official.sites")).toEqual({ sql: PUBLIC_LOCATION, params: [1] });
    expect(renderedOrder()).toEqual(['"official"."sites"."id" desc']);
    expect(renderedWhere("stations_official_sites")).toEqual({ sql: '"stations_official_sites"."official_site_id" in ($1)', params: [31] });
  });

  it("leaves out the stations of a country hidden from a guest", async () => {
    scriptGuestVisibility([1], ["XX"]);
    dbMock.enqueueFor("select", "official.sites", [listed(31)]);
    dbMock.enqueueFor("select", "stations_official_sites", []);

    await injectMutation(route, request);

    const stationsRead = renderedWhere("stations_official_sites");
    expect(stationsRead.sql).toContain('"stations"."id" IN (SELECT "stations"."id" FROM "stations"');
    expect(stationsRead.params).toEqual([31, "XX"]);
  });

  it("includes the location with its region and every permit with its sectors", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.sites", [listed(31)]);
    dbMock.enqueueFor("select", "stations_official_sites", []);
    dbMock.enqueueFor("select", "official.permits", [{ permit: officialPermitRow, sourceKey: "pl-uke" }]);
    dbMock.enqueueFor("select", "official.permit_listings", [{ permitId: 41, key: "permits" }]);
    dbMock.enqueueFor("select", "official.permit_sectors", [officialSectorRow]);

    const response = await injectMutation(route, { ...request, url: "/official/sites?include=location.region,permits.sectors" });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toEqual([
      {
        ...servedSite,
        location: { ...servedLocation, region: regionRow },
        permits: [{ ...servedPermit, datasets: ["permits"], sectors: [servedSector] }],
      },
    ]);
    expect(renderedWhere("official.permits")).toEqual({ sql: '"official"."permits"."official_site_id" in ($1)', params: [31] });
  });

  it("narrows the sites and their permits with the technology filter", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.sites", [listed(31)]);
    dbMock.enqueueFor("select", "stations_official_sites", []);
    dbMock.enqueueFor("select", "official.permits", []);
    dbMock.enqueueFor("select", "official.permit_listings", []);

    const response = await injectMutation(route, { ...request, url: "/official/sites?rats=gsmR&include=location,permits" });

    expect(response.json().data).toEqual([{ ...servedSite, location: servedLocation, permits: [] }]);
    expect(renderedWhere("official.sites").sql).toContain('exists select "official"."permits"."id" from "official"."permits" where');
    expect(renderedWhere("official.permits")).toEqual({
      sql:
        '(("official"."permits"."official_site_id" in ($1)) and ' +
        '((("official"."permits"."rat" = $2) and ("official"."permits"."label_variant" = $3))))',
      params: [31, "GSM", "railway"],
    });
  });

  it.each([
    ["siteIds=BT12345,BT_2", '"official"."sites"."site_id" in ($2, $3)', ["BT12345", "BT_2"]],
    ["operatorIds=4", '"official"."sites"."operator_id" in ($2)', [4, 4, "jv_member"]],
    ["createdAfter=2026-10-01T00:00:00Z", '"official"."sites"."createdAt" >= $2', ["2026-10-01T00:00:00.000Z"]],
    ["updatedAfter=2026-10-01T00:00:00Z", '"official"."sites"."updatedAt" >= $2', ["2026-10-01T00:00:00.000Z"]],
    ["countryCodes=PL", '"regions"."country_code" in ($2)', ["PL"]],
    ["regionIds=7,8", '"official"."locations"."region_id" in ($2, $3)', [7, 8]],
    ["sourceKeys=pl-uke", '"official"."sources"."key" in ($2)', ["pl-uke"]],
  ])("filters the sites with %s", async (query, condition, params) => {
    const where = await sitesFor(query);
    expect(where.sql).toContain(condition);
    expect(where.params).toEqual([1, ...params]);
  });

  it("matches a site created or changed after a time with changedAfter", async () => {
    const where = await sitesFor("changedAfter=2026-10-01T00:00:00Z");
    expect(where.sql).toContain('("official"."sites"."createdAt" >= $2 OR "official"."sites"."updatedAt" >= $3)');
  });

  it("finds the sites linked to stations in visible countries", async () => {
    const where = await sitesFor("stationIds=5,6", ["XX"]);

    expect(where.sql).toContain(
      'exists select "stations_official_sites"."station_id" from "stations_official_sites" ' +
        'where (("stations_official_sites"."official_site_id" = "official"."sites"."id") ' +
        'and ("stations_official_sites"."station_id" in ($3, $4)) and ("stations"."id" IN',
    );
    expect(where.sql).not.toContain('"official"."permits"');
    expect(where.params).toEqual([1, "XX", 5, 6, "XX"]);
  });

  it("returns only the sites on a list", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue({ is_public: true, stations: { official: [31] }, radiolines: [] });

    const where = await sitesFor("listId=list-1");

    expect(where.sql).toContain('"official"."sites"."id" in ($2)');
  });

  it("searches site ids, permit numbers and places, best matches first, and pages by position", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.sites", [listed(31), listed(30)]);
    dbMock.enqueueFor("select", "stations_official_sites", []);

    const response = await injectMutation(route, { ...request, url: "/official/sites?q=bt_1&limit=1" });

    const where = renderedWhere("official.sites");
    expect(where.sql).toContain(
      '( "official"."sites"."site_id" ILIKE $2 OR exists select "official"."permits"."id" from "official"."permits" where ' +
        '(("official"."permits"."official_site_id" = "official"."sites"."id") and ("official"."permits"."decision_number" ilike $3)) ' +
        'OR fold_text("official"."locations"."city") LIKE fold_text($4) OR fold_text("official"."locations"."address") LIKE fold_text($5) )',
    );
    expect(where.params).toEqual([1, "%bt\\_1%", "%bt\\_1%", "%bt\\_1%", "%bt\\_1%"]);
    expect(renderedOrder()).toEqual([
      'CASE WHEN upper("official"."sites"."site_id") = $1 THEN 0 WHEN "official"."sites"."site_id" ILIKE $2 THEN 1 WHEN exists ' +
        'select "official"."permits"."id" from "official"."permits" where (("official"."permits"."official_site_id" = "official"."sites"."id") ' +
        'and ("official"."permits"."decision_number" ilike $3)) THEN 2 ELSE 3 END asc',
      '"official"."sites"."id" desc',
    ]);
    expect(decodeCursor(response.json().paging.nextCursor, z.unknown())).toEqual({ offset: 1 });

    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.sites", []);
    await injectMutation(route, { ...request, url: `/official/sites?q=bt_1&limit=1&cursor=${response.json().paging.nextCursor}` });

    expect(dbMock.calls.filter((call) => call.table === "official.sites")[1]?.clauses.offset).toEqual([1]);
  });

  it("sorts a search by another field when asked", async () => {
    await sitesFor("q=Warszawa&sort=-updatedAt");
    expect(renderedOrder()).toEqual(['"official"."sites"."updatedAt" desc', '"official"."sites"."id" desc']);
  });

  it("returns the newest sites first when sorting by relevance without q, and stops paging deep in the results", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.sites", [listed(31), listed(30)]);
    dbMock.enqueueFor("select", "stations_official_sites", []);

    const response = await injectMutation(route, { ...request, url: "/official/sites?sort=relevance&limit=1&offset=100000" });

    expect(renderedOrder()).toEqual(['"official"."sites"."id" desc']);
    expect(response.json().paging.nextCursor).toBeNull();
  });

  it("continues after the last site of a page and counts every match on request", async () => {
    scriptAdminVisibility();
    dbMock.enqueueFor("select", "official.sites", [listed(31, "1760054400000000"), listed(30, "1760054400000000")], [{ total: 9 }]);
    dbMock.enqueueFor("select", "stations_official_sites", []);

    const response = await injectMutation(route, { ...request, url: "/official/sites?sort=-updatedAt&limit=1&includeTotal=true" }, signInAs("admin"));

    expect(response.json().paging.total).toBe(9);
    expect(decodeCursor(response.json().paging.nextCursor, z.unknown())).toEqual({ sort: "-updatedAt", id: 31, key: "1760054400000000" });
    expect(tablesRead()).not.toContain("official.sources");
  });

  it.each([
    "limit=1001",
    "sort=name",
    "siteIds=",
    "siteIds=ABCDEFGHIJKLMNOPQ",
    "q=%20",
    "include=sites",
    "stationIds=abc",
    "keepOtherCountries=true",
  ])("rejects the invalid query %s before reading anything", async (query) => {
    expectError(await injectMutation(route, { ...request, url: `/official/sites?${query}` }), 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects a position cursor for a sorted list", async () => {
    const cursor = encodeCursor({ offset: 50 });
    expectError(await injectMutation(route, { ...request, url: `/official/sites?sort=-id&cursor=${cursor}` }), 400, "INVALID_QUERY");
    expect(dbMock.calls).toEqual([]);
  });
});
