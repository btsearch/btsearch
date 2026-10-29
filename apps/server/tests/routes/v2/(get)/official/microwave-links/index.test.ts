import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { decodeCursor } from "../../../../../../src/lib/cursor.js";
import { getRuntimeSettings } from "../../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../../src/routes/v2/(get)/official/microwave-links/index.js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { linkRow, scriptEquipment, servedLink } from "../../../../../helpers/microwaveLinkFixtures.js";
import { expectError, injectMutation, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import { scriptAdminVisibility, scriptGuestVisibility } from "../../../../../helpers/officialDataFixtures.js";
import { licenseeRow, signInAs } from "../../../../../helpers/officialFixtures.js";

const request = { method: "GET" as const, url: "/official/microwave-links" };

function listed(link: typeof linkRow, key: string | null = null) {
  return { link, sourceKey: "test-register", datasetKind: "permit", key };
}

function asGuest(publicSourceIds: number[] = [1]) {
  scriptGuestVisibility(publicSourceIds);
  return { runAuth: true };
}

function asAdministrator() {
  scriptAdminVisibility();
  return signInAs("admin");
}

function storedList(radiolines: number[] | null) {
  return { uuid: "list-1", is_public: true, created_by: "someone", stations: null, radiolines };
}

describe("GET /official/microwave-links", () => {
  it("serves a link with its permit, both ends and their equipment, newest first", async () => {
    dbMock.enqueueFor("select", "official.microwave_links", [listed(linkRow)]);
    scriptEquipment();
    const response = await injectMutation(route, request, asGuest());
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ data: [servedLink], paging: { limit: 50, nextCursor: null } });

    const read = dbMock.calls.find((call) => call.table === "official.microwave_links");
    expect(whereQuery("official.microwave_links", "select").params).toEqual([1]);
    expect(read?.clauses.limit).toEqual([51]);
    expect(whereQuery("official.microwave_link_antenna_types", "select").params).toEqual([3, 4]);
    expect(whereQuery("official.microwave_link_transmitter_types", "select").params).toEqual([7]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("does not filter by source for an administrator", async () => {
    dbMock.enqueueFor("select", "official.microwave_links", []);
    await injectMutation(route, request, asAdministrator());
    expect(dbMock.calls.find((call) => call.table === "official.microwave_links")?.clauses.where).toEqual([undefined]);
    expect(dbMock.calls.some((call) => call.table === "official.sources")).toBe(false);
  });

  it("finds permit numbers that contain or resemble the text, and takes exact ones as they are", async () => {
    dbMock.enqueueFor("select", "official.microwave_links", []);
    await injectMutation(route, { ...request, url: "/official/microwave-links?q=12%25_45&permitNumbers=1%2F2,3%2F4" }, asGuest());
    expect(whereQuery("official.microwave_links", "select").params).toEqual([1, "%12\\%\\_45%", "12%_45", "12%_45", 0.6, "1/2", "3/4"]);
  });

  it("narrows the links by licensee, source, kind, creation time and an area either end is in", async () => {
    dbMock.enqueueFor("select", "official.microwave_links", []);
    const query = "licenseeIds=5,6&sourceKeys=test-register&kinds=permit,registration&createdAfter=2026-10-01T00:00:00Z&bbox=20,52,22,53";
    await injectMutation(route, { ...request, url: `/official/microwave-links?${query}` }, asGuest());
    const area = [20, 52, 22, 53];
    expect(whereQuery("official.microwave_links", "select").params).toEqual([
      1,
      5,
      6,
      "test-register",
      "permit",
      "permit",
      "registration",
      "2026-10-01T00:00:00.000Z",
      ...area,
      ...area,
    ]);
  });

  it("serves and finds a link without a decision type under its dataset's kind", async () => {
    dbMock.enqueueFor("select", "official.microwave_links", [{ ...listed({ ...linkRow, decision_type: null }), datasetKind: "licence" }]);
    scriptEquipment();
    const response = await injectMutation(route, { ...request, url: "/official/microwave-links?kinds=license" }, asAdministrator());
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data[0].permit.kind).toBe("license");
    expect(whereQuery("official.microwave_links", "select").params).toEqual(["licence"]);
  });

  it("pages by creation time with a cursor and counts the matches on request", async () => {
    dbMock.enqueueFor(
      "select",
      "official.microwave_links",
      [listed(linkRow, "1759305600000000"), listed({ ...linkRow, id: 35 }, "1759305500000000")],
      [{ total: 9 }],
    );
    scriptEquipment();
    const response = await injectMutation(
      route,
      { ...request, url: "/official/microwave-links?sort=-createdAt&limit=1&includeTotal=true" },
      asAdministrator(),
    );
    expect(response.statusCode, response.body).toBe(200);
    const { data, paging } = response.json();
    expect(data.map((link: { id: number }) => link.id)).toEqual([36]);
    expect(paging.total).toBe(9);
    expect(decodeCursor(paging.nextCursor, z.unknown())).toEqual({ sort: "-createdAt", id: 36, key: "1759305600000000" });
  });

  it("includes the licensee, and null for a link the register names no licensee for", async () => {
    dbMock.enqueueFor("select", "official.microwave_links", [listed(linkRow), listed({ ...linkRow, id: 35, operator_id: null })]);
    scriptEquipment();
    dbMock.enqueueFor("select", "official.licensees", [{ licensee: licenseeRow, sourceKey: "test-register" }]);
    const response = await injectMutation(route, { ...request, url: "/official/microwave-links?include=licensee" }, asGuest());
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.map((link: { licensee: unknown }) => link.licensee)).toEqual([
      { id: 5, sourceKey: "test-register", name: "Example Mobile", legalName: "Example Mobile S.A.", operatorId: null, brandId: null },
      null,
    ]);
    expect(whereQuery("official.licensees", "select").params).toEqual([5]);
  });

  it("keeps to the links on a list", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue(storedList([36, 37]));
    dbMock.enqueueFor("select", "official.microwave_links", []);
    await injectMutation(route, { ...request, url: "/official/microwave-links?listId=list-1" }, asGuest());
    expect(whereQuery("official.microwave_links", "select").params).toEqual([1, 36, 37]);
  });

  it.each([
    { name: "no source is visible", publicSourceIds: [], listQuery: "" },
    { name: "the list holds no link", publicSourceIds: [1], listQuery: "&listId=list-1" },
  ])("answers an empty page without reading links when $name", async ({ publicSourceIds, listQuery }) => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue(storedList(null));
    const response = await injectMutation(
      route,
      { ...request, url: `/official/microwave-links?includeTotal=true${listQuery}` },
      asGuest(publicSourceIds),
    );
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, nextCursor: null, total: 0 } });
    expect(dbMock.calls.some((call) => call.table === "official.microwave_links")).toBe(false);
  });

  it.each(["limit=1001", "kinds=P", "sort=permitNumber", "cursor=abc&offset=10", "bbox=1,2,3", "unknown=1"])("rejects %s", async (query) => {
    const response = await injectMutation(route, { ...request, url: `/official/microwave-links?${query}` }, { runAuth: true });
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
