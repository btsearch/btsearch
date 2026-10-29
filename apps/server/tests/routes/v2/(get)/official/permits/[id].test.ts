import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(get)/official/permits/[id].js";
import { authBoundary, dbMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";
import {
  expectDocumented,
  officialPermitRows,
  renderedWhere,
  scriptAdminVisibility,
  scriptGuestVisibility,
  servedLocation,
  servedPermit,
  servedSite,
} from "../../../../../helpers/officialDataFixtures.js";
import { signInAs } from "../../../../../helpers/officialFixtures.js";

const request = { method: "GET" as const, url: "/official/permits/41" };

describe("GET /official/permits/:id", () => {
  it("is documented for guests with the permit permission", () => {
    expectDocumented(route);
    expect(route.config).toMatchObject({ permissions: ["read:official_permits"], allowGuestAccess: true });
  });

  it("returns a guest any public permit, linked or not, with its site", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.permits", [officialPermitRows]);
    dbMock.enqueueFor("select", "official.permit_listings", [{ permitId: 41, key: "permits" }]);
    dbMock.enqueueFor("select", "stations_official_sites", []);

    const response = await injectMutation(route, { ...request, url: "/official/permits/41?include=officialSite" });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ data: { ...servedPermit, datasets: ["permits"], officialSite: servedSite } });
    expect(renderedWhere("official.permits")).toEqual({
      sql:
        '(("official"."permits"."id" = $1) and (exists select "public_location"."id" from "public_location" ' +
        'where (("public_location"."id" = "official"."locations"."id") and ("public_location"."source_id" in ($2)))))',
      params: [41, 1],
    });
    expect(authBoundary.auth.api.userHasPermission).not.toHaveBeenCalled();
  });

  it.each([
    ["a permit that does not exist", [1]],
    ["a permit of a hidden source", []],
  ])("answers 404 for %s", async (_case, sourceIds) => {
    scriptGuestVisibility(sourceIds);
    dbMock.enqueueFor("select", "official.permits", []);

    expectError(await injectMutation(route, request), 404, "NOT_FOUND");
    expect(dbMock.calls.map((call) => call.table)).not.toContain("official.permit_listings");
  });

  it("shows an administrator a permit of a hidden source", async () => {
    scriptAdminVisibility();
    dbMock.enqueueFor("select", "official.permits", [officialPermitRows]);
    dbMock.enqueueFor("select", "official.permit_listings", []);

    const response = await injectMutation(route, request, signInAs("admin"));

    expect(response.json().data).toEqual(servedPermit);
    expect(renderedWhere("official.permits")).toEqual({ sql: '"official"."permits"."id" = $1', params: [41] });
  });

  it("takes the kind of a permit without a decision from its dataset, and passes on its status", async () => {
    const inventoryRows = {
      ...officialPermitRows,
      location: { ...officialPermitRows.location, precision_meters: 31, source_ref: "23444" },
      site: { ...officialPermitRows.site, station_id: null, source_ref: "0032750221" },
      permit: {
        ...officialPermitRows.permit,
        decision_number: null,
        decision_type: null,
        expiry_date: null,
        rat: null,
        label_mhz: null,
        label_variant: null,
        status: "in_service",
      },
    };
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.permits", [inventoryRows]);
    dbMock.enqueueFor("select", "official.permit_listings", [{ permitId: 41, key: "mobile-networks", permitKind: "inventory" }]);
    dbMock.enqueueFor("select", "stations_official_sites", []);

    const response = await injectMutation(route, { ...request, url: "/official/permits/41?include=officialSite.location" });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toEqual({
      ...servedPermit,
      number: null,
      kind: "inventory",
      expiresOn: null,
      status: "inService",
      label: { rat: null, labelMhz: null, variant: null, name: null },
      datasets: ["mobile-networks"],
      officialSite: {
        ...servedSite,
        siteId: null,
        sourceRef: "0032750221",
        location: { ...servedLocation, precisionMeters: 31, sourceRef: "23444" },
      },
    });
  });

  it("keeps the kind of a permit's decision over its dataset's kind", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.permits", [officialPermitRows]);
    dbMock.enqueueFor("select", "official.permit_listings", [{ permitId: 41, key: "device-registry", permitKind: "registration" }]);

    const response = await injectMutation(route, request);

    expect(response.json().data).toMatchObject({ kind: "permitChange", datasets: ["device-registry"] });
  });

  it.each(["/official/permits/0", "/official/permits/41?include=officialSite.location.region", "/official/permits/41?isLinked=false"])(
    "rejects %s",
    async (url) => {
      expectError(await injectMutation(route, { ...request, url }), 400, "VALIDATION_ERROR");
      expect(dbMock.calls).toEqual([]);
    },
  );
});
