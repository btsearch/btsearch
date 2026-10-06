import { ANALYZER_SUBMISSIONS_LIMIT } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

import { MAX_USER_LISTS } from "../../../../../src/features/lists/limits.js";
import type { ApiToken } from "../../../../../src/interfaces/fastify.interface.js";
import getMe from "../../../../../src/routes/v2/(get)/me/index.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { readDate, readUserId } from "../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

describe("getMe", () => {
  it("returns an editor's grants with sorted region ids and country-wide grants distinguished", async () => {
    const grantId = "123e4567-e89b-42d3-a456-426614174001";
    dbMock.enqueueFor("select", "users", [{ id: readUserId, username: "tester", name: "Test User", image: null, role: "editor" }]);
    dbMock.enqueueFor("select", "role_grants", [
      {
        id: grantId,
        userId: readUserId,
        role: "editor",
        countryCode: "PL",
        isCountryWide: false,
        grantedById: null,
        createdAt: readDate,
        updatedAt: readDate,
      },
      {
        id: "123e4567-e89b-42d3-a456-426614174002",
        userId: readUserId,
        role: "maintainer",
        countryCode: "US",
        isCountryWide: true,
        grantedById: null,
        createdAt: readDate,
        updatedAt: readDate,
      },
    ]);
    dbMock.enqueueFor("select", "role_grant_regions", [
      { grantId, regionId: 3 },
      { grantId, regionId: 1 },
    ]);
    const app = await createRouteHarness(getMe, { session: userSession(readUserId, "editor") });
    const response = await app.inject({ url: "/me" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.grants).toMatchObject([
      { role: "editor", countryCode: "PL", regionIds: [1, 3] },
      { role: "maintainer", countryCode: "US", regionIds: null },
    ]);
    expect(response.json().data.limits.analyzerChanges).toBeNull();
    expect(dbMock.calls.some((call) => call.table === "submissions")).toBe(false);
  });

  it.each(["admin", "user", "legacy"])("returns %s account limits without loading editor grants", async (role) => {
    const isStaff = role === "admin";
    const oldestAt = new Date(Date.now() - 60 * 60 * 1000);
    dbMock.enqueueFor("select", "users", [{ id: readUserId, username: "tester", name: "Test User", image: null, role }]);
    if (!isStaff) dbMock.enqueueFor("select", "submissions", [{ total: 31, oldestAt }]);
    const app = await createRouteHarness(getMe, { session: userSession(readUserId) });
    const response = await app.inject({ url: "/me" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      id: readUserId,
      role: role === "legacy" ? "user" : role,
      grants: [],
      limits: {
        lists: MAX_USER_LISTS,
        analyzerChanges: isStaff
          ? null
          : {
              limit: ANALYZER_SUBMISSIONS_LIMIT.max,
              remaining: ANALYZER_SUBMISSIONS_LIMIT.max - 31,
              resetsAt: new Date(oldestAt.getTime() + ANALYZER_SUBMISSIONS_LIMIT.windowHours * 60 * 60 * 1000).toISOString(),
            },
      },
    });
    expect(dbMock.calls.some((call) => call.table === "role_grants")).toBe(false);
    expect(dbMock.calls.some((call) => call.table === "submissions")).toBe(!isStaff);
  });

  it.each([
    { title: "no analyzer change in the window", recent: { total: 0, oldestAt: null }, remaining: ANALYZER_SUBMISSIONS_LIMIT.max, resets: false },
    { title: "more analyzer changes than the limit", recent: { total: 140, oldestAt: new Date() }, remaining: 0, resets: true },
  ])("reports the analyzer allowance with $title", async ({ recent, remaining, resets }) => {
    dbMock.enqueueFor("select", "users", [{ id: readUserId, username: "tester", name: "Test User", image: null, role: "user" }]);
    dbMock.enqueueFor("select", "submissions", [recent]);
    const app = await createRouteHarness(getMe, { session: userSession(readUserId) });
    const { analyzerChanges } = (await app.inject({ url: "/me" })).json().data.limits;
    expect(analyzerChanges).toMatchObject({ limit: ANALYZER_SUBMISSIONS_LIMIT.max, remaining });
    expect(analyzerChanges.resetsAt === null).toBe(!resets);
  });

  it("holds an API key back like a plain user, also when its owner is an administrator", async () => {
    dbMock.enqueueFor("select", "users", [{ id: readUserId, username: "tester", name: "Test User", image: null, role: "admin" }]);
    dbMock.enqueueFor("select", "submissions", [{ total: 0, oldestAt: null }]);
    const app = await createRouteHarness(getMe, { apiToken: { referenceId: readUserId } as unknown as ApiToken });
    const response = await app.inject({ url: "/me" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.limits.analyzerChanges).toMatchObject({ remaining: ANALYZER_SUBMISSIONS_LIMIT.max, resetsAt: null });
  });

  it.each([false, true])("requires an existing authenticated account (%s)", async (hasSession) => {
    if (hasSession) dbMock.enqueueFor("select", "users", []);
    const app = await createRouteHarness(getMe, hasSession ? { session: userSession(readUserId) } : {});
    expect((await app.inject({ url: "/me" })).statusCode).toBe(401);
  });
});
