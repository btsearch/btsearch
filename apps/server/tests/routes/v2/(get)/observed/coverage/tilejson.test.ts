import { describe, expect, it } from "vitest";

import { getRuntimeSettings, mergeRuntimeSettings } from "../../../../../../src/lib/runtimeSettings.js";
import getCoverageTileJson from "../../../../../../src/routes/v2/(get)/observed/coverage/tilejson.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";

describe("GET /observed/coverage/tilejson", () => {
  it("puts the cells in the tile address sorted, from zoom 12", async () => {
    const response = await injectMutation(getCoverageTileJson, { method: "GET", url: "/observed/coverage/tilejson?observedCellIds=50412,50411" });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      name: "Coverage",
      tiles: ["http://localhost:3030/api/v2/observed/coverage/{z}/{x}/{y}?observedCellIds=50411,50412"],
      minzoom: 12,
      maxzoom: 14,
      vector_layers: [{ id: "coverage", fields: expect.objectContaining({ observedCellId: expect.any(String), sinr: expect.any(String) }) }],
    });
  });

  it("refuses everyone while observations are off", async () => {
    Object.assign(getRuntimeSettings(), mergeRuntimeSettings(getRuntimeSettings(), { observationsEnabled: false }));

    expectError(
      await injectMutation(getCoverageTileJson, { method: "GET", url: "/observed/coverage/tilejson?observedCellIds=1" }),
      403,
      "FEATURE_DISABLED",
    );
  });
});
