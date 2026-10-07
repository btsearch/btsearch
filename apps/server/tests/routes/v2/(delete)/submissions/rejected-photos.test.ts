import fs from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { getRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../src/routes/v2/(delete)/submissions/rejected-photos.js";
import { photoFilePath } from "../../../../../src/utils/photoFiles.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit, whereQuery } from "../../../../helpers/mutationAssertions.js";
import { submissionRow, submitterId } from "../../../../helpers/submissionFixtures.js";
import { submissionPhotoId, submissionPhotoRow } from "../../../../helpers/submissionPhotoFixtures.js";

const request = { method: "DELETE" as const, url: "/submissions/rejected-photos" };
const options = { session: userSession(submitterId, "admin") };

describe("DELETE /submissions/rejected-photos", () => {
  it("preserves an audit creation failure before removing any rejected photos", async () => {
    dbMock.enqueueFor("select", "submissions", [{ id: submissionRow.id }]);
    dbMock.enqueueFor("insert", "audit_operations", []);
    expectError(await injectMutation(route, request, options), 500, "INTERNAL_SERVER_ERROR", "Failed to create audit operation");
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });

  it("returns zero counts while submissions are disabled when no rejected photos remain", async () => {
    getRuntimeSettings().submissionsEnabled = false;
    dbMock.enqueueFor("select", "submissions", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { submissions: 0, photos: 0, hasMore: false } });
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("removes rejected photos and clears the upload count while preserving shared attachments", async () => {
    const rejected = { ...submissionRow, status: "rejected", pending_photos: 1 };
    dbMock.enqueueFor("select", "submissions", [{ id: rejected.id }], [rejected]);
    dbMock.enqueueFor("delete", "submission_photos", [submissionPhotoRow]);
    dbMock.enqueueFor("delete", "attachments", []);
    dbMock.enqueueFor("update", "submissions", [{ ...rejected, pending_photos: null }]);
    scriptAudit();
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { submissions: 1, photos: 1, hasMore: false } });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "submissions")?.values).toEqual({ pending_photos: null });
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "submissions")).toBe(false);
  });

  it("requires the cleanup permission", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    expectError(await injectMutation(route, request, options), 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects guests before accessing photos", async () => {
    expectError(await injectMutation(route, request), 403, "INSUFFICIENT_PERMISSIONS");
  });

  it("reports database cleanup errors without pretending photos were removed", async () => {
    dbMock.enqueueFor("select", "submissions", new Error("Connection closed"));
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_DELETE");
  });

  it("selects only rejected submissions with uploaded photos in oldest rejection order", async () => {
    dbMock.enqueueFor("select", "submissions", []);
    expect((await injectMutation(route, request, options)).json()).toEqual({ data: { submissions: 0, photos: 0, hasMore: false } });
    const selection = dbMock.calls.find((call) => call.table === "submissions" && call.operation === "select");
    const condition = whereQuery("submissions", "select");
    expect(condition.params).toEqual(["rejected"]);
    expect(condition.sql).toMatch(/exists\s*\(?select "submissions"\."submission_photos"\."id"/);
    expect(condition.sql).toContain('"submission_id" = "submissions"."submissions"."id"');
    expect(selection?.clauses.limit).toEqual([51]);
    expect(selection?.clauses.orderBy).toHaveLength(2);
    expect(dbMock.calls.some((call) => call.operation === "delete" || call.operation === "update")).toBe(false);
  });

  it("rechecks rejection after locking and skips a submission that is no longer eligible", async () => {
    const unlink = vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
    dbMock.enqueueFor("select", "submissions", [{ id: submissionRow.id }], []);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("delete", "audit_operations", []);
    const response = await injectMutation(route, request, options);
    expect(response.json()).toEqual({ data: { submissions: 0, photos: 0, hasMore: false } });
    const lock = dbMock.calls.filter((call) => call.table === "submissions" && call.operation === "select")[1];
    expect(lock?.clauses.for).toEqual(["update"]);
    expect(dbMock.calls.filter((call) => call.operation === "delete").map((call) => call.table)).toEqual(["audit_operations"]);
    expect(unlink).not.toHaveBeenCalled();
  });

  it("returns zero removals if a concurrent cleanup already removed the locked uploads", async () => {
    const unlink = vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
    dbMock.enqueueFor("select", "submissions", [{ id: submissionRow.id }], [{ ...submissionRow, status: "rejected" }]);
    dbMock.enqueueFor("delete", "submission_photos", []);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("delete", "audit_operations", []);
    expect((await injectMutation(route, request, options)).json()).toEqual({ data: { submissions: 0, photos: 0, hasMore: false } });
    expect(dbMock.calls.some((call) => call.table === "attachments" || call.operation === "update")).toBe(false);
    expect(unlink).not.toHaveBeenCalled();
  });

  it("counts distinct submissions and deletes only unreferenced files while auditing photos and upload count changes", async () => {
    const unlink = vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
    const secondId = "33333333-3333-4333-8333-333333333333";
    const rejected = { ...submissionRow, status: "rejected", pending_photos: 2 };
    const second = { ...rejected, id: secondId, station_id: 2, pending_photos: null };
    const removed = [
      { ...submissionPhotoRow, is_main: true },
      { ...submissionPhotoRow, id: 8, attachment_id: 9 },
      { ...submissionPhotoRow, id: 9, submission_id: secondId, attachment_id: 10 },
    ];
    dbMock.enqueueFor("select", "submissions", [{ id: rejected.id }, { id: second.id }], [rejected, second]);
    dbMock.enqueueFor("delete", "submission_photos", removed);
    dbMock.enqueueFor("delete", "attachments", [{ uuid: submissionPhotoId }]);
    dbMock.enqueueFor("update", "submissions", [{ ...rejected, pending_photos: null }]);
    scriptAudit();
    expect((await injectMutation(route, request, options)).json()).toEqual({ data: { submissions: 2, photos: 3, hasMore: false } });
    const attachmentCondition = whereQuery("attachments", "delete");
    expect(attachmentCondition.params).toEqual([8, 9, 10]);
    expect(attachmentCondition.sql).toMatch(/not exists\s*\(?select "location_photos"\."id"/);
    expect(attachmentCondition.sql).toContain('"location_photos"."attachment_id" = "attachments"."id"');
    expect(unlink.mock.calls.map(([file]) => file)).toEqual([
      photoFilePath(submissionPhotoId),
      photoFilePath(submissionPhotoId, "thumb"),
      photoFilePath(submissionPhotoId, "full"),
    ]);
    expect(dbMock.calls.find((call) => call.table === "audit_logs" && call.operation === "insert")?.values).toEqual([
      ...removed.map((photo) =>
        expect.objectContaining({
          entity: "submission_photos",
          op: "delete",
          record_id: String(photo.id),
          old_values: photo,
          station_id: photo.submission_id === secondId ? 2 : null,
        }),
      ),
      expect.objectContaining({ entity: "submissions", op: "update", old_values: rejected, new_values: { ...rejected, pending_photos: null } }),
    ]);
    expect(dbMock.calls.find((call) => call.table === "audit_operations" && call.operation === "insert")?.values).toMatchObject({
      kind: "submission.cleanup",
      metadata: { cleanup: "rejected_photos" },
    });
    expect(dbMock.calls.some((call) => call.operation === "delete" && ["submissions", "location_photos"].includes(call.table ?? ""))).toBe(false);
  });

  it("preserves an already cleared upload count while deleting rejected photos", async () => {
    const unlink = vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
    const rejected = { ...submissionRow, status: "rejected", pending_photos: null };
    dbMock.enqueueFor("select", "submissions", [{ id: rejected.id }], [rejected]);
    dbMock.enqueueFor("delete", "submission_photos", [submissionPhotoRow]);
    dbMock.enqueueFor("delete", "attachments", []);
    dbMock.enqueueFor("update", "submissions", []);
    scriptAudit();
    expect((await injectMutation(route, request, options)).json()).toEqual({ data: { submissions: 1, photos: 1, hasMore: false } });
    expect(dbMock.calls.find((call) => call.table === "audit_logs" && call.operation === "insert")?.values).toHaveLength(1);
    expect(unlink).not.toHaveBeenCalled();
  });

  it("continues beyond one batch and reports no remaining work when the next candidate scan is empty", async () => {
    const rejected = { ...submissionRow, status: "rejected" };
    const candidates = Array.from({ length: 51 }, (_, index) => ({
      id: index === 0 ? rejected.id : `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
    }));
    dbMock.enqueueFor("select", "submissions", candidates, [rejected], []);
    dbMock.enqueueFor("delete", "submission_photos", [submissionPhotoRow]);
    dbMock.enqueueFor("delete", "attachments", []);
    dbMock.enqueueFor("update", "submissions", []);
    scriptAudit();
    expect((await injectMutation(route, request, options)).json()).toEqual({ data: { submissions: 1, photos: 1, hasMore: false } });
    expect(dbMock.calls.filter((call) => call.table === "submissions" && call.clauses.limit?.[0] === 51)).toHaveLength(2);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("stops at 500 rejected submissions per request and tells the caller to continue", async () => {
    for (let batch = 0; batch < 10; batch++) {
      const candidates = Array.from({ length: 51 }, (_, index) => ({
        id: `${String(batch * 50 + index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
      }));
      const locked = candidates.slice(0, 50).map(({ id }) => ({ ...submissionRow, id, status: "rejected", pending_photos: null }));
      const removed = locked.map((submission, index) => ({
        ...submissionPhotoRow,
        id: batch * 50 + index + 1,
        submission_id: submission.id,
        attachment_id: batch * 50 + index + 1,
      }));
      dbMock.enqueueFor("select", "submissions", candidates, locked);
      dbMock.enqueueFor("delete", "submission_photos", removed);
      dbMock.enqueueFor("delete", "attachments", []);
      dbMock.enqueueFor("update", "submissions", []);
      scriptAudit();
    }
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { submissions: 500, photos: 500, hasMore: true } });
    expect(dbMock.calls.filter((call) => call.table === "submissions" && call.clauses.limit?.[0] === 51)).toHaveLength(10);
    expect(dbMock.calls.filter((call) => call.table === "submission_photos" && call.operation === "delete")).toHaveLength(10);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("does not delete files when the rejected-photo transaction fails", async () => {
    const unlink = vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
    dbMock.enqueueFor("select", "submissions", [{ id: submissionRow.id }], [{ ...submissionRow, status: "rejected" }]);
    dbMock.enqueueFor("delete", "submission_photos", [submissionPhotoRow]);
    dbMock.enqueueFor("delete", "attachments", new Error("private attachment failure"));
    scriptAudit();
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_DELETE");
    expect(response.body).not.toContain("private attachment failure");
    expect(unlink).not.toHaveBeenCalled();
    expect(dbMock.calls.some((call) => call.table === "submissions" && call.operation === "update")).toBe(false);
  });

  it("finishes rejected-photo cleanup when a removed attachment file is already absent", async () => {
    const unlink = vi.spyOn(fs, "unlink").mockRejectedValue(new Error("ENOENT"));
    const rejected = { ...submissionRow, status: "rejected", pending_photos: 1 };
    dbMock.enqueueFor("select", "submissions", [{ id: rejected.id }], [rejected]);
    dbMock.enqueueFor("delete", "submission_photos", [submissionPhotoRow]);
    dbMock.enqueueFor("delete", "attachments", [{ uuid: submissionPhotoId }]);
    dbMock.enqueueFor("update", "submissions", [{ ...rejected, pending_photos: null }]);
    scriptAudit();
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { submissions: 1, photos: 1, hasMore: false } });
    expect(unlink).toHaveBeenCalledTimes(3);
  });
});
