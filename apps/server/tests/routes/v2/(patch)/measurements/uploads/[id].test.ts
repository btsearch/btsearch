import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(patch)/measurements/uploads/[id].js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { crowdSettingsRow, deviceId } from "../../../../../helpers/measurementFixtures.js";
import { expectError, injectMutation, scriptAudit } from "../../../../../helpers/mutationAssertions.js";

const userId = userSession().user.id;
const otherUserId = "22222222-2222-4222-8222-222222222222";
const uploadId = "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0e";
const receivedAt = new Date("2026-10-20T10:00:00Z");
const excludedAt = new Date("2026-10-21T09:00:00Z");

type UploadState = { owner?: string; statusReason?: string | null; excludedById?: string | null; objectDeletedAt?: Date | null };

function upload(status: string, { owner = userId, statusReason = null, excludedById = null, objectDeletedAt = null }: UploadState = {}) {
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
      statusReason,
      statusChangedAt: status === "excluded" ? excludedAt : receivedAt,
      excludedById,
      claimedAt: null,
      attempts: 0,
      lastError: null,
      objectDeletedAt,
    },
    userId: owner,
    fold: null,
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
    dbMock.enqueueFor("select", "upload_folds", []);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    const response = await withdraw();

    expect(response.statusCode).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "update")?.values).toMatchObject({ status: "withdrawn" });
  });

  it("does not let an administrator withdraw someone else's upload", async () => {
    dbMock.enqueueFor("select", "uploads", [upload("received", { owner: otherUserId })]);
    expectError(await withdraw(userSession(userId, "admin")), 403, "FORBIDDEN", "Only the person who sent an upload can withdraw it");
  });

  it("lets an administrator exclude someone else's upload, answers who did it, and audits it", async () => {
    const reason = "Readings from an emulator";
    const staff = { id: userId, username: "staff", name: "Staff Member", image: null };
    dbMock.enqueueFor(
      "select",
      "uploads",
      [upload("received", { owner: otherUserId })],
      [{ total: 1 }],
      [{ id: uploadId, status: "received", statusReason: null }],
    );
    scriptAudit();
    dbMock.enqueueFor("update", "uploads", []);
    dbMock.enqueueFor("select", "upload_folds", []);
    dbMock.enqueueFor("select", "uploads", [upload("excluded", { owner: otherUserId, statusReason: reason, excludedById: userId })]);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    dbMock.enqueueFor("select", "users", [staff]);
    const response = await update({ exclusion: { reason } }, userSession(userId, "admin"));

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ status: "excluded", exclusion: { reason, by: staff, at: excludedAt.toISOString() } });
    expect(writes().find((call) => call.table === "uploads")?.values).toMatchObject({
      status: "excluded",
      statusReason: reason,
      excludedById: userId,
    });
    expect(writes().find((call) => call.table === "audit_operations")?.values).toMatchObject({ kind: "observations.upload_exclude" });
    expect(writes().find((call) => call.table === "audit_logs")?.values).toMatchObject([
      { entity: "uploads", op: "update", record_id: uploadId, old_values: { status: "received", statusReason: null } },
    ]);
  });

  it("does not let a person exclude their own upload", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "uploads", [upload("received")]);
    expectError(await update({ exclusion: { reason: "Mine" } }), 403, "FORBIDDEN", "Only an administrator can exclude an upload");
  });

  it.each([
    { name: "withdraw an excluded upload", status: "excluded", payload: { status: "withdrawn" }, kind: "excluded" },
    { name: "exclude a withdrawn upload", status: "withdrawn", payload: { exclusion: { reason: "Spam" } }, kind: "withdrawn" },
    { name: "restore an upload that is not excluded", status: "processed", payload: { exclusion: null }, kind: "notExcluded" },
  ])("refuses to $name, naming the conflict", async ({ status, payload, kind }) => {
    dbMock.enqueueFor("select", "uploads", [upload(status)]);
    const response = await update(payload, userSession(userId, "admin"));

    expectError(response, 409, "CONFLICT");
    expect(response.json().errors[0].details).toEqual([{ kind }]);
  });

  it("restores a folded upload by queueing a restore run, and audits it", async () => {
    dbMock.enqueueFor("select", "uploads", [upload("excluded", { owner: otherUserId, statusReason: "Spam", excludedById: userId })]);
    scriptAudit();
    dbMock.enqueueFor("select", "upload_folds", [{ uploadId }]);
    dbMock.enqueueFor("update", "uploads", [{ id: uploadId }]);
    dbMock.enqueueFor("select", "engine_runs", []);
    dbMock.enqueueFor("insert", "engine_runs", []);
    dbMock.enqueueFor("execute", undefined, []);
    dbMock.enqueueFor("select", "uploads", [upload("processed", { owner: otherUserId })]);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    const response = await update({ exclusion: null }, userSession(userId, "admin"));

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ status: "processed", exclusion: null });
    expect(writes().find((call) => call.table === "uploads")?.values).toMatchObject({ status: "processed", statusReason: null, excludedById: null });
    expect(writes().find((call) => call.table === "engine_runs")?.values).toEqual({ kind: "restore" });
    expect(writes().find((call) => call.table === "audit_operations")?.values).toMatchObject({ kind: "observations.upload_restore" });
  });

  it("sends an upload excluded before it was folded back to the queue", async () => {
    dbMock.enqueueFor("select", "uploads", [upload("excluded", { owner: otherUserId })]);
    scriptAudit();
    dbMock.enqueueFor("select", "upload_folds", []);
    dbMock.enqueueFor("update", "uploads", [{ id: uploadId }]);
    dbMock.enqueueFor("execute", undefined, []);
    dbMock.enqueueFor("select", "uploads", [upload("received", { owner: otherUserId })]);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    const response = await update({ exclusion: null }, userSession(userId, "admin"));

    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe("received");
    expect(writes().find((call) => call.table === "uploads")?.values).toMatchObject({ status: "received", attempts: 0, claimedAt: null });
    expect(writes().some((call) => call.table === "engine_runs")).toBe(false);
  });

  it("does not let a person restore an upload", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "uploads", [upload("excluded")]);
    expectError(await update({ exclusion: null }), 403, "FORBIDDEN", "Only an administrator can restore an upload");
  });

  it("answers 404 for an upload that does not exist", async () => {
    dbMock.enqueueFor("select", "uploads", []);
    expectError(await update({ exclusion: null }, userSession(userId, "admin")), 404, "NOT_FOUND");
  });

  it("answers 410 for an excluded upload whose file is gone", async () => {
    dbMock.enqueueFor("select", "uploads", [upload("excluded", { objectDeletedAt: new Date("2026-10-21T10:00:00Z") })]);
    const response = await update({ exclusion: null }, userSession(userId, "admin"));

    expectError(response, 410, "GONE", "The upload's file is gone, so it cannot be folded in again");
    expect(response.json().errors[0].details).toEqual([{ kind: "fileDeleted" }]);
  });
});
