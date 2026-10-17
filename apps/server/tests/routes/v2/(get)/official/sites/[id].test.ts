import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(get)/official/sites/[id].js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";
import {
  expectDocumented,
  officialPermitRow,
  officialSiteRows,
  renderedWhere,
  scriptAdminVisibility,
  scriptGuestVisibility,
  servedLocation,
  servedPermit,
  servedSite,
  tablesRead,
} from "../../../../../helpers/officialDataFixtures.js";
import { signInAs } from "../../../../../helpers/officialFixtures.js";

const request = { method: "GET" as const, url: "/official/sites/31" };
const PUBLIC_SITE =
  '(("official"."sites"."id" = $1) and (exists select "public_location"."id" from "public_location" ' +
  'where (("public_location"."id" = "official"."locations"."id") and ("public_location"."source_id" in ($2)))))';

describe("GET /official/sites/:id", () => {
  it("is documented for guests with the permit permission", () => {
    expectDocumented(route);
    expect(route.config).toMatchObject({ permissions: ["read:official_permits"], allowGuestAccess: true });
  });

  it("returns a public site with the stations linked to it, inactive ones last", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.sites", [officialSiteRows]);
    dbMock.enqueueFor("select", "stations_permits", [
      { ownerId: 31, id: 12 },
      { ownerId: 31, id: 3 },
    ]);

    const response = await injectMutation(route, request);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ data: { ...servedSite, stationIds: [12, 3] } });
    expect(renderedWhere("official.sites")).toEqual({ sql: PUBLIC_SITE, params: [31, 1] });
    expect(tablesRead()).not.toContain("official.permits");
  });

  it("includes the location and every permit of the site, with a stored expiry day as it is and none as null", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.sites", [officialSiteRows]);
    dbMock.enqueueFor("select", "stations_permits", []);
    const neverExpiring = { ...officialPermitRow, id: 42, expiry_date: null };
    dbMock.enqueueFor("select", "official.permits", [
      { permit: officialPermitRow, sourceKey: "pl-uke" },
      { permit: neverExpiring, sourceKey: "pl-uke" },
    ]);
    dbMock.enqueueFor("select", "official.permit_listings", [
      { permitId: 41, key: "permits" },
      { permitId: 42, key: "device-registry" },
    ]);

    const response = await injectMutation(route, { ...request, url: "/official/sites/31?include=location,permits" });

    expect(response.json().data).toEqual({
      ...servedSite,
      location: servedLocation,
      permits: [
        { ...servedPermit, expiresOn: "2030-06-30", datasets: ["permits"] },
        { ...servedPermit, id: 42, expiresOn: null, datasets: ["device-registry"] },
      ],
    });
    expect(tablesRead()).not.toContain("official.permit_sectors");
  });

  it.each([
    ["a site that does not exist", [1]],
    ["a site of a hidden source", []],
  ])("answers 404 for %s, with nothing read alongside it in the answer", async (_case, sourceIds) => {
    scriptGuestVisibility(sourceIds);
    dbMock.enqueueFor("select", "official.sites", []);
    dbMock.enqueueFor("select", "stations_permits", [{ ownerId: 31, id: 12 }]);
    dbMock.enqueueFor("select", "official.permits", [{ permit: officialPermitRow, sourceKey: "pl-uke" }]);
    dbMock.enqueueFor("select", "official.permit_listings", [{ permitId: 41, key: "device-registry" }]);

    const response = await injectMutation(route, { ...request, url: "/official/sites/31?include=location,permits" });

    expectError(response, 404, "NOT_FOUND");
    expect(Object.keys(response.json())).toEqual(["errors"]);
    expect(response.body).not.toMatch(/BT12345|UKE\/123\/2026|device-registry/);
  });

  it("shows an administrator a site of a hidden source", async () => {
    scriptAdminVisibility();
    dbMock.enqueueFor("select", "official.sites", [officialSiteRows]);
    dbMock.enqueueFor("select", "stations_permits", []);

    const response = await injectMutation(route, request, signInAs("admin"));

    expect(response.json().data).toEqual(servedSite);
    expect(renderedWhere("official.sites")).toEqual({ sql: '"official"."sites"."id" = $1', params: [31] });
  });

  it.each(["/official/sites/0", "/official/sites/31?include=sites", "/official/sites/31?rats=lte"])("rejects %s", async (url) => {
    expectError(await injectMutation(route, { ...request, url }), 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
