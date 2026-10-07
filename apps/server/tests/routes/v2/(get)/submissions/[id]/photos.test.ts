import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../../src/routes/v2/(get)/submissions/[id]/photos.js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import { submissionRow, submitterId } from "../../../../../helpers/submissionFixtures.js";
import { submissionPhotoId, submissionPhotoView } from "../../../../../helpers/submissionPhotoFixtures.js";
import { foreignReaderId, proposalDate, scriptReaderAccess, scriptSubmissionReadTargets } from "../../../../../helpers/submissionReadFixtures.js";

const request = { method: "GET" as const, url: "/submissions/11111111-1111-4111-8111-111111111111/photos" };
const options = { session: userSession(submitterId) };

describe("GET /submissions/11111111-1111-4111-8111-111111111111/photos", () => {
  it.each(["pending", "approved", "rejected"] as const)(
    "returns uploaded photos for the owner's %s submission with URLs, main selection and private author references",
    async (status) => {
      authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
      dbMock.enqueueFor("select", "submissions", [{ ...submissionRow, status }]);
      scriptReaderAccess("user");
      dbMock.enqueueFor("select", "submission_photos", [
        { ...submissionPhotoView, hasThumb: true, hasFull: true, note: "Lorem ipsum", takenAt: proposalDate, isMain: true },
        { ...submissionPhotoView, fileId: foreignReaderId, createdAt: proposalDate, authorId: foreignReaderId, authorName: "Another private author" },
        { ...submissionPhotoView, fileId: submitterId, createdAt: proposalDate, authorId: null },
      ]);
      const response = await injectMutation(route, request, options);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data).toEqual([
        {
          id: submissionPhotoId,
          urls: {
            thumb: `/uploads/${submissionPhotoId}.thumb.webp`,
            display: `/uploads/${submissionPhotoId}.webp`,
            full: `/uploads/${submissionPhotoId}.full.avif`,
          },
          width: 640,
          height: 480,
          note: "Lorem ipsum",
          takenAt: proposalDate.toISOString(),
          isMain: true,
          createdAt: submissionPhotoView.createdAt.toISOString(),
          author: { id: submitterId, username: "contributor", name: "Private Name", image: null },
        },
        {
          id: foreignReaderId,
          urls: { thumb: `/uploads/${foreignReaderId}.webp`, display: `/uploads/${foreignReaderId}.webp`, full: `/uploads/${foreignReaderId}.webp` },
          width: 640,
          height: 480,
          note: null,
          takenAt: null,
          isMain: false,
          createdAt: proposalDate.toISOString(),
          author: { id: foreignReaderId, username: "contributor", name: null, image: null },
        },
        {
          id: submitterId,
          urls: { thumb: `/uploads/${submitterId}.webp`, display: `/uploads/${submitterId}.webp`, full: `/uploads/${submitterId}.webp` },
          width: 640,
          height: 480,
          note: null,
          takenAt: null,
          isMain: false,
          createdAt: proposalDate.toISOString(),
          author: null,
        },
      ]);
      expect(whereQuery("submission_photos", "select").params).toEqual([submissionRow.id]);
      const order = dbMock.calls.find((call) => call.table === "submission_photos")?.clauses.orderBy as SQL[];
      expect(order.map((field) => new PgDialect().sqlToQuery(field).sql)).toEqual([
        expect.stringContaining('"createdAt" asc'),
        expect.stringContaining('"id" asc'),
      ]);
      expect(dbMock.calls.some((call) => call.table === "submission_location_photo_selections")).toBe(false);
    },
  );

  it("lets an administrator see private photographer references on a foreign submission", async () => {
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    scriptReaderAccess("admin");
    dbMock.enqueueFor("select", "submission_photos", [submissionPhotoView]);
    const response = await injectMutation(route, request, { session: userSession(foreignReaderId, "admin") });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data[0].author).toEqual({ id: submitterId, username: "contributor", name: "Private Name", image: null });
  });

  it("does not expose a foreign submission's photos without read-all permission", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    const response = await injectMutation(route, request, { session: userSession(foreignReaderId) });
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls.some((call) => call.table === "submission_photos")).toBe(false);
  });

  it.each([false, true])("applies an editor's photo-location reach before listing uploaded photos: covered=%s", async (covered) => {
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    scriptReaderAccess("editor");
    scriptSubmissionReadTargets("photo", covered);
    if (covered) dbMock.enqueueFor("select", "submission_photos", [submissionPhotoView]);
    const response = await injectMutation(route, request, { session: userSession(foreignReaderId, "editor") });
    if (covered) {
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data[0].id).toBe(submissionPhotoId);
    } else {
      expectError(response, 404, "NOT_FOUND");
      expect(dbMock.calls.some((call) => call.table === "submission_photos")).toBe(false);
    }
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("redacts database failures instead of returning a partial photo collection", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    scriptReaderAccess("user");
    dbMock.enqueueFor("select", "submission_photos", new Error("Private database credentials"));
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "INTERNAL_SERVER_ERROR");
    expect(response.body).not.toContain("Private database credentials");
    expect(response.json()).not.toHaveProperty("data");
  });

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
    dbMock.enqueueFor("select", "submissions", []);
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
  });

  it("returns the owner's empty photo list", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    dbMock.enqueueFor("select", "submission_photos", []);
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: [] });
  });
});
