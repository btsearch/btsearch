import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(post)/official/import-runs/index.js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import { OTHER_RUN_ID, RELEASE_SHA256, RUN_ID, STAFF_ID, runRow, scriptStoredRun, signInAs } from "../../../../../helpers/officialFixtures.js";

const request = { method: "POST" as const, url: "/official/import-runs", payload: { sourceKey: "test-register" } };
const approval = { datasetId: 11, sliceKey: "UMTS:2100:commercial", releaseSha256: RELEASE_SHA256 };

function scriptSource(datasets: { id: number; isEnabled: boolean }[] | null) {
  dbMock.enqueueFor("select", "official.sources", [{ id: 1 }]);
  dbMock.enqueueFor("select", "official.import_runs", []);
  if (datasets !== null) dbMock.enqueueFor("select", "official.datasets", datasets);
}

function scriptQueued(run: typeof runRow, datasetIds: number[]) {
  dbMock.enqueueFor("insert", "official.import_runs", [{ id: RUN_ID }]);
  if (datasetIds.length > 0) dbMock.enqueueFor("insert", "official.import_run_datasets", []);
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
  scriptStoredRun(run, { datasets: datasetIds.map((datasetId) => ({ runId: RUN_ID, datasetId, datasetKey: `dataset-${datasetId}`, error: null })) });
}

function valuesOf(table: string) {
  return dbMock.calls.find((call) => call.operation === "insert" && call.table === table)?.values;
}

