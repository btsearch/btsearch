import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { decodeCursor } from "../../../../../../src/lib/cursor.js";
import { getRuntimeSettings } from "../../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../../src/routes/v2/(get)/official/locations/index.js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import {
  expectDocumented,
  officialLocationRows,
  officialPermitRow,
  officialSectorRow,
  officialSiteRows,
  regionRow,
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

function located(id: number) {
  return { ...officialLocationRows, location: { ...officialLocationRows.location, id }, key: null };
}

async function locationsFor(query: string) {
  scriptGuestVisibility([1]);
  dbMock.enqueueFor("select", "official.locations", []);
  const response = await injectMutation(route, { ...request, url: `/official/locations?${query}` });
  expect(response.statusCode, response.body).toBe(200);
  return whereQuery("official.locations", "select").params;
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
    expect(whereQuery("official.locations", "select").params).toEqual([1]);
    expect(dbMock.calls.find((call) => call.table === "official.locations")?.clauses.orderBy).toHaveLength(1);
    expect(tablesRead()).toEqual(["official.locations"]);
  });

  it("leaves out the locations in a country hidden from a guest", async () => {
    scriptGuestVisibility([1], ["XX"]);
    dbMock.enqueueFor("select", "official.locations", []);

    await injectMutation(route, request);

    expect(whereQuery("official.locations", "select").params).toEqual([1, "XX"]);
  });

  it("shows an administrator the locations of every source", async () => {
    scriptAdminVisibility();
    dbMock.enqueueFor("select", "official.locations", [located(21)]);

    const response = await injectMutation(route, request, signInAs("admin"));

    expect(response.json().data).toEqual([servedLocation]);
    expect(dbMock.calls.find((call) => call.table === "official.locations")?.clauses.where).toEqual([undefined]);
  });

  it.each([
    ["bbox=14,49,24,55", [14, 49, 24, 55]],
    ["countryCodes=PL,DE", ["PL", "DE"]],
    ["regionIds=7", [7]],
    ["sourceKeys=pl-uke", ["pl-uke"]],
    ["operatorIds=4", [4, 4, "jv_member"]],
    ["operatorIds=4&keepOtherCountries=true", [4, 4, "jv_member", 4, 4, "jv_member"]],
    ["bandLabels=800,1800", [800, 1800]],
    ["createdAfter=2026-10-01T00:00:00Z", ["2026-10-01T00:00:00.000Z"]],
    ["updatedAfter=2026-10-01T00:00:00Z", ["2026-10-01T00:00:00.000Z"]],
    ["changedAfter=2026-10-01T00:00:00Z", ["2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"]],
  ])("filters the locations with %s", async (query, params) => {
    expect(await locationsFor(query)).toEqual([1, ...params]);
  });

  it("reads gsm as commercial GSM and gsmR as railway GSM, and other technologies whatever their band", async () => {
    expect(await locationsFor("rats=gsm,gsmR,lte")).toEqual([1, "GSM", "commercial", "GSM", "railway", "LTE"]);
  });

  it("returns only the locations with a site on the list", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue({ is_public: true, stations: { official: [31, 32] }, radiolines: [] });

    expect(await locationsFor("listId=list-1")).toEqual([1, 31, 32]);
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
    expect(tablesRead()).not.toContain("official.permit_listings");
  });

  it("continues after the last location of a page and counts every match on request", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.locations", [located(22), located(21)], [{ total: 5 }]);

    const first = await injectMutation(route, { ...request, url: "/official/locations?limit=1&includeTotal=true" });
    const { nextCursor, total } = first.json().paging;

    expect(first.json().data).toHaveLength(1);
    expect(total).toBe(5);
    expect(decodeCursor(nextCursor, z.unknown())).toEqual({ sort: "-id", id: 22 });
    expect(whereQuery("official.locations", "select", 1).params).toEqual([1]);

    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.locations", []);
    await injectMutation(route, { ...request, url: `/official/locations?limit=1&cursor=${nextCursor}` });

    expect(whereQuery("official.locations", "select", 2).params).toEqual([1, 22]);
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
