import { describe, expect, it } from "vitest";

import { getRuntimeSettings, mergeRuntimeSettings } from "../../../../../../../../../src/lib/runtimeSettings.js";
import { userRole } from "../../../../../../../../../src/plugins/auth/permissions.js";
import getMyTrailTile from "../../../../../../../../../src/routes/v2/(get)/observed/trails/mine/[z]/[x]/[y].js";
import { authBoundary, userSession } from "../../../../../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../../../../../helpers/mutationAssertions.js";
import { signInAs } from "../../../../../../../../helpers/officialFixtures.js";

const request = { method: "GET" as const, url: "/observed/trails/mine/5/17/10" };

function signInAsUser() {
  const session = userSession(undefined, "user");
  authBoundary.getCurrentUser.mockResolvedValue(session);
  authBoundary.auth.api.userHasPermission.mockImplementation(async (input) => {
    const { permissions } = (input as { body: { permissions: Parameters<typeof userRole.authorize>[0] } }).body;
    return userRole.authorize(permissions);
  });
  return { session, runAuth: true };
}

describe("GET /observed/trails/mine/:z/:x/:y", () => {
  it("answers a signed-in person privately, for a minute", async () => {
    const response = await injectMutation(getMyTrailTile, request, signInAsUser());

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, max-age=60");
  });

  it("refuses a guest and an API key", async () => {
    expectError(await injectMutation(getMyTrailTile, request, { runAuth: true }), 401, "UNAUTHORIZED");
    expectError(
      await injectMutation(getMyTrailTile, { ...request, headers: { "x-api-key": "sk_test" } }, { runAuth: true }),
      403,
      "INSUFFICIENT_PERMISSIONS",
    );
  });

  it("keeps your own trails to administrators while observations are off", async () => {
    Object.assign(getRuntimeSettings(), mergeRuntimeSettings(getRuntimeSettings(), { observationsEnabled: false }));

    expectError(await injectMutation(getMyTrailTile, request, signInAsUser()), 403, "FEATURE_DISABLED");
    expect((await injectMutation(getMyTrailTile, request, signInAs("admin"))).statusCode).toBe(200);
  });
});
