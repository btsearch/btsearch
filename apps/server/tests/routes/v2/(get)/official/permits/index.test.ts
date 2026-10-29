import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { decodeCursor } from "../../../../../../src/lib/cursor.js";
import route from "../../../../../../src/routes/v2/(get)/official/permits/index.js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import {
  expectDocumented,
  officialPermitRows,
  officialSectorRow,
  scriptAdminVisibility,
  scriptGuestVisibility,
  servedLocation,
  servedPermit,
  servedSector,
  servedSite,
  tablesRead,
} from "../../../../../helpers/officialDataFixtures.js";
import { signInAs } from "../../../../../helpers/officialFixtures.js";

const request = { method: "GET" as const, url: "/official/permits" };

function listed(id: number, key: string | null = null) {
  return { ...officialPermitRows, permit: { ...officialPermitRows.permit, id }, key };
}

async function permitsFor(query: string, hidden: string[] = []) {
  scriptGuestVisibility([1], hidden);
  dbMock.enqueueFor("select", "official.permits", []);
  const response = await injectMutation(route, { ...request, url: `/official/permits?${query}` });
  expect(response.statusCode, response.body).toBe(200);
  return whereQuery("official.permits", "select").params;
}

describe("GET /official/permits", () => {
  it("is documented for guests with the permit permission", () => {
    expectDocumented(route);
    expect(route.config).toMatchObject({ permissions: ["read:official_permits"], allowGuestAccess: true });
  });

  it("returns a guest the permits of public sources with their datasets, newest first", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.permits", [listed(41)]);
    dbMock.enqueueFor("select", "official.permit_listings", [
      { permitId: 41, key: "device-registry" },
      { permitId: 41, key: "permits" },
    ]);

    const response = await injectMutation(route, request);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      data: [{ ...servedPermit, datasets: ["device-registry", "permits"] }],
      paging: { limit: 50, nextCursor: null },
    });
    expect(whereQuery("official.permits", "select").params).toEqual([1]);
    expect(tablesRead()).toEqual(["official.permits", "official.permit_listings"]);
  });

  it("includes the sectors and the site with its location and its linked station", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.permits", [listed(41)]);
    dbMock.enqueueFor("select", "official.permit_listings", []);
    dbMock.enqueueFor("select", "official.permit_sectors", [officialSectorRow]);
    dbMock.enqueueFor("select", "stations_official_sites", [{ officialSiteId: 31, stationId: 5 }]);

    const response = await injectMutation(route, { ...request, url: "/official/permits?include=sectors,officialSite.location" });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toEqual([
      { ...servedPermit, sectors: [servedSector], officialSite: { ...servedSite, stationId: 5, location: servedLocation } },
    ]);
    expect(whereQuery("stations_official_sites", "select").params).toEqual([31]);
  });

  it("lists a station's permits, finding nothing for a station in a country hidden from the caller", async () => {
    expect(await permitsFor("stationIds=12", ["XX"])).toEqual([1, "XX", 12, "XX"]);
  });

  it.each([
    ["officialSiteIds=31,32", [31, 32]],
    ["siteIds=BT12345", ["BT12345"]],
    ["operatorIds=4", [4, 4, "jv_member"]],
    ["bandLabels=900", [900]],
    ["rats=gsm", ["GSM", "commercial"]],
    ["kinds=permit,permitChange,inventory", ["permit", "permit_change", "permit", "inventory"]],
    ["kinds=registration", ["registration"]],
    ["kinds=license", ["licence"]],
    ["countryCodes=PL", ["PL"]],
    ["regionIds=7", [7]],
    ["sourceKeys=pl-uke", ["pl-uke"]],
    ["bbox=14,49,24,55", [14, 49, 24, 55]],
  ])("filters the permits with %s", async (query, params) => {
    expect(await permitsFor(query)).toEqual([1, ...params]);
  });

  it("finds the permits a dataset lists", async () => {
    expect(await permitsFor("datasetKeys=device-registry")).toEqual([1, "device-registry"]);
  });

  it("searches permit numbers for the text or a close resemblance, with wildcards taken literally", async () => {
    expect(await permitsFor("q=UKE/1_3%25")).toEqual([1, "%UKE/1\\_3\\%%", "UKE/1_3%", "UKE/1_3%", 0.6]);
  });

  it("refuses unlinked permits to a guest before reading anything", async () => {
    expectError(await injectMutation(route, { ...request, url: "/official/permits?isLinked=false" }), 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toEqual([]);
  });

  it("refuses unlinked permits to a user without the permission", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });

    const response = await injectMutation(route, { ...request, url: "/official/permits?isLinked=false" }, { session: userSession() });

    expectError(response, 403, "INSUFFICIENT_PERMISSIONS");
    expect(authBoundary.auth.api.userHasPermission).toHaveBeenCalledWith({
      body: { userId: userSession().user.id, permissions: { official_permits: ["read_unassigned"] } },
    });
    expect(dbMock.calls).toEqual([]);
  });

  it("lists the unlinked permits for an editor", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.permits", []);

    const response = await injectMutation(route, { ...request, url: "/official/permits?isLinked=false" }, signInAs("editor"));

    expect(response.statusCode, response.body).toBe(200);
  });

  it("continues after the last permit of a page and counts every match on request", async () => {
    scriptAdminVisibility();
    dbMock.enqueueFor("select", "official.permits", [listed(42, "1760054400000000"), listed(41, "1760054400000000")], [{ total: 3 }]);
    dbMock.enqueueFor("select", "official.permit_listings", []);

    const url = "/official/permits?sort=-updatedAt&limit=1&includeTotal=true";
    const response = await injectMutation(route, { ...request, url }, signInAs("admin"));

    expect(response.json().paging.total).toBe(3);
    expect(decodeCursor(response.json().paging.nextCursor, z.unknown())).toEqual({ sort: "-updatedAt", id: 42, key: "1760054400000000" });
    expect(dbMock.calls.find((call) => call.table === "official.permits")?.clauses.where).toEqual([undefined]);
  });

  it.each([
    "limit=201",
    "sort=createdAt",
    "kinds=decision",
    "isLinked=maybe",
    "include=location",
    "datasetKeys=",
    "rats=gsm-r",
    "decision_number=1",
    "cursor=abc&offset=2",
  ])("rejects the invalid query %s before reading anything", async (query) => {
    expectError(await injectMutation(route, { ...request, url: `/official/permits?${query}` }), 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
