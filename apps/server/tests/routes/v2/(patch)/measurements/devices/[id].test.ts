import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(patch)/measurements/devices/[id].js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { deviceId, deviceRow } from "../../../../../helpers/measurementFixtures.js";
import { expectError, injectMutation, scriptAudit } from "../../../../../helpers/mutationAssertions.js";

const userId = userSession().user.id;
const otherUserId = "22222222-2222-4222-8222-222222222222";
const revokedAt = new Date("2026-10-22T08:00:00Z");
const weightRow = { deviceId, weight: 0.3, reason: "A test phone", setById: userId };

function update(payload: object, session = userSession()) {
  return injectMutation(route, { method: "PATCH", url: `/measurements/devices/${deviceId}`, payload }, { session });
}

function writes() {
  return dbMock.calls.filter((call) => call.operation !== "select").map((call) => [call.operation, call.table, call.values]);
}

describe("PATCH /measurements/devices/:id", () => {
  it("lets the owner rename and revoke their device without an audit entry", async () => {
    dbMock.enqueueFor("select", "devices", [deviceRow()], [deviceRow({ label: "Old phone", revokedAt })], [], []);
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
    { name: "give a reason", payload: { isRevoked: true, revocationReason: "Lost" }, device: deviceRow() },
    { name: "set its weight", payload: { weight: { value: 1.2, reason: "My own phone" } }, device: deviceRow() },
  ])("does not let the owner $name", async ({ payload, device }) => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "devices", [device]);
    expectError(await update(payload), 403, "FORBIDDEN", "Only an administrator can restore a device, give a reason or set its weight");
  });

  it("changes nothing when the owner sends `isRevoked: false` for a device that is not revoked", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "devices", [deviceRow()], [deviceRow()], []);
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
      payload: { isRevoked: true, revocationReason: "Uploads from an emulator" },
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
    dbMock.enqueueFor("select", "devices", [device], [device], [], []);
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

  it.each([
    {
      name: "sets a device's weight",
      payload: { weight: { value: 0.3, reason: "A test phone" } },
      existing: [],
      op: "create",
      write: ["insert", "device_weights", weightRow],
    },
    {
      name: "clears a device's weight",
      payload: { weight: null },
      existing: [{ ...weightRow, setAt: revokedAt }],
      op: "delete",
      write: ["delete", "device_weights", undefined],
    },
  ])("audits an administrator who $name", async ({ payload, existing, op, write }) => {
    dbMock.enqueueFor("select", "devices", [deviceRow({ userId: otherUserId })], [deviceRow({ userId: otherUserId })], [], []);
    scriptAudit();
    dbMock.enqueueFor("select", "device_weights", existing);
    dbMock.enqueueFor(op === "create" ? "insert" : "delete", "device_weights", [weightRow]);
    const response = await update(payload, userSession(userId, "admin"));

    expect(response.statusCode).toBe(200);
    expect(writes()).toContainEqual(write);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_operations")?.values).toMatchObject({
      kind: "observations.device_weight",
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toMatchObject([
      { entity: "device_weights", op, record_id: deviceId },
    ]);
  });

  it("writes and audits nothing for the weight the device already has", async () => {
    dbMock.enqueueFor("select", "devices", [deviceRow({ userId: otherUserId })], [deviceRow({ userId: otherUserId })], [], []);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("select", "device_weights", [{ ...weightRow, weight: Math.fround(0.3), setAt: revokedAt }]);
    dbMock.enqueueFor("delete", "audit_operations", []);
    const response = await update({ weight: { value: 0.3, reason: "A test phone" } }, userSession(userId, "admin"));

    expect(response.statusCode, response.body).toBe(200);
    expect(writes()).toEqual([
      ["insert", "audit_operations", expect.anything()],
      ["delete", "audit_operations", undefined],
    ]);
  });

  it("queues a refold of the owner's uploads with the new weight", async () => {
    dbMock.enqueueFor("select", "devices", [deviceRow({ userId: otherUserId })], [deviceRow({ userId: otherUserId })], [], []);
    scriptAudit();
    dbMock.enqueueFor("select", "device_weights", []);
    dbMock.enqueueFor("insert", "device_weights", [weightRow]);
    dbMock.enqueueFor("select", "engine_runs", []);
    dbMock.enqueueFor("insert", "engine_runs", []);
    dbMock.enqueueFor("execute", undefined, []);
    const response = await update({ weight: { value: 0.3, reason: "A test phone" }, refold: true }, userSession(userId, "admin"));

    expect(response.statusCode, response.body).toBe(200);
    expect(writes()).toContainEqual(["insert", "engine_runs", { kind: "refold", params: { userId: otherUserId } }]);
  });

  it("refuses to refold for a device whose owner deleted their account", async () => {
    dbMock.enqueueFor("select", "devices", [deviceRow({ userId: null })]);
    const response = await update({ weight: { value: 0.3, reason: "A test phone" }, refold: true }, userSession(userId, "admin"));

    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual([{ field: "refold", validationMessage: "The device's owner deleted their account" }]);
    expect(writes()).toEqual([]);
  });

  it("refuses a refold sent without a weight", async () => {
    const response = await update({ refold: true }, userSession(userId, "admin"));
    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual([{ field: "refold", validationMessage: "Send it with `weight`" }]);
  });

  it("refuses a weight sent with another change", async () => {
    const response = await update({ weight: { value: 1, reason: "With a rename" }, label: "Phone" }, userSession(userId, "admin"));
    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual([{ field: "weight", validationMessage: "Send it in a request of its own" }]);
  });
});
