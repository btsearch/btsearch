import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(patch)/measurements/devices/[id].js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { deviceId, deviceRow } from "../../../../../helpers/measurementFixtures.js";
import { expectError, injectMutation, scriptAudit } from "../../../../../helpers/mutationAssertions.js";

const userId = userSession().user.id;
const otherUserId = "22222222-2222-4222-8222-222222222222";
const revokedAt = new Date("2026-10-22T08:00:00Z");

function update(payload: object, session = userSession()) {
  return injectMutation(route, { method: "PATCH", url: `/measurements/devices/${deviceId}`, payload }, { session });
}

function writes() {
  return dbMock.calls.filter((call) => call.operation !== "select").map((call) => [call.operation, call.table, call.values]);
}

describe("PATCH /measurements/devices/:id", () => {
  it("lets the owner rename and revoke their device without an audit entry", async () => {
    dbMock.enqueueFor("select", "devices", [deviceRow()], [deviceRow({ label: "Old phone", revokedAt })]);
    dbMock.enqueueFor("update", "devices", []);
    dbMock.enqueueFor("insert", "device_revocations", [{ deviceId, revokedAt, revokedById: userId, reason: null }]);
    const response = await update({ label: "Old phone", isRevoked: true });

    expect(response.statusCode).toBe(200);
    expect(writes()).toEqual([
      ["update", "devices", { label: "Old phone" }],
      ["insert", "device_revocations", { deviceId, revokedById: userId, reason: null }],
    ]);
  });

  it.each([
    { name: "restore their revoked device", payload: { isRevoked: false }, device: deviceRow({ revokedAt }) },
    { name: "give a reason", payload: { isRevoked: true, reason: "Lost" }, device: deviceRow() },
  ])("does not let the owner $name", async ({ payload, device }) => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "devices", [device]);
    expectError(await update(payload), 403, "FORBIDDEN", "Only an administrator can restore a device or give a reason");
  });

  it("changes nothing when the owner sends `isRevoked: false` for a device that is not revoked", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "devices", [deviceRow()], [deviceRow()]);
    expect((await update({ isRevoked: false })).statusCode).toBe(200);
  });

  it("hides another person's device from someone who is not an administrator", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "devices", [deviceRow({ userId: otherUserId })]);
    expectError(await update({ isRevoked: true }), 404, "NOT_FOUND");
  });

  it.each([
    {
      name: "revokes a device with a reason",
      payload: { isRevoked: true, reason: "Uploads from an emulator" },
      device: deviceRow({ userId: otherUserId }),
      kind: "observations.device_revoke",
      write: ["insert", "device_revocations", { deviceId, revokedById: userId, reason: "Uploads from an emulator" }],
    },
    {
      name: "restores a device",
      payload: { isRevoked: false },
      device: deviceRow({ userId: otherUserId, revokedAt }),
      kind: "observations.device_restore",
      write: ["delete", "device_revocations", undefined],
    },
  ])("audits an administrator who $name", async ({ payload, device, kind, write }) => {
    const revocation = { deviceId, revokedAt, revokedById: userId, reason: null };
    dbMock.enqueueFor("select", "devices", [device], [device]);
    scriptAudit();
    dbMock.enqueueFor(write[0] as string, "device_revocations", [revocation]);
    const response = await update(payload, userSession(userId, "admin"));

    expect(response.statusCode).toBe(200);
    expect(writes()).toContainEqual(write);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_operations")?.values).toMatchObject({ kind });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toMatchObject([
      { entity: "device_revocations", record_id: deviceId },
    ]);
  });
});
