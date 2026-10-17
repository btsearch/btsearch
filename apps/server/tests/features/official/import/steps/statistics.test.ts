import { beforeEach, describe, expect, it } from "vitest";

import { type DatasetOutcome, datasetOutcomesOf, takesStatsSnapshot } from "../../../../../src/features/official/import/steps/datasetOutcomes.js";
import { purgesStatisticsCache, statistics } from "../../../../../src/features/official/import/steps/statistics.js";
import { dbMock, redisMock } from "../../../../helpers/boundaries.js";
import {
  UKE_DATASETS,
  change,
  claimedRun,
  ownRun,
  recordTransactions,
  runStep,
  scriptDatasetOutcomes,
  scriptStepFinish,
  scriptStepStart,
  trace,
  transactionsOf,
  valuesOf,
} from "../../../../helpers/importEngineFixtures.js";

const CACHED = ["statistics:v2:countries", "official:v2:band-labels"];
const KEPT = ["stats:contributions:v1", "official:v3:source-visibility", "geocode:v1:x"];

function outcomes(changed: { permits?: boolean; registry?: boolean; links?: boolean }, failed: readonly number[] = []): DatasetOutcome[] {
  const applied = [changed.permits ? 1 : 0, changed.registry ? 2 : 0, changed.links ? 3 : 0].filter((datasetId) => datasetId > 0);
  return datasetOutcomesOf(
    UKE_DATASETS,
    UKE_DATASETS.map(({ datasetId }) => ({ datasetId, error: failed.includes(datasetId) ? "the reader failed" : null })),
    applied.map((datasetId) => ({ datasetId, slice: "one", outcome: "applied" as const })),
  );
}

async function fillCache(): Promise<void> {
  await Promise.all([...CACHED, ...KEPT].map((key) => redisMock.set(key, "cached")));
}

async function cachedKeys(): Promise<string[]> {
  const present = await Promise.all([...CACHED, ...KEPT].map(async (key) => ((await redisMock.exists(key)) === 1 ? [key] : [])));
  return present.flat();
}

function scriptSnapshot(): void {
  dbMock.enqueueFor(
    "select",
    "official.permits",
    [
      { operator_id: 4, rat: "LTE", label_mhz: 800, label_variant: "commercial", unique_stations_count: 10, permits_count: 12 },
      { operator_id: 4, rat: "GSM", label_mhz: 900, label_variant: "railway", unique_stations_count: 2, permits_count: 2 },
    ],
    [{ operator_id: 4, unique_stations_count: 11 }],
  );
  dbMock.enqueueFor("insert", "stats_snapshots", undefined, undefined);
}

beforeEach(recordTransactions);

describe("what the statistics step does for a run", () => {
  it.each([
    { case: "the permits changed", changed: { permits: true }, failed: [], snapshot: true, purge: true },
    { case: "the registry changed", changed: { registry: true }, failed: [], snapshot: true, purge: true },
    { case: "only the microwave links changed", changed: { links: true }, failed: [], snapshot: false, purge: true },
    { case: "the permits changed and the registry failed", changed: { permits: true }, failed: [2], snapshot: false, purge: true },
    { case: "a sites dataset failed and nothing changed", changed: {}, failed: [1], snapshot: false, purge: true },
    { case: "the permits changed and the microwave links failed", changed: { permits: true }, failed: [3], snapshot: true, purge: true },
    { case: "only the microwave links failed", changed: {}, failed: [3], snapshot: false, purge: false },
    { case: "nothing changed", changed: {}, failed: [], snapshot: false, purge: false },
  ])("when $case: snapshot $snapshot, cache purge $purge", ({ changed, failed, snapshot, purge }) => {
    const datasets = outcomes(changed, failed);

    expect(takesStatsSnapshot(datasets)).toBe(snapshot);
    expect(purgesStatisticsCache(datasets)).toBe(purge);
  });

  it("reads a held or unchanged slice as no change", () => {
    const datasets = datasetOutcomesOf(
      UKE_DATASETS,
      [{ datasetId: 1, error: null }],
      [
        { datasetId: 1, slice: "LTE:800:commercial", outcome: "held" },
        { datasetId: 1, slice: "LTE:1800:commercial", outcome: "unchanged" },
      ],
    );

    expect(datasets[0]).toMatchObject({ appliedSlices: [], heldSlices: ["LTE:800:commercial"] });
    expect(datasets[1]).toMatchObject({ error: null, appliedSlices: [], heldSlices: [] });
    expect(takesStatsSnapshot(datasets)).toBe(false);
    expect(purgesStatisticsCache(datasets)).toBe(false);
  });
});

