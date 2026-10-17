import { describe, expect, it } from "vitest";

import route from "../../../../../../../src/routes/v2/(put)/official/sites/[id]/watch.js";
import { dbMock, userSession } from "../../../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../../../helpers/mutationAssertions.js";
import { expectDocumented, officialSiteRows, scriptUserVisibility } from "../../../../../../helpers/officialDataFixtures.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const request = { method: "PUT" as const, url: "/official/sites/31/watch" };

function writes() {
  return dbMock.calls.filter((call) => call.operation === "insert" && call.table === "official.site_watches");
}

describe("PUT /official/sites/:id/watch", () => {
  it("is documented and needs an account rather than a permission", () => {
    expectDocumented(route);
    expect(route.config).not.toHaveProperty("permissions");
  });

  it("requires an account", async () => {
    expectError(await injectMutation(route, request), 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it.each([
    ["does not exist", [1]],
    ["belongs to a hidden source", []],
  ])("answers 404 for a site that %s and writes nothing", async (_case, sourceIds) => {
    scriptUserVisibility(sourceIds);
    dbMock.enqueueFor("select", "official.sites", []);

    expectError(await injectMutation(route, request, { session: userSession(ownerId) }), 404, "NOT_FOUND");
    expect(writes()).toEqual([]);
  });

  it("watches the site, and watching it again changes nothing", async () => {
    const watch = async () => {
      scriptUserVisibility();
      dbMock.enqueueFor("select", "official.sites", [officialSiteRows]);
      dbMock.enqueueFor("insert", "official.site_watches", []);
      return injectMutation(route, request, { session: userSession(ownerId) });
    };

    expect((await watch()).statusCode).toBe(204);
    expect((await watch()).statusCode).toBe(204);
    expect(writes().map((call) => call.values)).toEqual([
      { userId: ownerId, officialSiteId: 31 },
      { userId: ownerId, officialSiteId: 31 },
    ]);
    expect(writes().every((call) => call.clauses.onConflictDoNothing !== undefined)).toBe(true);
  });

  it.each(["0", "abc"])("rejects the site id %s before reading anything", async (id) => {
    const response = await injectMutation(route, { ...request, url: `/official/sites/${id}/watch` }, { session: userSession(ownerId) });
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
