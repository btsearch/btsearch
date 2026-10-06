import fs from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { getRuntimeSettings } from "../../../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../../../src/routes/v2/(delete)/submissions/[id]/photos/[photoId].js";
import { photoFilePath } from "../../../../../../../src/utils/photoFiles.js";
import { authBoundary, dbMock, userSession } from "../../../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit, whereQuery } from "../../../../../../helpers/mutationAssertions.js";
import { submissionId, submissionRow, submitterId } from "../../../../../../helpers/submissionFixtures.js";
import { submissionPhotoId, submissionPhotoRow } from "../../../../../../helpers/submissionPhotoFixtures.js";
import { foreignReaderId, scriptReaderAccess } from "../../../../../../helpers/submissionReadFixtures.js";

const request = { method: "DELETE" as const, url: `/submissions/${submissionId}/photos/${submissionPhotoId}` };
const options = { session: userSession(submitterId) };

function scriptPhotoRemoval(isMain: boolean) {
  dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
  dbMock.query.attachments.findFirst.mockResolvedValue({ id: 8, uuid: submissionPhotoId });
  dbMock.enqueueFor("select", "submission_photos", [{ photo: { ...submissionPhotoRow, is_main: isMain } }]);
  dbMock.enqueueFor("select", "submissions", [submissionRow]);
  dbMock.enqueueFor("delete", "submission_photos", []);
  dbMock.enqueueFor("delete", "attachments", []);
  scriptAudit();
}

function scriptEditorPhotoScope(coversBothRegions: boolean) {
  dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
  dbMock.enqueueFor(
    "select",
    "role_grants",
    (coversBothRegions ? [1, 2] : [1]).map((regionId) => ({ countryCode: "PL", grantRole: "editor", isCountryWide: false, regionId })),
  );
  dbMock.enqueueFor("select", "submissions", [{ stationId: null }]);
  dbMock.enqueueFor("select", "proposed_stations", [], []);
  dbMock.enqueueFor(
    "select",
    "proposed_locations",
    [1, 2].map((region_id) => ({ region_id, latitude: null, longitude: null, current: null })),
  );
  for (const table of ["proposed_cells", "proposed_sectors", "submission_location_photo_selections"]) dbMock.enqueueFor("select", table, []);
  dbMock.enqueueFor(
    "select",
    "regions",
    [1, 2].map((regionId) => ({ regionId, countryCode: "PL" })),
  );
}

