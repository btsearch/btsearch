import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import https from "node:https";
import { beforeEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";

import { dbMock } from "../../helpers/boundaries.js";

vi.mock("node:dns", () => ({
  lookup: vi.fn((_hostname: string, _options: unknown, callback: (error: Error | null, addresses: { address: string; family: number }[]) => void) =>
    callback(null, [{ address: "8.8.8.8", family: 4 }]),
  ),
}));
vi.mock("node:https", () => ({ default: { request: vi.fn() } }));

let deliverQueuedStationWatchNotifications: typeof import("../../../src/features/notifications/service.js").deliverQueuedStationWatchNotifications;

beforeEach(async () => {
  vi.stubEnv("VAPID_SUBJECT", undefined);
  vi.stubEnv("VAPID_PUBLIC_KEY", "test-public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
  ({ deliverQueuedStationWatchNotifications } = await import("../../../src/features/notifications/service.js"));
  vi.spyOn(webpush, "generateRequestDetails").mockReturnValue({
    endpoint: "https://push.example.com/notification",
    method: "POST",
    headers: {},
    body: Buffer.from("encrypted-payload"),
  });
  vi.mocked(https.request).mockImplementation((_options, callback) => {
    const response = Object.assign(new EventEmitter(), { resume: vi.fn(), statusCode: 201 });
    const request = Object.assign(new EventEmitter(), { end: vi.fn(() => response.emit("end")) });
    callback?.(response as unknown as IncomingMessage);
    return request as unknown as ClientRequest;
  });
});

describe("deliverQueuedStationWatchNotifications", () => {
  it.each([
    {
      locale: "pl-PL",
      title: "Zmieniono komórki stacji",
      body: "Obserwowana stacja ma zmiany w komórkach\nStacja: ŁÓDŹ-1 (Play)\nDodane komórki: 2\nUsunięte komórki: 1",
    },
    {
      locale: "en-US",
      title: "Station cells changed",
      body: "A watched station has cell changes\nStation: ŁÓDŹ-1 (Play)\nCells added: 2\nCells removed: 1",
    },
  ])("uses the recipient's current $locale for the complete push message despite a saved English title", async ({ locale, title, body }) => {
    dbMock.enqueueFor("select", "notifications", [
      {
        id: "notification-1",
        userId: "user-1",
        type: "station_cells_changed",
        title: "Station cells changed",
        metadata: { station_id: "ŁÓDŹ-1", station_operator_name: "Play", added: 2, removed: 1, updated: 0 },
        actionUrl: "/stations/1",
        locale,
      },
    ]);
    dbMock.enqueueFor("select", "push_subscriptions", [
      { userId: "user-1", endpoint: "https://push.example.com/notification", p256dh: "subscription-key", auth: "subscription-auth" },
    ]);
    dbMock.enqueueFor("update", "notifications", []);

    expect(await deliverQueuedStationWatchNotifications()).toBe(1);

    expect(webpush.generateRequestDetails).toHaveBeenCalledOnce();
    const payload: unknown = JSON.parse(String(vi.mocked(webpush.generateRequestDetails).mock.calls[0]?.[1]));
    expect(payload).toEqual({ title, body, actionUrl: "/stations/1", notificationId: "notification-1" });
    expect(https.request).toHaveBeenCalledOnce();
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("does not send a push when the queue is empty", async () => {
    dbMock.enqueueFor("select", "notifications", []);

    expect(await deliverQueuedStationWatchNotifications()).toBe(0);
    expect(webpush.generateRequestDetails).not.toHaveBeenCalled();
    expect(https.request).not.toHaveBeenCalled();
    expect(dbMock.calls).toHaveLength(1);
  });

  it("propagates a failed queue lookup without sending a push", async () => {
    dbMock.enqueueFor("select", "notifications", new Error("Queue lookup failed"));

    await expect(deliverQueuedStationWatchNotifications()).rejects.toThrow("Queue lookup failed");
    expect(webpush.generateRequestDetails).not.toHaveBeenCalled();
    expect(https.request).not.toHaveBeenCalled();
  });
});
