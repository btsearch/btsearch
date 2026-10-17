import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../../src/routes/v2/(get)/official/locations/[id].js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";
import {
  expectDocumented,
  officialLocationRows,
  officialSiteRows,
  regionRow,
  renderedWhere,
  scriptAdminVisibility,
  scriptGuestVisibility,
  servedLocation,
  servedSite,
  tablesRead,
} from "../../../../../helpers/officialDataFixtures.js";
import { signInAs } from "../../../../../helpers/officialFixtures.js";

const request = { method: "GET" as const, url: "/official/locations/21" };

describe("GET /official/locations/:id", () => {
  it("is documented for guests with the permit permission", () => {
    expectDocumented(route);
    expect(route.config).toMatchObject({ permissions: ["read:official_permits"], allowGuestAccess: true });
  });

  it("returns a public location with its region", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.locations", [officialLocationRows]);

    const response = await injectMutation(route, { ...request, url: "/official/locations/21?include=region" });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ data: { ...servedLocation, region: regionRow } });
    expect(renderedWhere("official.locations")).toEqual({
      sql:
        '(("official"."locations"."id" = $1) and (exists select "public_location"."id" from "public_location" ' +
        'where (("public_location"."id" = "official"."locations"."id") and ("public_location"."source_id" in ($2)))))',
      params: [21, 1],
    });
  });

  it.each([
    ["a location that does not exist", [1], []],
    ["a location of a hidden source or in a hidden country", [], []],
  ])("answers 404 for %s", async (_case, sourceIds, hidden) => {
    scriptGuestVisibility(sourceIds, hidden);
    dbMock.enqueueFor("select", "official.locations", []);

    expectError(await injectMutation(route, request), 404, "NOT_FOUND");
    expect(tablesRead()).not.toContain("official.sites");
  });

  it("shows an administrator a location of a hidden source", async () => {
    scriptAdminVisibility();
    dbMock.enqueueFor("select", "official.locations", [officialLocationRows]);

    const response = await injectMutation(route, request, signInAs("admin"));

    expect(response.json().data).toEqual(servedLocation);
    expect(renderedWhere("official.locations")).toEqual({ sql: '"official"."locations"."id" = $1', params: [21] });
  });

  it("narrows its sites with the site filters, never the location itself", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.locations", [officialLocationRows]);
    dbMock.enqueueFor("select", "official.sites", [officialSiteRows]);
    dbMock.enqueueFor("select", "stations_permits", [{ ownerId: 31, id: 5 }]);

    const response = await injectMutation(route, { ...request, url: "/official/locations/21?include=sites&operatorIds=4&bandLabels=800" });

    expect(response.json().data).toEqual({ ...servedLocation, sites: [{ ...servedSite, stationIds: [5] }] });
    expect(renderedWhere("official.locations").sql).not.toContain("official.sites");
    const sites = renderedWhere("official.sites");
    expect(sites.sql).toContain('"official"."sites"."operator_id" in ($2)');
    expect(sites.sql).toContain('"official"."permits"."label_mhz" in ($5)');
    expect(sites.params).toEqual([21, 4, 4, "jv_member", 800]);
  });

  it("takes the sites from a list", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue({ is_public: true, stations: { official: [31] }, radiolines: [] });
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.locations", [officialLocationRows]);
    dbMock.enqueueFor("select", "official.sites", []);

    const response = await injectMutation(route, { ...request, url: "/official/locations/21?include=sites&listId=list-1" });

    expect(response.json().data.sites).toEqual([]);
    expect(renderedWhere("official.sites").sql).toContain('"official"."sites"."id" in ($2)');
  });

  it("answers 404 for a list the caller cannot read", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue({ is_public: false, created_by: "someone-else", stations: { official: [31] } });
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.locations", [officialLocationRows]);

    expectError(await injectMutation(route, { ...request, url: "/official/locations/21?listId=list-1" }), 404, "NOT_FOUND");
  });

  it.each(["0", "abc"])("rejects the location id %s before reading anything", async (id) => {
    expectError(await injectMutation(route, { ...request, url: `/official/locations/${id}` }), 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });

  it.each(["include=stations", "limit=10", "rats=5g"])("rejects the invalid query %s", async (query) => {
    expectError(await injectMutation(route, { ...request, url: `/official/locations/21?${query}` }), 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
