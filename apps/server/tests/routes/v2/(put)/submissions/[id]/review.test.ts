import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../../src/routes/v2/(put)/submissions/[id]/review.js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../../helpers/mutationAssertions.js";
import { scriptSubmissionSerialization, submissionId, submissionRow, submitterId } from "../../../../../helpers/submissionFixtures.js";

const request = { method: "PUT" as const, url: `/submissions/${submissionId}/review`, payload: { decision: "reject" } };
const options = { session: userSession(submitterId, "admin") };

function scriptPending() {
  dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
  scriptAudit();
  dbMock.enqueueFor("select", "submissions", [submissionRow]);
}

describe("PUT /submissions/:id/review", () => {
  it("requires the reviewer's grant to cover the submission's target station before reviewing it", async () => {
    const session = userSession(undefined, "editor");
    authBoundary.getCurrentUser.mockResolvedValue(session);
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "role_grants", [{ countryCode: "PL", grantRole: "editor", isCountryWide: true, regionId: null }]);
    dbMock.enqueueFor("select", "submissions", [{ stationId: 12 }]);
    dbMock.enqueueFor("select", "proposed_stations", [], []);
    for (const table of ["proposed_locations", "proposed_cells", "proposed_sectors", "submission_location_photo_selections"])
      dbMock.enqueueFor("select", table, []);
    dbMock.enqueueFor("select", "stations", [{ countryCode: "DE", regionId: 99 }]);
    expectError(
      await injectMutation(route, request, { session, runAuth: true }),
      403,
      "INSUFFICIENT_PERMISSIONS",
      "Your editor access does not cover this region",
    );
    expect(dbMock.query.submissions.findFirst).not.toHaveBeenCalled();
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it("accepts a station removal by marking the live station inactive instead of deleting it", async () => {
    const initial = { ...submissionRow, type: "delete", station_id: 12, submitter_id: null };
    const station = { id: 12, station_id: "SITE-12", operator_id: 7, status: "published", location: null };
    dbMock.query.submissions.findFirst.mockResolvedValue(initial);
    dbMock.query.stations.findFirst.mockResolvedValue(station);
    dbMock.query.proposedStations.findFirst.mockResolvedValue(undefined);
    dbMock.query.proposedLocations.findFirst.mockResolvedValue(undefined);
    dbMock.query.proposedCells.findMany.mockResolvedValue([]);
    dbMock.query.proposedSectors.findMany.mockResolvedValue([]);
    dbMock.query.users.findFirst.mockResolvedValue({ name: "Reviewer" });
    scriptAudit();
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("select", "submissions", [initial]);
    dbMock.enqueueFor("update", "stations", [{ ...station, status: "inactive" }]);
    dbMock.enqueueFor("update", "submissions", [
      { ...initial, status: "approved", reviewer_id: submitterId, reviewed_at: new Date("2026-01-02T00:00:00Z") },
    ]);
    scriptSubmissionSerialization("admin");
    const errors: Error[] = [];
    const response = await injectMutation(
      route,
      { ...request, payload: { decision: "approve" } },
      { ...options, onError: (error) => errors.push(error) },
    );
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { action: "delete", status: "accepted", stationId: 12 } });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "stations")?.values).toMatchObject({
      status: "inactive",
      statusChangedAt: expect.any(Date),
    });
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "stations")).toBe(false);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs")).toHaveLength(2);
  });

  it("notifies the submitter after a rejection with the reviewer and saved note", async () => {
    scriptPending();
    dbMock.query.users.findFirst.mockResolvedValue({ name: "Reviewer", locale: "en-US" });
    dbMock.query.pushSubscriptions.findMany.mockResolvedValue([]);
    dbMock.enqueueFor("update", "submissions", [
      { ...submissionRow, status: "rejected", reviewer_id: submitterId, reviewed_at: new Date("2026-01-02T00:00:00Z") },
    ]);
    dbMock.enqueueFor("select", "proposed_stations", []);
    dbMock.enqueueFor("insert", "notifications", [{ id: "22222222-2222-4222-8222-222222222222" }]);
    scriptSubmissionSerialization("admin");
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "notifications")?.values).toMatchObject({
      userId: submitterId,
      submissionId,
      type: "submission_rejected",
      metadata: { reviewer_name: "Reviewer", reviewer_note: "Earlier note" },
      actionUrl: "/account/submissions",
    });
  });

  it.each([undefined, { id: 12, status: "inactive", operator_id: 7 }])(
    "refuses approval after the target station has disappeared or become inactive",
    async (station) => {
      dbMock.query.submissions.findFirst.mockResolvedValue({ ...submissionRow, type: "delete", station_id: 12 });
      dbMock.query.stations.findFirst.mockResolvedValue(station);
      expectError(await injectMutation(route, { ...request, payload: { decision: "approve" } }, options), 404, "NOT_FOUND", "Station not found");
      expect(dbMock.transaction).not.toHaveBeenCalled();
    },
  );

  it.each([{ note: undefined }, { note: null }, { note: "Corrected evidence" }])(
    "rejects the submission and applies the documented review note %j",
    async ({ note }) => {
      const initial = { ...submissionRow, submitter_id: null };
      dbMock.query.submissions.findFirst.mockResolvedValue(initial);
      dbMock.query.users.findFirst.mockResolvedValue({ name: "Reviewer" });
      scriptAudit();
      dbMock.enqueueFor("select", "submissions", [initial]);
      const result = {
        ...initial,
        status: "rejected",
        reviewer_id: submitterId,
        review_notes: note ?? initial.review_notes,
        reviewed_at: new Date("2026-01-02T00:00:00Z"),
      };
      dbMock.enqueueFor("update", "submissions", [result]);
      dbMock.enqueueFor("select", "proposed_stations", []);
      scriptSubmissionSerialization("admin");
      const response = await injectMutation(
        route,
        { ...request, payload: { decision: "reject", ...(note === undefined ? {} : { note }), expectedUpdatedAt: initial.updatedAt.toISOString() } },
        options,
      );
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ data: { status: "rejected", reviewNote: note ?? initial.review_notes } });
      expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "submissions")?.values).toMatchObject({
        status: "rejected",
        reviewer_id: submitterId,
        review_notes: note ?? initial.review_notes,
        reviewed_at: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "stations")).toBe(false);
    },
  );

  it("requires an authenticated reviewer", async () => {
    expectError(await injectMutation(route, request), 401, "UNAUTHORIZED");
    expect(dbMock.query.submissions.findFirst).not.toHaveBeenCalled();
  });

  it("honors the submissions feature switch", async () => {
    getRuntimeSettings().submissionsEnabled = false;
    expectError(await injectMutation(route, request, options), 403, "FEATURE_DISABLED");
  });

  it.each(["approve", "reject"])("returns 404 when the submission to %s does not exist", async (decision) => {
    dbMock.query.submissions.findFirst.mockResolvedValue(undefined);
    expectError(await injectMutation(route, { ...request, payload: { decision } }, options), 404, "NOT_FOUND");
  });

  it.each(["approved", "rejected"])("rejects a previously %s submission without opening a transaction", async (status) => {
    dbMock.query.submissions.findFirst.mockResolvedValue({ ...submissionRow, status });
    expectError(await injectMutation(route, request, options), 400, "BAD_REQUEST", "Only pending submissions can be rejected");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("returns 404 when a pending submission disappears before locking", async () => {
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    scriptAudit();
    dbMock.enqueueFor("select", "submissions", []);
    expectError(await injectMutation(route, request, options), 404, "NOT_FOUND");
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "submissions")).toBe(false);
  });

  it("detects a concurrent reviewer under the row lock", async () => {
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    scriptAudit();
    dbMock.enqueueFor("select", "submissions", [{ ...submissionRow, status: "approved" }]);
    expectError(await injectMutation(route, request, options), 409, "CONFLICT", "This submission has already been reviewed");
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it.each(["client", "concurrent"])("detects a stale %s submission version before applying the decision", async (source) => {
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    scriptAudit();
    dbMock.enqueueFor("select", "submissions", [
      { ...submissionRow, updatedAt: source === "concurrent" ? new Date("2026-01-02T00:00:00Z") : submissionRow.updatedAt },
    ]);
    const payload = { decision: "reject", ...(source === "client" ? { expectedUpdatedAt: "2025-12-31T00:00:00Z" } : {}) };
    expectError(await injectMutation(route, { ...request, payload }, options), 409, "CONFLICT", "This submission was changed after you opened it");
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it("reports a failed decision write without announcing a result", async () => {
    scriptPending();
    dbMock.enqueueFor("update", "submissions", []);
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_UPDATE");
    expect(dbMock.query.users.findFirst).not.toHaveBeenCalled();
  });

  it.each([{}, { decision: "accept" }, { decision: "reject", expectedUpdatedAt: "yesterday" }, { decision: "reject", ignored: true }])(
    "rejects invalid review input %j before querying",
    async (payload) => {
      expectError(await injectMutation(route, { ...request, payload }, options), 400, "VALIDATION_ERROR");
      expect(dbMock.query.submissions.findFirst).not.toHaveBeenCalled();
    },
  );
});
