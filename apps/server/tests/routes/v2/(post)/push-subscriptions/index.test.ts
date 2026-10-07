import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(post)/push-subscriptions/index.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../helpers/mutationAssertions.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id = "11111111-1111-4111-8111-111111111111";
const payload = { endpoint: "https://push.example.com/device", keys: { p256dh: "key", auth: "secret" } };
const row = {
  id,
  userId: ownerId,
  endpoint: "https://push.example.com/device",
  p256dh: "key",
  auth: "secret",
  preferences: {},
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("POST /push-subscriptions", () => {
  it("requires an account before touching subscriptions", async () => {
    const response = await injectMutation(route, { method: "POST", url: "/push-subscriptions", payload });
    expectError(response, 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("serializes default topics without exposing push credentials", async () => {
    dbMock.enqueueFor("insert", "push_subscriptions", [row]);
    dbMock.enqueueFor("delete", "push_subscriptions", []);
    const response = await injectMutation(route, { method: "POST", url: "/push-subscriptions", payload }, { session: userSession(ownerId, "user") });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      data: {
        id,
        createdAt: row.createdAt.toISOString(),
        topics: { officialDataUpdates: false, submissionUpdates: true, newSubmissions: true, stationWatches: true },
      },
    });
  });

  it("preserves explicit disabled topics and enables only configured official updates", async () => {
    dbMock.enqueueFor("insert", "push_subscriptions", [
      { ...row, preferences: { ukeUpdates: true, submissionUpdates: false, newSubmission: false, stationWatches: false } },
    ]);
    dbMock.enqueueFor("delete", "push_subscriptions", []);
    const response = await injectMutation(route, { method: "POST", url: "/push-subscriptions", payload }, { session: userSession(ownerId, "user") });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      data: { topics: { officialDataUpdates: true, submissionUpdates: false, newSubmissions: false, stationWatches: false } },
    });
  });

  it("reports a failed insert", async () => {
    dbMock.enqueueFor("insert", "push_subscriptions", []);
    const response = await injectMutation(route, { method: "POST", url: "/push-subscriptions", payload }, { session: userSession(ownerId, "user") });
    expectError(response, 500, "FAILED_TO_CREATE");
  });

  it("rejects an empty or invalid topic or endpoint payload before writing", async () => {
    const response = await injectMutation(
      route,
      { method: "POST", url: "/push-subscriptions", payload: { ...payload, endpoint: "http://127.0.0.1/push" } },
      { session: userSession(ownerId, "user") },
    );
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
