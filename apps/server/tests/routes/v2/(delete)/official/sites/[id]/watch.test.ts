import { describe, expect, it } from "vitest";

import route from "../../../../../../../src/routes/v2/(delete)/official/sites/[id]/watch.js";
import { dbMock, userSession } from "../../../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../../../helpers/mutationAssertions.js";
import { expectDocumented } from "../../../../../../helpers/officialDataFixtures.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const request = { method: "DELETE" as const, url: "/official/sites/31/watch" };

describe("DELETE /official/sites/:id/watch", () => {
  it("is documented and never answers 404", () => {
    expectDocumented(route);
    expect(route.config).toMatchObject({ errorReasons: { 404: null } });
  });

  it("requires an account", async () => {
    expectError(await injectMutation(route, request), 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("removes the account's watch without looking the site up, as often as it is asked", async () => {
    dbMock.enqueueFor("delete", "official.site_watches", [], []);

    const first = await injectMutation(route, request, { session: userSession(ownerId) });
    const second = await injectMutation(route, request, { session: userSession(ownerId) });

    expect([first.statusCode, second.statusCode]).toEqual([204, 204]);
    expect(dbMock.calls.map((call) => `${call.operation} ${call.table}`)).toEqual(["delete official.site_watches", "delete official.site_watches"]);
    expect(whereQuery("official.site_watches", "delete").params).toEqual([ownerId, 31]);
  });

  it.each(["0", "abc"])("rejects the site id %s before writing anything", async (id) => {
    const response = await injectMutation(route, { ...request, url: `/official/sites/${id}/watch` }, { session: userSession(ownerId) });
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
