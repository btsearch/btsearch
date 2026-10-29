import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { decodeCursor } from "../../../../../../src/lib/cursor.js";
import route from "../../../../../../src/routes/v2/(get)/official/licensees/index.js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import {
  cacheCountryVisibility,
  cacheSourcesOfTwoCountries,
  scriptAdminVisibility,
  scriptGuestVisibility,
} from "../../../../../helpers/officialDataFixtures.js";
import { licenseeRow, signInAs } from "../../../../../helpers/officialFixtures.js";

const request = { method: "GET" as const, url: "/official/licensees" };
const mapped = { ...licenseeRow, id: 6, name: "Other Networks", full_name: "Other Networks sp. z o.o.", operatorId: 4 };
const branded = { ...licenseeRow, id: 7, name: "Tower Links", full_name: "Tower Links GmbH", brandId: 3 };

function listed(licensee: typeof licenseeRow) {
  return { licensee, sourceKey: "test-register", key: licensee.name };
}

function asAdministrator() {
  scriptAdminVisibility();
  return signInAs("admin");
}

describe("GET /official/licensees", () => {
  it("returns the licensees with their source, both names, operator and own brand", async () => {
    dbMock.enqueueFor("select", "official.licensees", [listed(licenseeRow), listed(mapped), listed(branded)]);
    const response = await injectMutation(route, request, asAdministrator());
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      data: [
        { id: 5, sourceKey: "test-register", name: "Example Mobile", legalName: "Example Mobile S.A.", operatorId: null, brandId: null },
        { id: 6, sourceKey: "test-register", name: "Other Networks", legalName: "Other Networks sp. z o.o.", operatorId: 4, brandId: null },
        { id: 7, sourceKey: "test-register", name: "Tower Links", legalName: "Tower Links GmbH", operatorId: null, brandId: 3 },
      ],
      paging: { limit: 50, nextCursor: null },
    });
    expect(dbMock.calls.find((call) => call.table === "official.licensees")?.clauses.where).toEqual([undefined]);
  });

  it("filters by source and continues after the last name of a page", async () => {
    dbMock.enqueueFor("select", "official.licensees", [listed(licenseeRow), listed(mapped)]);
    const first = await injectMutation(route, { ...request, url: "/official/licensees?sourceKeys=test-register&limit=1" }, asAdministrator());
    const { nextCursor } = first.json().paging;
    expect(first.json().data).toHaveLength(1);
    expect(decodeCursor(nextCursor, z.unknown())).toEqual({ sort: "name", id: 5, key: "Example Mobile" });
    expect(whereQuery("official.licensees", "select").params).toEqual(["test-register"]);

    dbMock.enqueueFor("select", "official.licensees", []);
    await injectMutation(route, { ...request, url: `/official/licensees?limit=1&cursor=${nextCursor}` }, asAdministrator());
    expect(whereQuery("official.licensees", "select", 1).params).toEqual(["Example Mobile", 5]);
  });

  it("finds licensees by id, and takes up to 1000 of them in one page", async () => {
    dbMock.enqueueFor("select", "official.licensees", []);
    const response = await injectMutation(route, { ...request, url: "/official/licensees?ids=5,7&limit=1000" }, asAdministrator());
    expect(response.json()).toEqual({ data: [], paging: { limit: 1000, nextCursor: null } });
    expect(whereQuery("official.licensees", "select").params).toEqual([5, 7]);
    expect(dbMock.calls.find((call) => call.table === "official.licensees")?.clauses.limit).toEqual([1001]);
  });

  it.each(["hasOperator=no", "hasMicrowaveLinks=yes", "sourceIds=1", "limit=1001", "ids=0"])("rejects the invalid query %s", async (query) => {
    expectError(await injectMutation(route, { ...request, url: `/official/licensees?${query}` }, signInAs("admin")), 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });

  it.each([
    ["guest", ["XX"], [1]],
    ["editor", [], [1, 2]],
  ] as const)("gives a %s only the licensees of the visible sources in visible countries", async (viewer, hidden, sourceIds) => {
    cacheCountryVisibility([...hidden]);
    cacheSourcesOfTwoCountries();
    dbMock.enqueueFor("select", "official.licensees", [listed(licenseeRow)]);
    const response = await injectMutation(
      route,
      { ...request, url: "/official/licensees?hasMicrowaveLinks=true" },
      viewer === "guest" ? { runAuth: true } : signInAs(viewer),
    );
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toEqual([
      { id: 5, sourceKey: "test-register", name: "Example Mobile", legalName: "Example Mobile S.A.", operatorId: null, brandId: null },
    ]);
    expect(whereQuery("official.licensees", "select").params).toEqual(sourceIds);
  });

  it("matches no licensee for a guest when no source is visible", async () => {
    scriptGuestVisibility([]);
    dbMock.enqueueFor("select", "official.licensees", []);
    const response = await injectMutation(route, request, { runAuth: true });
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, nextCursor: null } });
  });
});
