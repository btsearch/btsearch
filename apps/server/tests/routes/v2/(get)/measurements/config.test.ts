import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(get)/measurements/config.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { setMeasurementUploads } from "../../../../helpers/measurementFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

describe("GET /measurements/config", () => {
  it("tells the app the minimum version, the terms version and whether uploads are on", async () => {
    setMeasurementUploads(true);
    dbMock.enqueueFor("select", "crowd_settings", [
      { id: 1, rawRetentionDays: 365, rawStorageBudgetGb: 100, minAppVersionCode: 140, termsVersion: 3, updatedAt: new Date(), updatedById: null },
    ]);
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "GET", url: "/measurements/config" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ uploadsEnabled: true, minAppVersionCode: 140, termsVersion: 3 });
  });
});
