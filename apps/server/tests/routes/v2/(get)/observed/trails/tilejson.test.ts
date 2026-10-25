import { describe, expect, it } from "vitest";

import { getRuntimeSettings, mergeRuntimeSettings } from "../../../../../../src/lib/runtimeSettings.js";
import getTrailTileJson from "../../../../../../src/routes/v2/(get)/observed/trails/tilejson.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";

describe("GET /observed/trails/tilejson", () => {
  it("puts your filters in the tile address in one order, so everyone asks for the same tiles", async () => {
    const response = await injectMutation(getTrailTileJson, {
      method: "GET",
      url: "/observed/trails/tilejson?operatorIds=9,7&rats=nr,lte&bandIds=unknown,20,3",
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=3600");
    expect(response.json()).toMatchObject({
      tilejson: "3.0.0",
      name: "Trails",
      attribution: "© BTSearch contributors, ODbL",
      tiles: ["http://localhost:3030/api/v2/observed/trails/{z}/{x}/{y}?operatorIds=7,9&rats=lte,nr&bandIds=3,20,unknown"],
      minzoom: 6,
      maxzoom: 14,
      vector_layers: [{ id: "trails", fields: expect.objectContaining({ operatorId: expect.any(String), level: expect.any(String) }) }],
    });
  });

  it("refuses everyone while observations are off", async () => {
    Object.assign(getRuntimeSettings(), mergeRuntimeSettings(getRuntimeSettings(), { observationsEnabled: false }));

    expectError(await injectMutation(getTrailTileJson, { method: "GET", url: "/observed/trails/tilejson?operatorIds=7" }), 403, "FEATURE_DISABLED");
  });
});
