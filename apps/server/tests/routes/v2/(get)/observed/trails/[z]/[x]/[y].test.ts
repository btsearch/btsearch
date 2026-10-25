import { describe, expect, it } from "vitest";

import { getRuntimeSettings, mergeRuntimeSettings } from "../../../../../../../../src/lib/runtimeSettings.js";
import getTrailTile from "../../../../../../../../src/routes/v2/(get)/observed/trails/[z]/[x]/[y].js";
import { expectError, injectMutation } from "../../../../../../../helpers/mutationAssertions.js";
import { signInAs } from "../../../../../../../helpers/officialFixtures.js";

function setObservations(isEnabled: boolean): void {
  Object.assign(getRuntimeSettings(), mergeRuntimeSettings(getRuntimeSettings(), { observationsEnabled: isEnabled }));
}

function requestTile(path: string, options: Parameters<typeof injectMutation>[2] = { runAuth: true }) {
  return injectMutation(getTrailTile, { method: "GET", url: `/observed/trails/${path}` }, options);
}

describe("GET /observed/trails/:z/:x/:y", () => {
  it("answers an empty tile below zoom 6, cached for an hour for everyone", async () => {
    const response = await requestTile("5/17/10?operatorIds=7");

    expect(response.statusCode, response.body).toBe(200);
    expect(response.rawPayload).toHaveLength(0);
    expect(response.headers["content-type"]).toBe("application/vnd.mapbox-vector-tile");
    expect(response.headers["cache-control"]).toBe("public, max-age=3600, stale-while-revalidate=86400");
  });

  it("refuses everyone while observations are off, administrators too", async () => {
    setObservations(false);

    expectError(await requestTile("14/9148/5393?operatorIds=7"), 403, "FEATURE_DISABLED");
    expectError(await requestTile("14/9148/5393?operatorIds=7", signInAs("admin")), 403, "FEATURE_DISABLED");
  });
});
