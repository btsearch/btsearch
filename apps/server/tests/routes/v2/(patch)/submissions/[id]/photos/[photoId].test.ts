import { describe, expect, it } from "vitest";

import route from "../../../../../../../src/routes/v2/(patch)/submissions/[id]/photos/[photoId].js";
import { authBoundary, dbMock, userSession } from "../../../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit, whereQuery } from "../../../../../../helpers/mutationAssertions.js";
import { submissionId, submissionRow, submitterId } from "../../../../../../helpers/submissionFixtures.js";
import { scriptPhotoViewer, submissionPhotoId, submissionPhotoRow, submissionPhotoView } from "../../../../../../helpers/submissionPhotoFixtures.js";

const request = { method: "PATCH" as const, url: `/submissions/${submissionId}/photos/${submissionPhotoId}`, payload: { note: "" } };
const options = { session: userSession(submitterId) };

function scriptEditable() {
  authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
  dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
  dbMock.enqueueFor("select", "submission_photos", [{ photo: submissionPhotoRow }]);
}

describe("PATCH /submissions/:id/photos/:photoId", () => {
  it("clears a note while preserving the date and main selection", async () => {
    scriptEditable();
    scriptAudit();
    scriptPhotoViewer();
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    dbMock.enqueueFor("update", "submission_photos", [submissionPhotoRow]);
    dbMock.enqueueFor("select", "submission_photos", [submissionPhotoView]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { id: submissionPhotoId, note: null, isMain: false } });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "submission_photos")?.values).toEqual({ note: null });
    expect(whereQuery("submission_photos", "update").params).toEqual([7, submissionId]);
  });

  it("clears all other uploaded and selected main photos when choosing the main photo", async () => {
    scriptEditable();
    scriptAudit();
    scriptPhotoViewer();
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    dbMock.enqueueFor("update", "submission_photos", [{ ...submissionPhotoRow, is_main: true }], []);
    dbMock.enqueueFor("update", "submission_location_photo_selections", []);
    dbMock.enqueueFor("select", "submission_photos", [{ ...submissionPhotoView, isMain: true }]);
    const response = await injectMutation(route, { ...request, payload: { isMain: true, takenAt: null } }, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { isMain: true, takenAt: null } });
    expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === "submission_photos").map((call) => call.values)).toEqual([
      { taken_at: null, is_main: true },
      { is_main: false },
    ]);
    expect(dbMock.calls.find((call) => call.table === "submission_location_photo_selections")?.values).toEqual({ is_main: false });
  });

  it("requires an account before querying photos", async () => {
    expectError(await injectMutation(route, request), 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects dates in the future before touching the submission", async () => {
    expectError(
      await injectMutation(route, { ...request, payload: { takenAt: "2099-01-01T00:00:00Z" } }, options),
      400,
      "BAD_REQUEST",
      "takenAt cannot be in the future",
    );
    expect(dbMock.query.submissions.findFirst).not.toHaveBeenCalled();
  });

  it("hides photos attached to another submission", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    dbMock.enqueueFor("select", "submission_photos", []);
    expectError(await injectMutation(route, request, options), 404, "NOT_FOUND");
  });

  it("rejects editing another user's submission", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue({ ...submissionRow, submitter_id: "other" });
    expectError(await injectMutation(route, request, options), 403, "FORBIDDEN");
  });

  it.each(["approved", "rejected"])("rejects photos on a %s submission", async (status) => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue({ ...submissionRow, status });
    expectError(await injectMutation(route, request, options), 400, "BAD_REQUEST", "Submission is not pending");
  });

  it("rechecks pending status under the lock before changing a photo", async () => {
    scriptEditable();
    scriptAudit();
    dbMock.enqueueFor("select", "submissions", [{ ...submissionRow, status: "rejected" }]);
    expectError(await injectMutation(route, request, options), 400, "BAD_REQUEST", "Submission is not pending");
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it("reports an update that did not return the photo", async () => {
    scriptEditable();
    scriptAudit();
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    dbMock.enqueueFor("update", "submission_photos", []);
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_UPDATE");
  });

  it.each([{}, { note: "x".repeat(101) }, { takenAt: "yesterday" }, { isMain: false }])(
    "validates the documented photo patch %j",
    async (payload) => {
      expectError(await injectMutation(route, { ...request, payload }, options), 400, "VALIDATION_ERROR");
      expect(dbMock.calls).toEqual([]);
    },
  );
});
