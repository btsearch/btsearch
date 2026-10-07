import fs from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { getRuntimeSettings } from "../../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../../src/routes/v2/(post)/submissions/[id]/photos.js";
import { dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { sharpPhotoInput } from "../../../../../helpers/imageFixtures.js";
import { multipartPayload } from "../../../../../helpers/multipart.js";
import { expectError, injectMutation, scriptAudit } from "../../../../../helpers/mutationAssertions.js";
import { submissionId, submissionRow, submitterId } from "../../../../../helpers/submissionFixtures.js";
import { scriptPhotoViewer, submissionPhotoId, submissionPhotoRow, submissionPhotoView } from "../../../../../helpers/submissionPhotoFixtures.js";

const request = {
  method: "POST" as const,
  url: `/submissions/${submissionId}/photos`,
  ...multipartPayload([{ name: "notes", content: "A note" }]),
};
const options = { session: userSession(submitterId) };

describe("POST /submissions/:id/photos", () => {
  it("encodes and saves an accepted image with a trimmed note and a single main selection", async () => {
    const image = await sharpPhotoInput();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(submissionPhotoId);
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(fs, "writeFile").mockResolvedValue(undefined);
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    dbMock.query.submissionPhotos.findMany.mockResolvedValue([]);
    scriptAudit();
    scriptPhotoViewer();
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    dbMock.enqueueFor("select", "submission_photos", [{ total: 0 }], [{ ...submissionPhotoView, note: "Evidence", isMain: true }]);
    dbMock.enqueueFor("insert", "attachments", [
      {
        id: 8,
        uuid: submissionPhotoId,
        mime_type: "image/webp",
        width: 640,
        height: 480,
        has_thumb: true,
        has_full: false,
        createdAt: submissionPhotoRow.createdAt,
      },
    ]);
    dbMock.enqueueFor("insert", "submission_photos", [{ ...submissionPhotoRow, note: "Evidence", is_main: true }]);
    dbMock.enqueueFor("update", "submission_photos", []);
    dbMock.enqueueFor("update", "submission_location_photo_selections", []);
    const body = multipartPayload([
      { name: "notes", content: " Evidence " },
      { name: "isMains", content: "true" },
      { name: "photos", filename: "site.png", contentType: "image/png", content: image },
    ]);
    const response = await injectMutation(route, { method: "POST", url: request.url, ...body }, options);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      data: [
        { id: submissionPhotoId, width: 640, height: 480, note: "Evidence", isMain: true, urls: { display: `/uploads/${submissionPhotoId}.webp` } },
      ],
    });
    expect(fs.writeFile).toHaveBeenCalledTimes(2);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "attachments")?.values).toMatchObject([
      { uuid: submissionPhotoId, author_id: submitterId, mime_type: "image/webp", width: 640, height: 480, has_thumb: true, has_full: false },
    ]);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "submission_photos")?.values).toEqual([
      { submission_id: submissionId, attachment_id: 8, note: "Evidence", taken_at: null, is_main: true },
    ]);
  });

  it("cleans up an earlier valid file when another file in the same request is invalid", async () => {
    const image = await sharpPhotoInput();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(submissionPhotoId);
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(fs, "writeFile").mockResolvedValue(undefined);
    vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    dbMock.query.submissionPhotos.findMany.mockResolvedValue([]);
    const body = multipartPayload([
      { name: "photos", filename: "valid.png", content: image },
      { name: "photos", filename: "fake.png", content: "This is not an image" },
    ]);
    expectError(
      await injectMutation(route, { method: "POST", url: request.url, ...body }, options),
      400,
      "BAD_REQUEST",
      "Only image files are allowed",
    );
    expect(fs.unlink).toHaveBeenCalledTimes(3);
    expect(dbMock.calls.some((call) => call.operation === "insert")).toBe(false);
  });

  it("cleans up encoded files if the submission is reviewed before obtaining its lock", async () => {
    const image = await sharpPhotoInput();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(submissionPhotoId);
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(fs, "writeFile").mockResolvedValue(undefined);
    vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    dbMock.query.submissionPhotos.findMany.mockResolvedValue([]);
    scriptAudit();
    dbMock.enqueueFor("select", "submissions", [{ ...submissionRow, status: "approved" }]);
    const body = multipartPayload([{ name: "photos", filename: "valid.png", content: image }]);
    expectError(await injectMutation(route, { method: "POST", url: request.url, ...body }, options), 400, "BAD_REQUEST", "Submission is not pending");
    expect(fs.unlink).toHaveBeenCalledTimes(3);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "attachments")).toBe(false);
  });

  it("rechecks the ten-photo limit after a concurrent upload", async () => {
    const image = await sharpPhotoInput();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(submissionPhotoId);
    vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(fs, "writeFile").mockResolvedValue(undefined);
    vi.spyOn(fs, "unlink").mockResolvedValue(undefined);
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    dbMock.query.submissionPhotos.findMany.mockResolvedValue([]);
    scriptAudit();
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    dbMock.enqueueFor("select", "submission_photos", [{ total: 10 }]);
    const body = multipartPayload([{ name: "photos", filename: "valid.png", content: image }]);
    expectError(
      await injectMutation(route, { method: "POST", url: request.url, ...body }, options),
      400,
      "BAD_REQUEST",
      "Maximum 10 photos per submission",
    );
    expect(fs.unlink).toHaveBeenCalledTimes(3);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "attachments")).toBe(false);
  });

  it("requires an account", async () => {
    expectError(await injectMutation(route, request), 401, "UNAUTHORIZED");
  });

  it.each(["submissionsEnabled", "photosEnabled"] as const)("honors the %s switch before accessing the submission", async (setting) => {
    getRuntimeSettings()[setting] = false;
    expectError(await injectMutation(route, request, options), 403, "FEATURE_DISABLED");
    expect(dbMock.query.submissions.findFirst).not.toHaveBeenCalled();
  });

  it("requires multipart upload data", async () => {
    expectError(
      await injectMutation(route, { method: "POST", url: request.url, payload: {} }, options),
      400,
      "BAD_REQUEST",
      "Photos must be sent as multipart/form-data",
    );
  });

  it("returns 404 for an absent submission", async () => {
    dbMock.query.submissions.findFirst.mockResolvedValue(undefined);
    expectError(await injectMutation(route, request, options), 404, "NOT_FOUND");
  });

  it("limits uploads to the submitter even for a staff actor", async () => {
    dbMock.query.submissions.findFirst.mockResolvedValue({ ...submissionRow, submitter_id: "other" });
    expectError(await injectMutation(route, request, { session: userSession(submitterId, "admin") }), 403, "INSUFFICIENT_PERMISSIONS");
  });

  it.each(["approved", "rejected"])("rejects uploads after %s review", async (status) => {
    dbMock.query.submissions.findFirst.mockResolvedValue({ ...submissionRow, status });
    expectError(await injectMutation(route, request, options), 400, "BAD_REQUEST", "Submission is not pending");
  });

  it("rejects submissions already at the ten-photo limit", async () => {
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    dbMock.query.submissionPhotos.findMany.mockResolvedValue(Array.from({ length: 10 }, (_, id) => ({ id })));
    expectError(await injectMutation(route, request, options), 400, "BAD_REQUEST", "Maximum 10 photos per submission");
    expect(dbMock.calls).toEqual([]);
  });

  it("does not create attachments for a multipart body containing no files", async () => {
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    dbMock.query.submissionPhotos.findMany.mockResolvedValue([]);
    expectError(await injectMutation(route, request, options), 400, "BAD_REQUEST", "No photo was sent");
    expect(dbMock.calls).toEqual([]);
  });
});
