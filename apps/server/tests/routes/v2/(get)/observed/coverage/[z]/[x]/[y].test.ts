import { describe, expect, it } from "vitest";

import { getRuntimeSettings, mergeRuntimeSettings } from "../../../../../../../../src/lib/runtimeSettings.js";
import getCoverageTile from "../../../../../../../../src/routes/v2/(get)/observed/coverage/[z]/[x]/[y].js";
import { expectError, injectMutation } from "../../../../../../../helpers/mutationAssertions.js";
import { signInAs } from "../../../../../../../helpers/officialFixtures.js";

function requestTile(path: string, options: Parameters<typeof injectMutation>[2] = { runAuth: true }) {
  return injectMutation(getCoverageTile, { method: "GET", url: `/observed/coverage/${path}` }, options);
}

describe("GET /observed/coverage/:z/:x/:y", () => {
  it("answers an empty tile below zoom 12, cached for an hour for everyone", async () => {
    const response = await requestTile("11/1143/674?observedCellIds=50411");

    expect(response.statusCode, response.body).toBe(200);
    expect(response.rawPayload).toHaveLength(0);
    expect(response.headers["cache-control"]).toBe("public, max-age=3600, stale-while-revalidate=86400");
  });

  it("refuses everyone while observations are off, administrators too", async () => {
    Object.assign(getRuntimeSettings(), mergeRuntimeSettings(getRuntimeSettings(), { observationsEnabled: false }));

    expectError(await requestTile("14/9148/5393?observedCellIds=50411"), 403, "FEATURE_DISABLED");
    expectError(await requestTile("14/9148/5393?observedCellIds=50411", signInAs("admin")), 403, "FEATURE_DISABLED");
  });
});
