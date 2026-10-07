import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../src/routes/v2/(delete)/lists/[id].js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const row = {
  id: 1,
  uuid: "list-1",
  name: "Sites",
  description: null,
  is_public: false,
  notificationsEnabled: true,
  created_by: ownerId,
  stations: { internal: [12], uke: [24] },
  radiolines: [36],
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};
const request = { method: "DELETE" as const, url: "/lists/list-1" };
const options = { session: userSession(ownerId) };

describe("DELETE /lists/list-1", () => {
  it("preserves an audit creation failure and leaves the list untouched", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("insert", "audit_operations", []);
    expectError(await injectMutation(route, request, options), 500, "INTERNAL_SERVER_ERROR", "Failed to create audit operation");
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });

  it("rejects another user's public list without manage-all permission", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue({ ...row, is_public: true });
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    expectError(await injectMutation(route, request, { session: userSession("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb") }), 403, "FORBIDDEN");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("lets an administrator delete another account's private list", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue(row);
    scriptAudit();
    dbMock.enqueueFor("delete", "user_lists", []);
    expect((await injectMutation(route, request, { session: userSession("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "admin") })).statusCode).toBe(204);
  });

  it("returns a controlled failure when deleting the list transaction rejects", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue(row);
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_DELETE");
  });

  it("returns FEATURE_DISABLED while lists are disabled", async () => {
    const response = await injectMutation(route, request, options);
    expectError(response, 403, "FEATURE_DISABLED");
    expect(dbMock.calls).toEqual([]);
  });

  it("requires an account after the feature is enabled", async () => {
    getRuntimeSettings().enableUserLists = true;
    const response = await injectMutation(route, request);
    expectError(response, 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("returns the documented owner result", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.enqueueFor("select", "countries", []);
    scriptAudit();
    dbMock.query.userLists.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("delete", "user_lists", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
  });
});