describe("POST /official/import-runs", () => {
  it("queues an import of the enabled datasets, audits it as a manual import and answers the run", async () => {
    scriptSource([
      { id: 11, isEnabled: true },
      { id: 12, isEnabled: false },
      { id: 13, isEnabled: true },
    ]);
    scriptQueued(runRow, [11, 13]);
    const response = await injectMutation(route, request, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json().data).toMatchObject({
      id: RUN_ID,
      sourceKey: "test-register",
      kind: "import",
      trigger: "manual",
      isDryRun: false,
      status: "queued",
      requester: { id: STAFF_ID },
      datasets: [{ datasetId: 11 }, { datasetId: 13 }],
      hasHeldSlices: false,
      changes: [],
    });
    expect(valuesOf("official.import_runs")).toEqual({
      sourceId: 1,
      kind: "import",
      trigger: "manual",
      isDryRun: false,
      state: "queued",
      requestedById: STAFF_ID,
    });
    expect(valuesOf("official.import_run_datasets")).toEqual([
      { runId: RUN_ID, datasetId: 11 },
      { runId: RUN_ID, datasetId: 13 },
    ]);
    expect(valuesOf("audit_operations")).toMatchObject({
      kind: "official.import",
      source: "import",
      actor_id: STAFF_ID,
      performed_by: STAFF_ID,
      metadata: { config: { sourceKey: "test-register" }, status: "queued", run_id: RUN_ID },
    });
    expect(dbMock.calls.some((call) => call.table === "official.import_run_approvals")).toBe(false);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("locks the source and refuses a second queued or running run of the same kind", async () => {
    dbMock.enqueueFor("select", "official.sources", [{ id: 1 }]);
    dbMock.enqueueFor("select", "official.import_runs", [{ id: OTHER_RUN_ID }]);
    const response = await injectMutation(route, request, signInAs("admin"));
    expectError(response, 409, "CONFLICT", "This source already has a queued or running import run");
    expect(dbMock.calls.find((call) => call.table === "official.sources")?.clauses.for).toEqual(["no key update"]);
    expect(whereQuery("official.import_runs", "select").params).toEqual([1, "import", "queued", "running"]);
    expect(dbMock.calls.some((call) => call.operation === "insert")).toBe(false);
  });

  it("looks for a live run of the requested kind only, so a replay can wait behind an import", async () => {
    scriptSource([{ id: 11, isEnabled: true }]);
    scriptQueued({ ...runRow, kind: "replay", isDryRun: true }, [11]);
    const response = await injectMutation(route, { ...request, payload: { ...request.payload, kind: "replay", isDryRun: true } }, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(201);
    expect(whereQuery("official.import_runs", "select").params).toEqual([1, "replay", "queued", "running"]);
    expect(valuesOf("official.import_runs")).toMatchObject({ kind: "replay", isDryRun: true });
  });

  it("reads a named dataset even while it is paused", async () => {
    scriptSource([
      { id: 11, isEnabled: true },
      { id: 12, isEnabled: false },
    ]);
    scriptQueued(runRow, [12]);
    const response = await injectMutation(route, { ...request, payload: { ...request.payload, datasetIds: [12] } }, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(201);
    expect(valuesOf("official.import_run_datasets")).toEqual([{ runId: RUN_ID, datasetId: 12 }]);
  });

  it("queues a relink without reading a dataset", async () => {
    scriptSource(null);
    scriptQueued({ ...runRow, kind: "relink" }, []);
    const response = await injectMutation(route, { ...request, payload: { ...request.payload, kind: "relink" } }, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json().data).toMatchObject({ kind: "relink", datasets: [] });
    expect(dbMock.calls.some((call) => call.table === "official.datasets")).toBe(false);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "official.import_run_datasets")).toBe(false);
  });

  it("stores an approval under the release it names", async () => {
    scriptSource([{ id: 11, isEnabled: true }]);
    dbMock.enqueueFor("select", "official.snapshot_slices", [
      { snapshotId: 40, sha256: RELEASE_SHA256, datasetId: 11, slice: "UMTS:2100:commercial" },
    ]);
    dbMock.enqueueFor("insert", "official.import_run_approvals", []);
    scriptQueued(runRow, [11]);
    const response = await injectMutation(route, { ...request, payload: { ...request.payload, approvals: [approval] } }, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(201);
    expect(valuesOf("official.import_run_approvals")).toEqual([{ runId: RUN_ID, datasetId: 11, slice: "UMTS:2100:commercial", snapshotId: 40 }]);
    expect(whereQuery("official.snapshot_slices", "select").params).toEqual([RELEASE_SHA256, 11]);
  });

  it("refuses an approval whose release does not cover the slice", async () => {
    scriptSource([{ id: 11, isEnabled: true }]);
    dbMock.enqueueFor("select", "official.snapshot_slices", [{ snapshotId: 40, sha256: RELEASE_SHA256, datasetId: 11, slice: "LTE:800:commercial" }]);
    const response = await injectMutation(route, { ...request, payload: { ...request.payload, approvals: [approval] } }, signInAs("admin"));
    expectError(response, 400, "BAD_REQUEST", "An approval names a release that does not cover its slice");
    expect(dbMock.calls.some((call) => call.operation === "insert")).toBe(false);
  });

  it("refuses an approval for a dataset the run does not read", async () => {
    scriptSource([
      { id: 11, isEnabled: true },
      { id: 12, isEnabled: true },
    ]);
    const payload = { ...request.payload, datasetIds: [12], approvals: [approval] };
    expectError(
      await injectMutation(route, { ...request, payload }, signInAs("admin")),
      400,
      "BAD_REQUEST",
      "An approval names a dataset the run does not read",
    );
    expect(dbMock.calls.some((call) => call.operation === "insert")).toBe(false);
  });

  it("answers 400 for a source that does not exist", async () => {
    dbMock.enqueueFor("select", "official.sources", []);
    expectError(await injectMutation(route, request, signInAs("admin")), 400, "BAD_REQUEST", "Source not found");
    expect(dbMock.calls).toHaveLength(1);
  });

  it("answers 400 for a dataset of another source", async () => {
    scriptSource([{ id: 11, isEnabled: true }]);
    const response = await injectMutation(route, { ...request, payload: { ...request.payload, datasetIds: [11, 99] } }, signInAs("admin"));
    expectError(response, 400, "BAD_REQUEST", "A dataset does not belong to this source");
    expect(dbMock.calls.some((call) => call.operation === "insert")).toBe(false);
  });

  it("answers 400 when nothing is named and every dataset is paused", async () => {
    scriptSource([{ id: 11, isEnabled: false }]);
    const response = await injectMutation(route, request, signInAs("admin"));
    expectError(response, 400, "BAD_REQUEST", "This source has no enabled dataset, so name the datasets to read");
  });

  it.each([
    {},
    { sourceKey: "" },
    { sourceKey: "test-register", kind: "remap" },
    { sourceKey: "test-register", kind: "relink", datasetIds: [11] },
    { sourceKey: "test-register", kind: "relink", approvals: [approval] },
    { sourceKey: "test-register", datasetIds: [] },
    { sourceKey: "test-register", datasetIds: [11, 11] },
    { sourceKey: "test-register", isDryRun: "true" },
    { sourceKey: "test-register", approvals: [{ ...approval, releaseSha256: "abc" }] },
    { sourceKey: "test-register", approvals: [approval, approval] },
    { sourceKey: "test-register", approvals: [{ datasetId: 11, sliceKey: "UMTS:2100:commercial" }] },
    { sourceKey: "test-register", trigger: "scheduled" },
  ])("rejects the invalid request %j before reading anything", async (payload) => {
    expectError(await injectMutation(route, { ...request, payload }, signInAs("admin")), 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });

  it("refuses an editor before reading anything", async () => {
    expectError(await injectMutation(route, request, signInAs("editor")), 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toEqual([]);
  });

  it("answers a controlled failure when the transaction rejects", async () => {
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    expectError(await injectMutation(route, request, signInAs("admin")), 500, "FAILED_TO_CREATE");
    expect(dbMock.calls.some((call) => call.table === "audit_operations")).toBe(false);
  });
});
