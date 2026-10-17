import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import getPreferences from "../../../../src/routes/v1/(get)/push/preferences.js";
import patchSubscribe from "../../../../src/routes/v1/(patch)/push/subscribe.js";
import { dbMock, userSession } from "../../../helpers/boundaries.js";
import { injectMutation } from "../../../helpers/mutationAssertions.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id = "11111111-1111-4111-8111-111111111111";
const options = { session: userSession(ownerId) };

describe("v1 push preferences keep the name ukeUpdates", () => {
  it.each([
    { stored: { officialDataUpdates: true }, ukeUpdates: true },
    { stored: {}, ukeUpdates: false },
  ])("answers GET /push/preferences with the stored officialDataUpdates as ukeUpdates: $ukeUpdates", async ({ stored, ukeUpdates }) => {
    dbMock.query.pushSubscriptions.findFirst.mockResolvedValue({ preferences: stored });

    const response = await injectMutation(getPreferences, { method: "GET", url: `/push/preferences?id=${id}` }, options);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toEqual({ ukeUpdates, submissionUpdates: true, newSubmission: true, stationWatches: true });
  });

  it("stores the ukeUpdates of PATCH /push/subscribe as officialDataUpdates", async () => {
    dbMock.enqueueFor("update", "push_subscriptions", []);

    const response = await injectMutation(patchSubscribe, { method: "PATCH", url: "/push/subscribe", payload: { id, ukeUpdates: true } }, options);

    expect(response.statusCode, response.body).toBe(200);
    const values = dbMock.calls.find((call) => call.operation === "update" && call.table === "push_subscriptions")?.values as { preferences: SQL };
    expect(new PgDialect().sqlToQuery(values.preferences).params).toEqual([JSON.stringify({ officialDataUpdates: true })]);
  });
});
