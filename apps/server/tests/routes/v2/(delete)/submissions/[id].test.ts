import fs from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { getRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../src/routes/v2/(delete)/submissions/[id].js";
import { photoFilePath } from "../../../../../src/utils/photoFiles.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit, whereQuery } from "../../../../helpers/mutationAssertions.js";
import { submissionRow, submitterId } from "../../../../helpers/submissionFixtures.js";
import { submissionPhotoId } from "../../../../helpers/submissionPhotoFixtures.js";

const request = { method: "DELETE" as const, url: "/submissions/11111111-1111-4111-8111-111111111111" };
const options = { session: userSession(submitterId) };

function scriptRemoval(status: "pending" | "approved" | "rejected" = "pending"): void {
  dbMock.query.submissions.findFirst.mockResolvedValue({ ...submissionRow, status });
  dbMock.query.proposedCells.findMany.mockResolvedValue([]);
  dbMock.query.submissionPhotos.findMany.mockResolvedValue([]);
  scriptAudit();
  dbMock.enqueueFor("select", "submissions", [{ status, updatedAt: submissionRow.updatedAt }]);
  for (const table of [
    "proposed_cells",
    "proposed_sectors",
    "proposed_stations",
    "proposed_locations",
    "notifications",
    "submission_photos",
    "submissions",
  ])
    dbMock.enqueueFor("delete", table, []);
}

describe("DELETE /submissions/11111111-1111-4111-8111-111111111111", () => {
  it("requires authentication before accessing submissions", async () => {
    const response = await injectMutation(route, request);
    expectError(response, 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("returns FEATURE_DISABLED when submissions are disabled", async () => {
    getRuntimeSettings().submissionsEnabled = false;
    const response = await injectMutation(route, request, options);
    expectError(response, 403, "FEATURE_DISABLED");
    expect(dbMock.calls).toEqual([]);
  });

  it("returns 404 when the submission is absent", async () => {
    dbMock.query.submissions.findFirst.mockResolvedValue(undefined);
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
  });

  it.each(["approved", "rejected"])("rejects deleting the owner's reviewed %s submission", async (status) => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue({ ...submissionRow, status });
    const response = await injectMutation(route, request, options);
    expectError(response, 400, "BAD_REQUEST", "Only pending submissions can be deleted");
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });

  it("rejects deleting someone else's submission without delete-all permission", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue({ ...submissionRow, submitter_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    const response = await injectMutation(route, request, options);
    expectError(response, 403, "FORBIDDEN");
  });

  it("detects a review between loading and locking the submission", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    scriptAudit();
    dbMock.enqueueFor("select", "submissions", [{ status: "rejected", updatedAt: submissionRow.updatedAt }]);
    const response = await injectMutation(route, request, options);
    expectError(response, 409, "CONFLICT", "This submission has just been reviewed");
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });

  it("deletes an owned pending submission and every proposed relationship", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    scriptRemoval();
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(204);
    expect(dbMock.calls.filter((call) => call.operation === "delete").map((call) => call.table)).toEqual(
      expect.arrayContaining(["submissions", "proposed_cells", "proposed_stations", "proposed_locations", "notifications", "submission_photos"]),
    );
  });

  it.each(["approved", "rejected"] as const)(
    "allows an administrator to delete a foreign %s submission without reverting live changes",
    async (status) => {
      scriptRemoval(status);
      const response = await injectMutation(route, request, { session: userSession("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "admin") });
      expect(response.statusCode).toBe(204);
      expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toMatchObject([
        { entity: "submissions", op: "delete", record_id: submissionRow.id, old_values: { ...submissionRow, status }, new_values: null },
      ]);
      expect(
        dbMock.calls.filter(
          (call) => ["stations", "cells", "locations", "location_photos"].includes(call.table ?? "") && call.operation !== "select",
        ),
      ).toEqual([]);
    },
  );

  it("deletes all proposed radio detail rows and unpublished files while retaining published attachments", async () => {
    const unlink = vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    scriptRemoval();
    dbMock.query.proposedCells.findMany.mockResolvedValue([{ id: 3 }, { id: 4 }]);
    dbMock.query.submissionPhotos.findMany.mockResolvedValue([{ attachment_id: 8 }, { attachment_id: 9 }]);
    dbMock.enqueueFor("select", "location_photos", [{ attachmentId: 8 }]);
    dbMock.query.attachments.findMany.mockResolvedValue([{ id: 9, uuid: submissionPhotoId }]);
    for (const table of ["proposed_gsm_cells", "proposed_umts_cells", "proposed_lte_cells", "proposed_nr_cells", "attachments"])
      dbMock.enqueueFor("delete", table, []);
    expect((await injectMutation(route, request, options)).statusCode).toBe(204);
    for (const table of ["proposed_gsm_cells", "proposed_umts_cells", "proposed_lte_cells", "proposed_nr_cells"])
      expect(whereQuery(table, "delete").params).toEqual([3, 4]);
    expect(dbMock.query.attachments.findMany).toHaveBeenCalledWith({ where: { id: { in: [9] } }, columns: { id: true, uuid: true } });
    expect(whereQuery("attachments", "delete").params).toEqual([9]);
    expect(unlink.mock.calls.map(([file]) => file)).toEqual([
      photoFilePath(submissionPhotoId),
      photoFilePath(submissionPhotoId, "thumb"),
      photoFilePath(submissionPhotoId, "full"),
    ]);
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "location_photos")).toBe(false);
  });

  it("keeps all attachment files when accepted uploads already belong to locations", async () => {
    const unlink = vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
    scriptRemoval("approved");
    dbMock.query.submissionPhotos.findMany.mockResolvedValue([{ attachment_id: 8 }]);
    dbMock.enqueueFor("select", "location_photos", [{ attachmentId: 8 }]);
    expect((await injectMutation(route, request, { session: userSession(submitterId, "admin") })).statusCode).toBe(204);
    expect(dbMock.query.attachments.findMany).not.toHaveBeenCalled();
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "attachments")).toBe(false);
    expect(unlink).not.toHaveBeenCalled();
  });

  it("returns not found when the submission disappears before its deletion lock", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    scriptAudit();
    dbMock.enqueueFor("select", "submissions", []);
    expectError(await injectMutation(route, request, options), 404, "NOT_FOUND");
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });

  it("keeps files when the transaction fails after loading unpublished attachment identities", async () => {
    const unlink = vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    scriptRemoval();
    dbMock.query.submissionPhotos.findMany.mockResolvedValue([{ attachment_id: 9 }]);
    dbMock.enqueueFor("select", "location_photos", []);
    dbMock.query.attachments.findMany.mockResolvedValue([{ id: 9, uuid: submissionPhotoId }]);
    dbMock.enqueueFor("delete", "attachments", new Error("private database failure"));
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_DELETE");
    expect(response.body).not.toContain("private database failure");
    expect(unlink).not.toHaveBeenCalled();
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "submissions")).toBe(false);
  });

  it("treats a missing photo file as already removed after the deletion commits", async () => {
    const unlink = vi.spyOn(fs, "unlink").mockRejectedValue(new Error("ENOENT"));
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    scriptRemoval();
    dbMock.query.submissionPhotos.findMany.mockResolvedValue([{ attachment_id: 9 }]);
    dbMock.enqueueFor("select", "location_photos", []);
    dbMock.query.attachments.findMany.mockResolvedValue([{ id: 9, uuid: submissionPhotoId }]);
    dbMock.enqueueFor("delete", "attachments", []);
    expect((await injectMutation(route, request, options)).statusCode).toBe(204);
    expect(unlink).toHaveBeenCalledTimes(3);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_operations")?.values).toMatchObject({
      kind: "submission.delete",
      metadata: { submission_id: submissionRow.id },
    });
  });
});
