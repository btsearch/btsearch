import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(patch)/push-subscriptions/[id].js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../helpers/mutationAssertions.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id = "11111111-1111-4111-8111-111111111111";
const payload = { topics: { stationWatches: false } };
const row = {
  id,
  userId: ownerId,
  endpoint: "https://push.example.com/device",
  p256dh: "key",
  auth: "secret",
  preferences: {},
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("PATCH /push-subscriptions/11111111-1111-4111-8111-111111111111", () => {
  it("requires an account before touching subscriptions", async () => {
    const response = await injectMutation(route, { method: "PATCH", url: "/push-subscriptions/11111111-1111-4111-8111-111111111111", payload });
    expectError(response, 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("serializes default topics without exposing push credentials", async () => {
    dbMock.enqueueFor("update", "push_subscriptions", [row]);
    const response = await injectMutation(
      route,
      { method: "PATCH", url: "/push-subscriptions/11111111-1111-4111-8111-111111111111", payload },
      { session: userSession(ownerId, "user") },
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        id,
        createdAt: row.createdAt.toISOString(),
        topics: { officialDataUpdates: false, submissionUpdates: true, newSubmissions: true, stationWatches: true },
      },
    });
  });

  it("preserves explicit disabled topics and enables only configured official updates", async () => {
    dbMock.enqueueFor("update", "push_subscriptions", [
      { ...row, preferences: { ukeUpdates: true, submissionUpdates: false, newSubmission: false, stationWatches: false } },
    ]);
    const response = await injectMutation(
      route,
      { method: "PATCH", url: "/push-subscriptions/11111111-1111-4111-8111-111111111111", payload },
      { session: userSession(ownerId, "user") },
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { topics: { officialDataUpdates: true, submissionUpdates: false, newSubmissions: false, stationWatches: false } },
    });
  });

  it("hides missing or foreign subscriptions", async () => {
    dbMock.enqueueFor("update", "push_subscriptions", []);
    const response = await injectMutation(
      route,
      { method: "PATCH", url: "/push-subscriptions/11111111-1111-4111-8111-111111111111", payload },
      { session: userSession(ownerId, "user") },
    );
    expectError(response, 404, "NOT_FOUND");
  });

  it("rejects an empty or invalid topic or endpoint payload before writing", async () => {
    const response = await injectMutation(
      route,
      { method: "PATCH", url: "/push-subscriptions/11111111-1111-4111-8111-111111111111", payload: { topics: {} } },
      { session: userSession(ownerId, "user") },
    );
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
