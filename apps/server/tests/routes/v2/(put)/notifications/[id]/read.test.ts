import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(put)/notifications/[id]/read.js";
import { dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";

const id = "11111111-1111-4111-8111-111111111111";
const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const instant = new Date("2026-01-01T00:00:00Z");

describe("PUT /notifications/:id/read", () => {
  it("requires an account", async () => {
    const response = await injectMutation(route, { method: "PUT", url: `/notifications/${id}/read` });
    expectError(response, 401, "UNAUTHORIZED");
  });

  it("hides a missing or foreign notification", async () => {
    dbMock.enqueueFor("update", "notifications", []);
    const response = await injectMutation(route, { method: "PUT", url: `/notifications/${id}/read` }, { session: userSession(ownerId) });
    expectError(response, 404, "NOT_FOUND");
  });

  it("returns an already read notification with its original read timestamp", async () => {
    dbMock.enqueueFor("update", "notifications", [
      {
        id,
        userId: ownerId,
        type: "station_cells_changed",
        stationId: null,
        ukeStationId: null,
        submissionId: null,
        actionUrl: null,
        metadata: { added: 2 },
        readAt: instant,
        createdAt: instant,
        updatedAt: instant,
      },
    ]);
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    const response = await injectMutation(route, { method: "PUT", url: `/notifications/${id}/read` }, { session: userSession(ownerId) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { id, isRead: true, readAt: instant.toISOString(), type: "stationCellsChanged", cells: { added: 2, removed: 0, updated: 0 }, count: 1 },
    });
  });
});
