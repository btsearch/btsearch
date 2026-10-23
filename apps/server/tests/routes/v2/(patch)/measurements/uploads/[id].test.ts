import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(patch)/measurements/uploads/[id].js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { crowdSettingsRow, deviceId } from "../../../../../helpers/measurementFixtures.js";
import { expectError, injectMutation, scriptAudit } from "../../../../../helpers/mutationAssertions.js";

const userId = userSession().user.id;
const otherUserId = "22222222-2222-4222-8222-222222222222";
const uploadId = "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0e";

function upload(status: string, owner = userId) {
  const receivedAt = new Date("2026-10-20T10:00:00Z");
  return {
    upload: {
      id: uploadId,
      deviceId,
      encoding: "zstd",
      sealKeyId: "2026",
      bodyBytes: 20,
      bodySha256: Buffer.alloc(32),
      store: "disk",
      appVersionCode: 140,
      receivedAt,
      status,
      statusReason: null,
      statusChangedAt: receivedAt,
      claimedAt: null,
      attempts: 0,
      lastError: null,
      objectDeletedAt: null,
    },
    userId: owner,
  };
}

function update(payload: object, session = userSession()) {
  return injectMutation(route, { method: "PATCH", url: `/measurements/uploads/${uploadId}`, payload }, { session });
}

function withdraw(session = userSession()) {
  return update({ status: "withdrawn" }, session);
}

function writes() {
  return dbMock.calls.filter((call) => call.operation !== "select");
}

describe("PATCH /measurements/uploads/:id", () => {
  it("withdraws your upload", async () => {
    dbMock.enqueueFor("select", "uploads", [upload("received")], [{ total: 1 }], [upload("withdrawn")]);
    dbMock.enqueueFor("update", "uploads", [{ id: uploadId }]);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    const response = await withdraw();

    expect(response.statusCode).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "update")?.values).toMatchObject({ status: "withdrawn" });
  });

  it("does not let an administrator withdraw someone else's upload", async () => {
    dbMock.enqueueFor("select", "uploads", [upload("received", otherUserId)]);
    expectError(await withdraw(userSession(userId, "admin")), 403, "FORBIDDEN", "Only the person who sent an upload can withdraw it");
  });

  it("lets an administrator exclude someone else's upload, and audits it", async () => {
    dbMock.enqueueFor(
      "select",
      "uploads",
      [upload("received", otherUserId)],
      [{ total: 1 }],
      [{ id: uploadId, status: "received", statusReason: null }],
    );
    scriptAudit();
    dbMock.enqueueFor("update", "uploads", []);
    dbMock.enqueueFor("select", "uploads", [upload("excluded", otherUserId)]);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    const response = await update({ status: "excluded", reason: "Readings from an emulator" }, userSession(userId, "admin"));

    expect(response.statusCode).toBe(200);
    expect(writes().find((call) => call.table === "uploads")?.values).toMatchObject({
      status: "excluded",
      statusReason: "Readings from an emulator",
    });
    expect(writes().find((call) => call.table === "audit_operations")?.values).toMatchObject({ kind: "observations.upload_exclude" });
    expect(writes().find((call) => call.table === "audit_logs")?.values).toMatchObject([
      { entity: "uploads", op: "update", record_id: uploadId, old_values: { status: "received", statusReason: null } },
    ]);
  });

  it("does not let a person exclude their own upload", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "uploads", [upload("received")]);
    expectError(await update({ status: "excluded", reason: "Mine" }), 403, "FORBIDDEN", "Only an administrator can exclude an upload");
  });

  it.each([
    { name: "withdraw an excluded upload", status: "excluded", payload: { status: "withdrawn" }, message: "An excluded upload cannot be withdrawn" },
    {
      name: "exclude a withdrawn upload",
      status: "withdrawn",
      payload: { status: "excluded", reason: "Spam" },
      message: "A withdrawn upload cannot be excluded",
    },
  ])("refuses to $name", async ({ status, payload, message }) => {
    dbMock.enqueueFor("select", "uploads", [upload(status)]);
    expectError(await update(payload, userSession(userId, "admin")), 409, "CONFLICT", message);
  });
});
