import { describe, expect, it } from "vitest";

import { saveDryRunReport } from "../../../../../../src/features/official/import/dryRunReports.js";
import route from "../../../../../../src/routes/v2/(get)/official/import-runs/[id].js";
import { dbMock, redisMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";
import { RELEASE_SHA256, RUN_ID, runRow, scriptStoredRun, signInAs } from "../../../../../helpers/officialFixtures.js";

const request = { method: "GET" as const, url: `/official/import-runs/${RUN_ID}` };
const startedAt = new Date("2026-10-12T08:00:05.000Z");
const finishedAt = new Date("2026-10-12T08:03:00.000Z");
const done = { ...runRow, state: "done", attempt: 1, startedAt, claimedAt: startedAt, heartbeatAt: finishedAt, finishedAt };
const sliceRow = {
  datasetId: 11,
  datasetKey: "permits",
  outcome: "applied",
  releaseSha256: RELEASE_SHA256,
};

function scriptDetail(detail: { slices?: unknown[]; skips?: unknown[]; steps?: unknown[]; approvals?: unknown[] } = {}) {
  dbMock.enqueueFor("select", "official.import_run_slices", detail.slices ?? []);
  dbMock.enqueueFor("select", "official.import_run_skips", detail.skips ?? []);
  dbMock.enqueueFor("select", "official.import_run_steps", detail.steps ?? []);
  dbMock.enqueueFor("select", "official.import_run_approvals", detail.approvals ?? []);
}

function sliceCountColumns() {
  const selections = dbMock.calls.flatMap((call) =>
    call.table === "official.import_run_slices" ? [call.selection as Record<string, { name: string } | undefined>] : [],
  );
  const slicesRead = selections.find((selection) => selection.sliceKey !== undefined);

  return { releaseRecordCount: slicesRead?.releaseRecordCount?.name, storedRecordCount: slicesRead?.storedRecordCount?.name };
}

describe("GET /official/import-runs/:id", () => {
  it("returns the run in full: slices with their counts, skips and changes, steps, approvals", async () => {
    scriptStoredRun(done, {
      datasets: [{ runId: RUN_ID, datasetId: 11, datasetKey: "permits", error: null }],
      heldRunIds: [RUN_ID],
      changes: [
        { runId: RUN_ID, datasetId: 11, slice: "LTE:800:commercial", kind: "permit_added", changes: 3 },
        { runId: RUN_ID, datasetId: 11, slice: "LTE:800:commercial", kind: "permit_unlisted", changes: 1 },
        { runId: RUN_ID, datasetId: null, slice: null, kind: "permit_archived", changes: 1 },
      ],
    });
    scriptDetail({
      slices: [
        { ...sliceRow, sliceKey: "LTE:800:commercial", releaseRecordCount: 120, storedRecordCount: 118 },
        { ...sliceRow, sliceKey: "UMTS:2100:commercial", outcome: "held", releaseRecordCount: 0, storedRecordCount: 400 },
      ],
      skips: [
        { runId: RUN_ID, datasetId: 11, slice: "LTE:800:commercial", reason: "unknown_region", recordCount: 2 },
        { runId: RUN_ID, datasetId: 11, slice: "LTE:800:commercial", reason: "unmapped_licensee", recordCount: 7 },
      ],
      steps: [
        { runId: RUN_ID, step: "unlisted_permits", lastSeq: 4, startedAt, finishedAt, error: null },
        { runId: RUN_ID, step: "site_notifications", lastSeq: null, startedAt: finishedAt, finishedAt: null, error: "No watcher could be read" },
      ],
      approvals: [{ datasetId: 11, sliceKey: "LTE:800:commercial", releaseSha256: RELEASE_SHA256 }],
    });
    const response = await injectMutation(route, request, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({
      id: RUN_ID,
      status: "done",
      hasHeldSlices: true,
      datasets: [{ datasetId: 11, datasetKey: "permits", error: null }],
      changes: [
        { kind: "permitAdded", count: 3 },
        { kind: "permitUnlisted", count: 1 },
        { kind: "permitArchived", count: 1 },
      ],
      slices: [
        {
          datasetId: 11,
          datasetKey: "permits",
          sliceKey: "LTE:800:commercial",
          outcome: "applied",
          releaseSha256: RELEASE_SHA256,
          releaseRecordCount: 120,
          storedRecordCount: 118,
          changes: [
            { kind: "permitAdded", count: 3 },
            { kind: "permitUnlisted", count: 1 },
          ],
          skips: [
            { reason: "unknownRegion", count: 2 },
            { reason: "unmappedLicensee", count: 7 },
          ],
        },
        {
          datasetId: 11,
          datasetKey: "permits",
          sliceKey: "UMTS:2100:commercial",
          outcome: "held",
          releaseSha256: RELEASE_SHA256,
          releaseRecordCount: 0,
          storedRecordCount: 400,
          changes: [],
          skips: [],
        },
      ],
      steps: [
        { step: "unlistedPermits", startedAt: "2026-10-12T08:00:05.000Z", finishedAt: "2026-10-12T08:03:00.000Z", error: null },
        { step: "siteNotifications", startedAt: "2026-10-12T08:03:00.000Z", finishedAt: null, error: "No watcher could be read" },
      ],
      approvals: [{ datasetId: 11, sliceKey: "LTE:800:commercial", releaseSha256: RELEASE_SHA256 }],
      dryRunReport: null,
    });
    expect(sliceCountColumns()).toEqual({ releaseRecordCount: "staged_count", storedRecordCount: "live_count" });
    expect(redisMock.get).not.toHaveBeenCalled();
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("returns the report of a dry run in the names of the API", async () => {
    const dryRun = { ...done, isDryRun: true };
    scriptStoredRun(dryRun, { datasets: [{ runId: RUN_ID, datasetId: 11, datasetKey: "permits", error: null }] });
    scriptDetail();
    await saveDryRunReport(RUN_ID, {
      slices: [
        {
          datasetKey: "permits",
          slice: "LTE:800:commercial",
          outcome: "applied",
          stagedCount: 121,
          liveCount: 118,
          changes: { permit_added: 3, site_moved: 1 },
          skipped: { bad_coordinates: 4 },
        },
      ],
      failedDatasets: [{ datasetKey: "microwave-links", error: "The listing page has no file" }],
      afterStepChanges: { station_linked: 2, permit_archived: 1 },
      siteNames: { written: 5, skipped: 1 },
      licenseeNamesCorrected: 2,
      remap: null,
    });
    const response = await injectMutation(route, request, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ isDryRun: true, slices: [], steps: [], changes: [], hasHeldSlices: false });
    expect(response.json().data.dryRunReport).toEqual({
      slices: [
        {
          datasetKey: "permits",
          sliceKey: "LTE:800:commercial",
          outcome: "applied",
          releaseRecordCount: 121,
          storedRecordCount: 118,
          changes: [
            { kind: "siteMoved", count: 1 },
            { kind: "permitAdded", count: 3 },
          ],
          skips: [{ reason: "badCoordinates", count: 4 }],
        },
      ],
      failedDatasets: [{ datasetKey: "microwave-links", error: "The listing page has no file" }],
      changesOutsideSlices: [
        { kind: "permitArchived", count: 1 },
        { kind: "stationLinked", count: 2 },
      ],
      stationNamesWritten: 5,
      stationNamesSkipped: 1,
      licenseeNamesCorrected: 2,
      remap: null,
    });
    expect(redisMock.get).toHaveBeenCalledWith(`official:import:dry-run:${RUN_ID}`);
  });

  it("returns what a remap dry run would do to the licensee's sites and permits", async () => {
    const remapRun = { ...done, kind: "remap", isDryRun: true };
    scriptStoredRun(remapRun, { remaps: [{ runId: RUN_ID, licenseeId: 5, fromOperatorId: 4, toOperatorId: 7 }] });
    scriptDetail();
    await saveDryRunReport(RUN_ID, {
      slices: [],
      failedDatasets: [],
      afterStepChanges: { site_remapped: 3 },
      siteNames: { written: 0, skipped: 0 },
      licenseeNamesCorrected: 0,
      remap: {
        sitesRekeyed: 2,
        sitesMerged: 1,
        sitesSplit: 1,
        permitsMoved: 9,
        permitsMerged: 1,
        permitsBlocked: { count: 2, ids: [701, 702] },
        listingsRemoved: 0,
        watchesRepointed: 3,
        notificationsRepointed: 4,
        listsRepointed: 1,
      },
    });
    const response = await injectMutation(route, request, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({
      kind: "remap",
      remap: { licenseeId: 5, fromOperatorId: 4, toOperatorId: 7 },
      datasets: [],
      dryRunReport: {
        changesOutsideSlices: [{ kind: "siteRemapped", count: 3 }],
        remap: {
          sitesRekeyed: 2,
          sitesMerged: 1,
          sitesSplit: 1,
          permitsMoved: 9,
          permitsMerged: 1,
          permitsBlocked: 2,
          blockedPermitIds: [701, 702],
          listingsRemoved: 0,
          watchesRepointed: 3,
          notificationsRepointed: 4,
          listsRepointed: 1,
        },
      },
    });
  });

  it("answers null for the report of a dry run that has none yet, or none any more", async () => {
    const dryRun = { ...runRow, isDryRun: true };
    scriptStoredRun(dryRun);
    scriptDetail();
    const response = await injectMutation(route, request, signInAs("admin"));
    expect(response.json().data).toMatchObject({ isDryRun: true, status: "queued", dryRunReport: null });
  });

  it("returns 404 for an unknown run after one read", async () => {
    dbMock.enqueueFor("select", "official.import_runs", []);
    expectError(await injectMutation(route, request, signInAs("admin")), 404, "NOT_FOUND");
    expect(dbMock.calls).toHaveLength(1);
  });

  it("rejects an id that is not a UUID", async () => {
    expectError(await injectMutation(route, { ...request, url: "/official/import-runs/17" }, signInAs("admin")), 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });

  it("refuses an editor before reading anything", async () => {
    expectError(await injectMutation(route, request, signInAs("editor")), 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toEqual([]);
  });
});
