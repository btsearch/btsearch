import { afterEach, describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(put)/measurements/terms.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { crowdSettingsRow, setMeasurementUploads } from "../../../../helpers/measurementFixtures.js";
import { expectError, injectMutation } from "../../../../helpers/mutationAssertions.js";

const userId = userSession().user.id;

afterEach(() => setMeasurementUploads(false));

describe("PUT /measurements/terms", () => {
  it("is closed while uploads are switched off", async () => {
    const response = await injectMutation(route, { method: "PUT", url: "/measurements/terms", payload: { version: 2 } }, { session: userSession() });
    expectError(response, 403, "FEATURE_DISABLED");
  });

  it("records the person as a contributor who accepted the current version", async () => {
    setMeasurementUploads(true);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    dbMock.enqueueFor("insert", "contributors", []);
    dbMock.enqueueFor("insert", "terms_acceptances", []);
    const response = await injectMutation(route, { method: "PUT", url: "/measurements/terms", payload: { version: 2 } }, { session: userSession() });
    expect(response.statusCode).toBe(204);
    expect(dbMock.calls.filter((call) => call.operation === "insert").map((call) => [call.table, call.values])).toEqual([
      ["contributors", { userId }],
      ["terms_acceptances", { userId, version: 2 }],
    ]);
  });

  it("refuses a version that is not the current one", async () => {
    setMeasurementUploads(true);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    const response = await injectMutation(route, { method: "PUT", url: "/measurements/terms", payload: { version: 1 } }, { session: userSession() });
    expectError(response, 409, "CONFLICT", "The current contributor terms are version 2");
  });
});