describe("DELETE /submissions/:id/photos/:photoId", () => {
  it("returns a controlled deletion failure when the database transaction rejects", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    dbMock.query.attachments.findFirst.mockResolvedValue(undefined);
    dbMock.enqueueFor("select", "submission_photos", [{ photo: submissionPhotoRow }]);
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_DELETE");
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });

  it("deletes only the requested submission's uploaded photo", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    dbMock.query.attachments.findFirst.mockResolvedValue(undefined);
    dbMock.enqueueFor("select", "submission_photos", [{ photo: submissionPhotoRow }]);
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    dbMock.enqueueFor("delete", "submission_photos", []);
    scriptAudit();
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(204);
    expect(whereQuery("submission_photos", "delete").params).toEqual([7, submissionId]);
    expect(dbMock.calls.some((call) => call.table === "location_photos")).toBe(false);
  });

  it("requires an account", async () => {
    expectError(await injectMutation(route, request), 401, "UNAUTHORIZED");
  });

  it("returns 404 when the submission does not exist", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue(undefined);
    expectError(await injectMutation(route, request, options), 404, "NOT_FOUND");
  });

  it("returns 404 for a photo outside this submission", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    dbMock.enqueueFor("select", "submission_photos", []);
    expectError(await injectMutation(route, request, options), 404, "NOT_FOUND");
  });

  it("does not delete after a concurrent review", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    dbMock.query.attachments.findFirst.mockResolvedValue(undefined);
    dbMock.enqueueFor("select", "submission_photos", [{ photo: submissionPhotoRow }]);
    dbMock.enqueueFor("select", "submissions", [{ ...submissionRow, status: "approved" }]);
    scriptAudit();
    expectError(await injectMutation(route, request, options), 400, "BAD_REQUEST");
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });

  it.each([false, true])("removes an uploaded photo with main=%s, its attachment and every file tier after committing an audit", async (isMain) => {
    const unlink = vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    scriptPhotoRemoval(isMain);
    expect((await injectMutation(route, request, options)).statusCode).toBe(204);
    expect(whereQuery("submission_photos", "delete").params).toEqual([7, submissionId]);
    expect(whereQuery("attachments", "delete").params).toEqual([8]);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toMatchObject([
      { entity: "submission_photos", op: "delete", record_id: "7", old_values: { ...submissionPhotoRow, is_main: isMain }, new_values: null },
    ]);
    expect(unlink.mock.calls.map(([file]) => file)).toEqual([
      photoFilePath(submissionPhotoId),
      photoFilePath(submissionPhotoId, "thumb"),
      photoFilePath(submissionPhotoId, "full"),
    ]);
    expect(dbMock.calls.some((call) => ["location_photos", "submission_location_photo_selections"].includes(call.table ?? ""))).toBe(false);
  });

  it("allows an administrator to remove a foreign submitter's pending upload", async () => {
    vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
    scriptReaderAccess("admin");
    scriptPhotoRemoval(true);
    expect((await injectMutation(route, request, { session: userSession(foreignReaderId, "admin") })).statusCode).toBe(204);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_operations")?.values).toMatchObject({
      kind: "submission.photos",
      actor_id: foreignReaderId,
    });
  });

  it.each([false, true])("requires the foreign editor to cover every proposed region, all covered=%s", async (coversBothRegions) => {
    const unlink = vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
    scriptEditorPhotoScope(coversBothRegions);
    if (coversBothRegions) scriptPhotoRemoval(false);
    else dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    const response = await injectMutation(route, request, { session: userSession(foreignReaderId, "editor") });
    if (coversBothRegions) {
      expect(response.statusCode).toBe(204);
      expect(unlink).toHaveBeenCalledTimes(3);
    } else {
      expectError(response, 403, "FORBIDDEN");
      expect(dbMock.calls.some((call) => call.operation === "delete" || call.table === "submission_photos")).toBe(false);
      expect(unlink).not.toHaveBeenCalled();
    }
  });

  it.each(["approved", "rejected"])("keeps uploads of a reviewed %s submission", async (status) => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue({ ...submissionRow, status });
    expectError(await injectMutation(route, request, options), 400, "BAD_REQUEST", "Submission is not pending");
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects a foreign regular user before loading the requested photo", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    expectError(await injectMutation(route, request, { session: userSession(foreignReaderId) }), 403, "FORBIDDEN");
    expect(dbMock.calls).toEqual([]);
  });

  it("retains files when the submission disappears while waiting for the lock", async () => {
    const unlink = vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    dbMock.query.attachments.findFirst.mockResolvedValue({ id: 8, uuid: submissionPhotoId });
    dbMock.enqueueFor("select", "submission_photos", [{ photo: submissionPhotoRow }]);
    dbMock.enqueueFor("select", "submissions", []);
    scriptAudit();
    expectError(await injectMutation(route, request, options), 400, "BAD_REQUEST", "Submission is not pending");
    expect(unlink).not.toHaveBeenCalled();
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });

  it("keeps physical files when attachment removal rejects inside the transaction", async () => {
    const unlink = vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    dbMock.query.attachments.findFirst.mockResolvedValue({ id: 8, uuid: submissionPhotoId });
    dbMock.enqueueFor("select", "submission_photos", [{ photo: submissionPhotoRow }]);
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    dbMock.enqueueFor("delete", "submission_photos", []);
    dbMock.enqueueFor("delete", "attachments", new Error("private deletion error"));
    scriptAudit();
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_DELETE");
    expect(response.body).not.toContain("private deletion error");
    expect(unlink).not.toHaveBeenCalled();
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("returns FEATURE_DISABLED before inspecting photo ownership", async () => {
    getRuntimeSettings().submissionsEnabled = false;
    expectError(await injectMutation(route, request, options), 403, "FEATURE_DISABLED");
    expect(dbMock.query.submissions.findFirst).not.toHaveBeenCalled();
  });

  it.each([`/submissions/invalid/photos/${submissionPhotoId}`, `/submissions/${submissionId}/photos/invalid`])(
    "validates both public UUID path parameters for %s",
    async (url) => {
      expectError(await injectMutation(route, { ...request, url }, options), 400, "VALIDATION_ERROR");
      expect(dbMock.query.submissions.findFirst).not.toHaveBeenCalled();
    },
  );
});
