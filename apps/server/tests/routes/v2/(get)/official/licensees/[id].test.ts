import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(get)/official/licensees/[id].js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import { scriptAdminVisibility, scriptGuestVisibility } from "../../../../../helpers/officialDataFixtures.js";
import { licenseeRow, signInAs } from "../../../../../helpers/officialFixtures.js";

const request = { method: "GET" as const, url: "/official/licensees/5" };

function listed(licensee: typeof licenseeRow) {
  return { licensee, sourceKey: "test-register", key: licensee.name };
}

describe("GET /official/licensees/:id", () => {
  it("returns the licensee to an administrator, whatever its source", async () => {
    scriptAdminVisibility();
    dbMock.enqueueFor("select", "official.licensees", [listed({ ...licenseeRow, operatorId: 4 })]);
    const response = await injectMutation(route, request, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      data: { id: 5, sourceKey: "test-register", name: "Example Mobile", legalName: "Example Mobile S.A.", operatorId: 4, brandId: null },
    });
    expect(whereQuery("official.licensees", "select")).toEqual({ sql: '"official"."licensees"."id" in ($1)', params: [5] });
  });

  it("returns a licensee of a visible source to a guest", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.licensees", [listed(licenseeRow)]);
    const response = await injectMutation(route, request, { runAuth: true });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ id: 5, sourceKey: "test-register" });
    expect(whereQuery("official.licensees", "select")).toEqual({
      sql: '(("official"."licensees"."source_id" in ($1)) and ("official"."licensees"."id" in ($2)))',
      params: [1, 5],
    });
  });

  it("returns 404 to an editor when the licensee is missing or its source is hidden", async () => {
    scriptGuestVisibility([2]);
    dbMock.enqueueFor("select", "official.licensees", []);
    expectError(await injectMutation(route, request, signInAs("editor")), 404, "NOT_FOUND");
    expect(whereQuery("official.licensees", "select").params).toEqual([2, 5]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("rejects an id that is not a positive whole number", async () => {
    expectError(await injectMutation(route, { ...request, url: "/official/licensees/0" }, signInAs("admin")), 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