describe("the statistics step", () => {
  it("takes the snapshot in a transaction of the run, then purges the two cache patterns", async () => {
    await fillCache();
    scriptStepStart();
    ownRun(2);
    scriptDatasetOutcomes([{ datasetId: 1, error: null }], [{ datasetId: 1, slice: "LTE:800:commercial", outcome: "applied" }]);
    scriptSnapshot();
    scriptStepFinish();

    await runStep(statistics);

    expect(dbMock.pendingResults()).toBe(0);
    const [, work, snapshot] = transactionsOf(trace());
    expect(work).toEqual([
      "select official.import_runs",
      "select official.datasets",
      "select official.import_run_datasets",
      "select official.import_run_slices",
      "commit",
    ]);
    expect(snapshot).toEqual([
      "select official.import_runs",
      "select official.permits",
      "select official.permits",
      "insert stats_snapshots",
      "insert stats_snapshots",
      "commit",
    ]);
    expect(await cachedKeys()).toEqual(KEPT);
    expect(redisMock.scanIterator.mock.calls.map(([options]) => options?.MATCH)).toEqual(["statistics:v2:*", "official:v2:band-labels*"]);
  });

  it("records a failed snapshot on the step, still purges the cache and lets the run go on", async () => {
    await fillCache();
    scriptStepStart();
    ownRun(3);
    scriptDatasetOutcomes([{ datasetId: 1, error: null }], [{ datasetId: 1, slice: "LTE:800:commercial", outcome: "applied" }]);
    dbMock.enqueueFor("select", "official.permits", new Error("canceling statement due to statement timeout"));
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await expect(runStep(statistics)).resolves.toBeUndefined();

    expect(dbMock.pendingResults()).toBe(0);
    const [, , snapshot, recorded] = transactionsOf(trace());
    expect(snapshot).toEqual(["select official.import_runs", "select official.permits", "select official.permits", "rollback"]);
    expect(recorded).toEqual(["select official.import_runs", "update official.import_run_steps", "commit"]);
    expect(valuesOf("update", "official.import_run_steps")).toEqual([
      { error: "canceling statement due to statement timeout" },
      expect.objectContaining({ finishedAt: expect.anything() }),
    ]);
    expect(await cachedKeys()).toEqual(KEPT);
  });

  it("purges the cache without a snapshot when a sites dataset failed", async () => {
    await fillCache();
    scriptStepStart();
    ownRun(1);
    scriptDatasetOutcomes(
      [
        { datasetId: 1, error: null },
        { datasetId: 2, error: "the page is unreachable" },
      ],
      [{ datasetId: 1, slice: "LTE:800:commercial", outcome: "applied" }],
    );
    scriptStepFinish();

    await runStep(statistics);

    expect(dbMock.pendingResults()).toBe(0);
    expect(dbMock.calls.some((call) => call.table === "stats_snapshots")).toBe(false);
    expect(await cachedKeys()).toEqual(KEPT);
  });

  it("does neither when the run applied nothing", async () => {
    await fillCache();
    scriptStepStart();
    ownRun(1);
    scriptDatasetOutcomes([{ datasetId: 1, error: null }], [{ datasetId: 1, slice: "LTE:800:commercial", outcome: "unchanged" }]);
    scriptStepFinish();

    await runStep(statistics);

    expect(dbMock.calls.some((call) => call.table === "stats_snapshots")).toBe(false);
    expect(redisMock.scanIterator).not.toHaveBeenCalled();
    expect(await cachedKeys()).toEqual([...CACHED, ...KEPT]);
  });

  it("takes the snapshot and purges the cache for a remap run that changed something", async () => {
    await fillCache();
    scriptStepStart();
    ownRun(2);
    dbMock.enqueueFor("select", "official.import_changes", [change(1, "site_remapped", { officialSiteId: 501 })]);
    scriptSnapshot();
    scriptStepFinish();

    await runStep(statistics, { run: claimedRun({ kind: "remap" }) });

    expect(dbMock.pendingResults()).toBe(0);
    const [, work, snapshot] = transactionsOf(trace());
    expect(work).toEqual(["select official.import_runs", "select official.import_changes", "commit"]);
    expect(snapshot).toEqual([
      "select official.import_runs",
      "select official.permits",
      "select official.permits",
      "insert stats_snapshots",
      "insert stats_snapshots",
      "commit",
    ]);
    expect(dbMock.calls.find((call) => call.table === "official.import_changes")?.clauses.limit).toEqual([1]);
    expect(await cachedKeys()).toEqual(KEPT);
  });

  it("does neither for a remap run that changed nothing", async () => {
    await fillCache();
    scriptStepStart();
    ownRun(1);
    dbMock.enqueueFor("select", "official.import_changes", []);
    scriptStepFinish();

    await runStep(statistics, { run: claimedRun({ kind: "remap" }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(dbMock.calls.some((call) => call.table === "stats_snapshots")).toBe(false);
    expect(await cachedKeys()).toEqual([...CACHED, ...KEPT]);
  });

  it("does neither for a relink run, whatever links it changed", async () => {
    await fillCache();
    scriptStepStart();
    scriptStepFinish();

    await runStep(statistics, { run: claimedRun({ kind: "relink" }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(redisMock.scanIterator).not.toHaveBeenCalled();
    expect(await cachedKeys()).toEqual([...CACHED, ...KEPT]);
  });

  it("treats a replay as an import", async () => {
    scriptStepStart();
    ownRun(2);
    scriptDatasetOutcomes([{ datasetId: 1, error: null }], [{ datasetId: 1, slice: "LTE:800:commercial", outcome: "applied" }]);
    scriptSnapshot();
    scriptStepFinish();

    await runStep(statistics, { run: claimedRun({ kind: "replay" }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(redisMock.scanIterator).toHaveBeenCalledTimes(2);
  });
});
