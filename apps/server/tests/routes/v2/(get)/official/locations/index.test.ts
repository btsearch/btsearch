import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { decodeCursor } from "../../../../../../src/lib/cursor.js";
import { getRuntimeSettings } from "../../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../../src/routes/v2/(get)/official/locations/index.js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";
import {
  expectDocumented,
  officialLocationRows,
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

const request = { method: "GET" as const, url: "/official/locations" };
const PUBLIC_LOCATION = '"official"."locations"."source_id" in ($1)';
const MATCHING_SITE =
  'exists select "official"."sites"."id" from "official"."sites" where (("official"."sites"."location_id" = "official"."locations"."id") and ';

function located(id: number) {
  return { ...officialLocationRows, location: { ...officialLocationRows.location, id }, key: null };
}

async function locationsFor(query: string) {
  scriptGuestVisibility([1]);
  dbMock.enqueueFor("select", "official.locations", []);
  const response = await injectMutation(route, { ...request, url: `/official/locations?${query}` });
  expect(response.statusCode, response.body).toBe(200);
  return renderedWhere("official.locations");
}

describe("GET /official/locations", () => {
  it("is documented for guests with the permit permission", () => {
    expectDocumented(route);
    expect(route.config).toMatchObject({ permissions: ["read:official_permits"], allowGuestAccess: true });
  });

  it("returns a guest the locations of public sources, newest first, without their sites", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.locations", [located(21)]);

    const response = await injectMutation(route, request);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ data: [servedLocation], paging: { limit: 50, nextCursor: null } });
    expect(renderedWhere("official.locations")).toEqual({ sql: PUBLIC_LOCATION, params: [1] });
    expect(dbMock.calls.find((call) => call.table === "official.locations")?.clauses.orderBy).toHaveLength(1);
    expect(tablesRead()).toEqual(["official.locations"]);
  });

  it("matches nothing for a guest while no source is public", async () => {
    scriptGuestVisibility([]);
    dbMock.enqueueFor("select", "official.locations", []);

    await injectMutation(route, request);

    expect(renderedWhere("official.locations").sql).toBe("false");
  });

  it("leaves out the locations in a country hidden from a guest", async () => {
    scriptGuestVisibility([1], ["XX"]);
    dbMock.enqueueFor("select", "official.locations", []);

    await injectMutation(route, request);

    const where = renderedWhere("official.locations");
    expect(where.sql).toContain('"regions"."country_code" not in ($2)');
    expect(where.params).toEqual([1, "XX"]);
  });

  it("shows an administrator the locations of every source", async () => {
    scriptAdminVisibility();
    dbMock.enqueueFor("select", "official.locations", [located(21)]);

    const response = await injectMutation(route, request, signInAs("admin"));

    expect(response.json().data).toEqual([servedLocation]);
    expect(() => renderedWhere("official.locations")).toThrow("No where condition");
  });

  it.each([
    ["bbox=14,49,24,55", "ST_Intersects"],
    ["countryCodes=PL,DE", '"regions"."country_code" in ($2, $3)'],
    ["regionIds=7", '"official"."locations"."region_id" in ($2)'],
    ["sourceKeys=pl-uke", '"official"."sources"."key" in ($2)'],
  ])("filters the locations themselves with %s", async (query, condition) => {
    const where = await locationsFor(query);
    expect(where.sql).toContain(condition);
    expect(where.sql).not.toContain(MATCHING_SITE);
  });

  it.each([
    ["operatorIds=4", '("official"."sites"."operator_id" in ($2) OR "official"."sites"."operator_id" in select "operator_links"'],
    ["operatorIds=4&keepOtherCountries=true", 'OR "regions"."country_code" not in select "operators"."country_code"'],
    ["bandLabels=800,1800", '"official"."sites"."id") and ("official"."permits"."label_mhz" in ($2, $3))'],
    ["createdAfter=2026-10-01T00:00:00Z", '"official"."sites"."createdAt" >= $2'],
    ["updatedAfter=2026-10-01T00:00:00Z", '"official"."sites"."updatedAt" >= $2'],
    ["changedAfter=2026-10-01T00:00:00Z", '("official"."sites"."createdAt" >= $2 OR "official"."sites"."updatedAt" >= $3)'],
  ])("returns only locations with a matching site for %s", async (query, condition) => {
    const where = await locationsFor(query);
    expect(where.sql).toContain(MATCHING_SITE);
    expect(where.sql).toContain(condition);
  });

  it("reads gsm as commercial GSM and gsmR as railway GSM, and other technologies whatever their band", async () => {
    const where = await locationsFor("rats=gsm,gsmR,lte");

    expect(where.sql).toContain(
      '(((("official"."permits"."rat" = $2) and ("official"."permits"."label_variant" = $3))) or ' +
        '((("official"."permits"."rat" = $4) and ("official"."permits"."label_variant" = $5))) or ("official"."permits"."rat" = $6))',
    );
    expect(where.params).toEqual([1, "GSM", "commercial", "GSM", "railway", "LTE"]);
  });

  it("needs a single permit to match both the technology and the band", async () => {
    const where = await locationsFor("rats=lte&bandLabels=800");

    expect(where.sql).toContain('and ((("official"."permits"."rat" = $2) and ("official"."permits"."label_mhz" in ($3))))');
  });

  it("returns only the locations with a site on the list", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue({ is_public: true, stations: { official: [31, 32] }, radiolines: [] });

    const where = await locationsFor("listId=list-1");

    expect(where.sql).toContain(`${MATCHING_SITE}("official"."sites"."id" in ($2, $3)))`);
  });

  it("returns nothing for a list without official sites", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue({ is_public: true, stations: { internal: [5] }, radiolines: [] });

    const where = await locationsFor("listId=list-1");

    expect(where.sql).toContain(`${MATCHING_SITE}(false))`);
  });

  it("refuses a list while lists are switched off", async () => {
    scriptGuestVisibility([1]);
    expectError(await injectMutation(route, { ...request, url: "/official/locations?listId=list-1" }), 403, "FEATURE_DISABLED");
  });

  it("includes the region, the matching sites, their matching permits and the permits' sectors", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.locations", [located(21)]);
    dbMock.enqueueFor("select", "official.sites", [officialSiteRows]);
    dbMock.enqueueFor("select", "stations_official_sites", [{ officialSiteId: 31, stationId: 5 }]);
    dbMock.enqueueFor("select", "official.permits", [{ permit: officialPermitRow, sourceKey: "pl-uke" }]);
    dbMock.enqueueFor("select", "official.permit_listings", [
      { permitId: 41, key: "device-registry" },
      { permitId: 41, key: "permits" },
    ]);
    dbMock.enqueueFor("select", "official.permit_sectors", [officialSectorRow]);

    const response = await injectMutation(route, {
      ...request,
      url: "/official/locations?rats=lte&include=region,sites.permits.sectors",
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toEqual([
      {
        ...servedLocation,
        region: regionRow,
        sites: [
          {
            ...servedSite,
            stationId: 5,
            permits: [{ ...servedPermit, datasets: ["device-registry", "permits"], sectors: [servedSector] }],
          },
        ],
      },
    ]);
    expect(renderedWhere("official.sites").sql).toContain('"official"."sites"."location_id" in ($1)');
    expect(renderedWhere("official.sites").sql).toContain('"official"."permits"."rat" = $2');
    expect(renderedWhere("official.permits").sql).toBe('(("official"."permits"."official_site_id" in ($1)) and ("official"."permits"."rat" = $2))');
  });

  it("includes the sites without their permits, and empty lists where nothing matched", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.locations", [located(21), located(22)]);
    dbMock.enqueueFor("select", "official.sites", [officialSiteRows]);
    dbMock.enqueueFor("select", "stations_official_sites", []);

    const response = await injectMutation(route, { ...request, url: "/official/locations?include=sites" });

    expect(response.json().data).toEqual([
      { ...servedLocation, sites: [servedSite] },
      { ...servedLocation, id: 22, sites: [] },
    ]);
    expect(tablesRead()).not.toContain("official.permits");
  });

  it("continues after the last location of a page and counts every match on request", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.locations", [located(22), located(21)], [{ total: 5 }]);

    const first = await injectMutation(route, { ...request, url: "/official/locations?limit=1&includeTotal=true" });
    const { nextCursor, total } = first.json().paging;

    expect(first.json().data).toHaveLength(1);
    expect(total).toBe(5);
    expect(decodeCursor(nextCursor, z.unknown())).toEqual({ sort: "-id", id: 22 });
    expect(renderedWhere("official.locations", 1)).toEqual({ sql: PUBLIC_LOCATION, params: [1] });

    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.locations", []);
    await injectMutation(route, { ...request, url: `/official/locations?limit=1&cursor=${nextCursor}` });

    expect(renderedWhere("official.locations", 2)).toEqual({ sql: `((${PUBLIC_LOCATION}) and ("official"."locations"."id" < $2))`, params: [1, 22] });
  });

  it("sorts by the time of the last change and skips by offset", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.locations", [
      { ...located(22), key: "1760054400000000" },
      { ...located(21), key: "1760054400000000" },
    ]);

    const response = await injectMutation(route, { ...request, url: "/official/locations?sort=updatedAt&limit=1&offset=10" });

    const page = dbMock.calls.find((call) => call.table === "official.locations");
    expect(page?.clauses.offset).toEqual([10]);
    expect(page?.clauses.limit).toEqual([2]);
    expect(decodeCursor(response.json().paging.nextCursor, z.unknown())).toEqual({ sort: "updatedAt", id: 22, key: "1760054400000000" });
  });

  it.each([
    "rats=gsm-r",
    "rats=GSM",
    "bandLabels=800MHz",
    "limit=1501",
    "sort=name",
    "include=stations",
    "cursor=abc&offset=1",
    "createdAfter=yesterday",
    "since=createdAt:7",
  ])("rejects the invalid query %s before reading anything", async (query) => {
    expectError(await injectMutation(route, { ...request, url: `/official/locations?${query}` }), 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects a cursor made for another sort", async () => {
    const cursor = Buffer.from(JSON.stringify({ sort: "-id", id: 22 })).toString("base64url");
    expectError(await injectMutation(route, { ...request, url: `/official/locations?sort=id&cursor=${cursor}` }), 400, "INVALID_QUERY");
    expect(dbMock.calls).toEqual([]);
  });
});
