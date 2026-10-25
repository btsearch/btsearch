import { describe, expect, it } from "vitest";

import getMyTrailTileJson from "../../../../../../../src/routes/v2/(get)/observed/trails/mine/tilejson.js";
import { injectMutation } from "../../../../../../helpers/mutationAssertions.js";
import { signInAs } from "../../../../../../helpers/officialFixtures.js";

describe("GET /observed/trails/mine/tilejson", () => {
  it("gives the zooms your squares stop getting finer at, and names the operator field", async () => {
    const response = await injectMutation(
      getMyTrailTileJson,
      { method: "GET", url: "/observed/trails/mine/tilejson?rats=nr,lte" },
      signInAs("admin"),
    );

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      tiles: ["http://localhost:3030/api/v2/observed/trails/mine/{z}/{x}/{y}?rats=lte,nr"],
      minzoom: 6,
      maxzoom: 12,
      vector_layers: [{ id: "trails", fields: expect.objectContaining({ plmn: expect.any(String), operatorId: expect.any(String) }) }],
    });
  });
});
