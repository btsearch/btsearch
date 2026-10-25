import { describe, expect, it } from "vitest";

import getStaffTrailTile from "../../../../../../../../../src/routes/v2/(get)/observed/trails/staff/[z]/[x]/[y].js";
import { expectError, injectMutation } from "../../../../../../../../helpers/mutationAssertions.js";
import { signInAs } from "../../../../../../../../helpers/officialFixtures.js";

const request = { method: "GET" as const, url: "/observed/trails/staff/5/17/10?operatorIds=7" };

describe("GET /observed/trails/staff/:z/:x/:y", () => {
  it("answers an administrator, never cached", async () => {
    const response = await injectMutation(getStaffTrailTile, request, signInAs("admin"));

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("refuses an editor and an API key", async () => {
    expectError(await injectMutation(getStaffTrailTile, request, signInAs("editor")), 403, "INSUFFICIENT_PERMISSIONS");
    expectError(
      await injectMutation(getStaffTrailTile, { ...request, headers: { "x-api-key": "sk_test" } }, { runAuth: true }),
      403,
      "INSUFFICIENT_PERMISSIONS",
    );
  });
});
