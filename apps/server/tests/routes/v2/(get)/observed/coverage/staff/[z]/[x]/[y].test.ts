import { describe, expect, it } from "vitest";

import { getRuntimeSettings, mergeRuntimeSettings } from "../../../../../../../../../src/lib/runtimeSettings.js";
import getStaffCoverageTile from "../../../../../../../../../src/routes/v2/(get)/observed/coverage/staff/[z]/[x]/[y].js";
import { authBoundary, userSession } from "../../../../../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../../../../../helpers/mutationAssertions.js";
import { signInAs } from "../../../../../../../../helpers/officialFixtures.js";

function requestTile(options: Parameters<typeof injectMutation>[2]) {
  return injectMutation(getStaffCoverageTile, { method: "GET", url: "/observed/coverage/staff/11/1143/674?observedCellIds=50411" }, options);
}

describe("GET /observed/coverage/staff/:z/:x/:y", () => {
  it("refuses a user who is neither an editor nor an administrator", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });

    expectError(await requestTile({ session: userSession(undefined, "user") }), 403, "INSUFFICIENT_PERMISSIONS");
  });

  it("refuses an editor while observations are off, and answers an administrator then, never from a shared cache", async () => {
    Object.assign(getRuntimeSettings(), mergeRuntimeSettings(getRuntimeSettings(), { observationsEnabled: false }));

    expectError(await requestTile(signInAs("editor")), 403, "FEATURE_DISABLED");
    const response = await requestTile(signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });
});
