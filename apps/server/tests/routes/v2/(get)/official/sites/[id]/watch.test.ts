import { describe, expect, it } from "vitest";

import route from "../../../../../../../src/routes/v2/(get)/official/sites/[id]/watch.js";
import { dbMock, userSession } from "../../../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../../../helpers/mutationAssertions.js";
import { expectDocumented, officialSiteRows, scriptUserVisibility } from "../../../../../../helpers/officialDataFixtures.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const request = { method: "GET" as const, url: "/official/sites/31/watch" };

describe("GET /official/sites/:id/watch", () => {
  it("is documented and needs an account rather than a permission", () => {
    expectDocumented(route);
    expect(route.config).not.toHaveProperty("permissions");
    expect(route.config).not.toHaveProperty("allowGuestAccess");
  });

  it("requires an account", async () => {
    expectError(await injectMutation(route, request), 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("hides a site that is not public, even from a user who watches it", async () => {
    scriptUserVisibility([]);
    dbMock.enqueueFor("select", "official.sites", []);
    dbMock.enqueueFor("select", "official.site_watches", [{ id: "watch-1" }]);

    expectError(await injectMutation(route, request, { session: userSession(ownerId) }), 404, "NOT_FOUND");
  });

  it.each([false, true])("reports a direct watch as %s", async (watched) => {
    scriptUserVisibility();
    dbMock.enqueueFor("select", "official.sites", [officialSiteRows]);
    dbMock.enqueueFor("select", "official.site_watches", watched ? [{ id: "watch-1" }] : []);

    const response = await injectMutation(route, request, { session: userSession(ownerId) });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ data: { isWatched: watched } });
  });

  it.each(["0", "-1", "1.5", "site"])("rejects the site id %s before reading anything", async (id) => {
    const response = await injectMutation(route, { ...request, url: `/official/sites/${id}/watch` }, { session: userSession(ownerId) });
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
