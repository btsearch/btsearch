import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunNotOwnedError } from "../../../../../src/features/official/import/runs.js";
import { type DatasetOutcome, datasetOutcomesOf } from "../../../../../src/features/official/import/steps/datasetOutcomes.js";
import { type RunView, importCompletionOf, publish } from "../../../../../src/features/official/import/steps/publish.js";
import { dbMock, redisMock } from "../../../../helpers/boundaries.js";
import {
  FOREIGN_TOKEN,
  RUN_ID,
  UKE_DATASETS,
  claimedRun,
  ownRun,
  recordTransactions,
  runStep,
  scriptDatasetOutcomes,
  scriptStepFinish,
  scriptStepStart,
  sourceOf,
  trace,
  transactionsOf,
  valuesOf,
} from "../../../../helpers/importEngineFixtures.js";

const CHANNEL = "official:import:complete";
const STARTED_AT = "2026-10-12T14:15:16.789Z";
const FINISHED_AT = "2026-10-12T14:21:40.000Z";
const UNORDERED_SOURCE = { datasets: [] };
const RUN_DATASETS = [
  { datasetId: 1, error: null },
  { datasetId: 2, error: null },
  { datasetId: 3, error: "The page lists no file" },
];
const RUN_SLICES = [
  { datasetId: 1, slice: "LTE:1800:commercial", outcome: "applied" as const },
  { datasetId: 1, slice: "LTE:2600:commercial", outcome: "held" as const },
  { datasetId: 1, slice: "LTE:800:commercial", outcome: "applied" as const },
  { datasetId: 2, slice: "orange", outcome: "unchanged" as const },
];
const CHANGE_COUNTS = [
  { datasetId: 1, slice: "LTE:800:commercial", kind: "site_added" as const, count: 2 },
  { datasetId: 1, slice: "LTE:1800:commercial", kind: "site_added" as const, count: 1 },
  { datasetId: 1, slice: "LTE:800:commercial", kind: "permit_added" as const, count: 12 },
  { datasetId: 1, slice: "LTE:800:commercial", kind: "permit_listed" as const, count: 4 },
  { datasetId: 1, slice: "LTE:800:commercial", kind: "permit_unlisted" as const, count: 9 },
  { datasetId: null, slice: null, kind: "permit_archived" as const, count: 5 },
  { datasetId: null, slice: null, kind: "station_linked" as const, count: 7 },
  { datasetId: 3, slice: "", kind: "microwave_link_added" as const, count: 6 },
  { datasetId: 3, slice: "", kind: "microwave_link_renewed" as const, count: 2 },
  { datasetId: 3, slice: "", kind: "microwave_link_archived" as const, count: 1 },
];
const SNAPSHOT_DELTA = {
  byOperator: [{ id: 4, name: "Orange", permitsDelta: 7 }],
  byBand: [{ id: "LTE:800:commercial", name: "LTE 800", permitsDelta: 7 }],
};
const EXPECTED_DATASETS = [
  { key: "permits", outcome: "applied", heldSlices: ["LTE:2600:commercial"], error: null },
  { key: "device-registry", outcome: "skipped", heldSlices: [], error: null },
  { key: "microwave-links", outcome: "failed", heldSlices: [], error: "The page lists no file" },
];
const EXPECTED_CHANGES = [
  { kind: "siteAdded", count: 3 },
  { kind: "permitAdded", count: 12 },
  { kind: "permitListed", count: 4 },
  { kind: "permitUnlisted", count: 9 },
  { kind: "permitArchived", count: 5 },
  { kind: "stationLinked", count: 7 },
  { kind: "microwaveLinkAdded", count: 6 },
  { kind: "microwaveLinkRenewed", count: 2 },
  { kind: "microwaveLinkArchived", count: 1 },
];
const EXPECTED_EVENT = {
  runId: RUN_ID,
  sourceKey: "pl-uke",
  trigger: "scheduled",
  startedAt: STARTED_AT,
  finishedAt: FINISHED_AT,
  datasets: EXPECTED_DATASETS,
  changes: EXPECTED_CHANGES,
  snapshotDelta: SNAPSHOT_DELTA,
};

function datasets(runDatasets = RUN_DATASETS, runSlices: Parameters<typeof datasetOutcomesOf>[2] = RUN_SLICES): DatasetOutcome[] {
  return datasetOutcomesOf(UKE_DATASETS, runDatasets, runSlices);
}

function view(overrides: Partial<RunView> = {}): RunView {
  return { trigger: "scheduled", datasets: datasets(), changeCounts: CHANGE_COUNTS, ...overrides };
}

function scriptView(
  options: { runDatasets?: typeof RUN_DATASETS; runSlices?: Parameters<typeof scriptDatasetOutcomes>[1]; changeCounts?: typeof CHANGE_COUNTS } = {},
) {
  ownRun(1);
  dbMock.enqueueFor("select", "official.import_runs", [{ trigger: "scheduled" }]);
  scriptDatasetOutcomes(options.runDatasets ?? RUN_DATASETS, options.runSlices ?? RUN_SLICES);
  dbMock.enqueueFor("select", "official.import_changes", options.changeCounts ?? CHANGE_COUNTS);
}

function scriptSnapshotDelta(): void {
  dbMock.enqueueFor("select", "stats_snapshots", [
    { snapshot_date: new Date("2026-10-12T00:00:00Z") },
    { snapshot_date: new Date("2026-10-11T00:00:00Z") },
  ]);
  dbMock.enqueueFor(
    "select",
    "stats_snapshots",
    [{ operator_id: 4, rat: "LTE", label_mhz: 800, label_variant: "commercial", permits_count: 107, operator_name: "Orange" }],
    [{ operator_id: 4, rat: "LTE", label_mhz: 800, label_variant: "commercial", permits_count: 100, operator_name: "Orange" }],
  );
}

function scriptRecorded(): void {
  ownRun(1);
  dbMock.enqueueFor("update", "official.import_run_steps", undefined);
}

function published(): { channel: string; event: unknown }[] {
  return redisMock.publish.mock.calls.map((call) => {
    const [channel, message] = call as unknown as [string, string];
    return { channel, event: JSON.parse(message) };
  });
}

beforeEach(() => {
  recordTransactions();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FINISHED_AT));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the completion event", () => {
  it.each([
    { case: "a dataset the run did not include", runDatasets: [], runSlices: [], outcome: "skipped" },
    { case: "a dataset that found nothing new", runDatasets: [{ datasetId: 1, error: null }], runSlices: [], outcome: "skipped" },
    {
      case: "a dataset whose slices were unchanged",
      runDatasets: [{ datasetId: 1, error: null }],
      runSlices: [{ datasetId: 1, slice: "LTE:800:commercial", outcome: "unchanged" as const }],
      outcome: "skipped",
    },
    {
      case: "a dataset with an applied slice",
      runDatasets: [{ datasetId: 1, error: null }],
      runSlices: [{ datasetId: 1, slice: "LTE:800:commercial", outcome: "applied" as const }],
      outcome: "applied",
    },
    {
      case: "a dataset whose only new release was held",
      runDatasets: [{ datasetId: 1, error: null }],
      runSlices: [{ datasetId: 1, slice: "LTE:800:commercial", outcome: "held" as const }],
      outcome: "held",
    },
    {
      case: "a dataset that failed after one slice applied",
      runDatasets: [{ datasetId: 1, error: "the reader failed" }],
      runSlices: [{ datasetId: 1, slice: "LTE:800:commercial", outcome: "applied" as const }],
      outcome: "failed",
    },
  ])("reports $case as $outcome", ({ runDatasets, runSlices, outcome }) => {
    const completion = importCompletionOf(claimedRun(), UNORDERED_SOURCE, view({ datasets: datasets(runDatasets, runSlices) }), FINISHED_AT, null);

    expect(completion.datasets[0]).toMatchObject({ key: "permits", outcome });
  });

  it("lists the datasets in the order the source defines them, then the others in the order they were read", () => {
    const read = datasetOutcomesOf([{ datasetId: 9, key: "antennas", layer: "sites" }, ...UKE_DATASETS], [], []);
    const source = { datasets: [{ key: "microwave-links" }, { key: "permits" }] };

    const completion = importCompletionOf(claimedRun(), source, view({ datasets: read }), FINISHED_AT, null);

    expect(completion.datasets.map((dataset) => dataset.key)).toEqual(["microwave-links", "permits", "antennas", "device-registry"]);
  });
});

describe("the publish step", () => {
  it("publishes the event, then records its own end and nothing else", async () => {
    scriptStepStart();
    scriptView();
    scriptSnapshotDelta();
    scriptRecorded();
    scriptStepFinish();

    await runStep(publish);

    expect(dbMock.pendingResults()).toBe(0);
    const [, read, record] = transactionsOf(trace());
    expect(read).toEqual([
      "select official.import_runs",
      "select official.import_runs",
      "select official.datasets",
      "select official.import_run_datasets",
      "select official.import_run_slices",
      "select official.import_changes",
      "commit",
      "select stats_snapshots",
      "select stats_snapshots",
      "select stats_snapshots",
    ]);
    expect(record).toEqual(["select official.import_runs", "update official.import_run_steps", "commit"]);
    expect(dbMock.calls.some((call) => call.table === "official.uke_import_metadata")).toBe(false);

    expect(redisMock.set).not.toHaveBeenCalled();
    expect(published()).toEqual([{ channel: CHANNEL, event: EXPECTED_EVENT }]);
  });

  it("records a snapshot change it could not read on the step, and publishes the event without it", async () => {
    scriptStepStart();
    scriptView();
    dbMock.enqueueFor("select", "stats_snapshots", new Error("connection lost"));
    ownRun(1);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptRecorded();
    scriptStepFinish();

    await expect(runStep(publish)).resolves.toBeUndefined();

    expect(dbMock.pendingResults()).toBe(0);
    expect(valuesOf("update", "official.import_run_steps")[0]).toEqual({ error: "connection lost" });
    expect(published().map(({ event }) => event)).toEqual([
      expect.objectContaining({ runId: RUN_ID, changes: EXPECTED_CHANGES, snapshotDelta: null }),
    ]);
  });

  it("publishes no event when nothing applied and nothing failed", async () => {
    scriptStepStart();
    scriptView({
      runDatasets: [{ datasetId: 1, error: null }],
      runSlices: [{ datasetId: 1, slice: "LTE:800:commercial", outcome: "unchanged" }],
    });
    scriptRecorded();
    scriptStepFinish();

    await runStep(publish);

    expect(dbMock.pendingResults()).toBe(0);
    expect(redisMock.set).not.toHaveBeenCalled();
    expect(redisMock.publish).not.toHaveBeenCalled();
    expect(dbMock.calls.some((call) => call.table === "stats_snapshots")).toBe(false);
  });

  it("publishes a failed check that changed nothing, with no changes", async () => {
    scriptStepStart();
    scriptView({ runDatasets: [{ datasetId: 3, error: "The page lists no file" }], runSlices: [], changeCounts: [] });
    scriptRecorded();
    scriptStepFinish();

    await runStep(publish);

    expect(published()).toEqual([
      {
        channel: CHANNEL,
        event: {
          ...EXPECTED_EVENT,
          datasets: [
            { key: "permits", outcome: "skipped", heldSlices: [], error: null },
            { key: "device-registry", outcome: "skipped", heldSlices: [], error: null },
            { key: "microwave-links", outcome: "failed", heldSlices: [], error: "The page lists no file" },
          ],
          changes: [],
          snapshotDelta: null,
        },
      },
    ]);
  });

  it("publishes a run of another country on the same channel, in the same shape", async () => {
    scriptStepStart();
    ownRun(1);
    dbMock.enqueueFor("select", "official.import_runs", [{ trigger: "manual" }]);
    scriptDatasetOutcomes(
      [{ datasetId: 9, error: null }],
      [{ datasetId: 9, slice: "", outcome: "applied" }],
      [{ datasetId: 9, key: "antennas", layer: "sites" }],
    );
    dbMock.enqueueFor("select", "official.import_changes", [{ datasetId: 9, slice: "", kind: "site_added", count: 40 }]);
    dbMock.enqueueFor("select", "stats_snapshots", [{ snapshot_date: new Date("2026-10-12T00:00:00Z") }]);
    scriptRecorded();
    scriptStepFinish();

    await runStep(publish, { run: claimedRun({ sourceKey: "fr-anfr" }), source: sourceOf({ key: "fr-anfr", countryCode: "FR" }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(redisMock.set).not.toHaveBeenCalled();
    expect(published()).toEqual([
      {
        channel: CHANNEL,
        event: {
          runId: RUN_ID,
          sourceKey: "fr-anfr",
          trigger: "manual",
          startedAt: STARTED_AT,
          finishedAt: FINISHED_AT,
          datasets: [{ key: "antennas", outcome: "applied", heldSlices: [], error: null }],
          changes: [{ kind: "siteAdded", count: 40 }],
          snapshotDelta: null,
        },
      },
    ]);
  });

  it.each(["remap", "relink"] as const)("announces nothing for a %s run", async (kind) => {
    scriptStepStart();
    scriptStepFinish();

    await runStep(publish, { run: claimedRun({ kind }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(redisMock.set).not.toHaveBeenCalled();
    expect(redisMock.publish).not.toHaveBeenCalled();
    expect(dbMock.calls.flatMap((call) => (call.table ? [call.table] : []))).toEqual([
      "official.import_runs",
      "official.import_run_steps",
      "official.import_run_steps",
      "official.import_runs",
      "official.import_run_steps",
    ]);
  });

  it("announces a replay as it announces an import", async () => {
    scriptStepStart();
    scriptView();
    scriptSnapshotDelta();
    scriptRecorded();
    scriptStepFinish();

    await runStep(publish, { run: claimedRun({ kind: "replay" }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(published().map(({ channel }) => channel)).toEqual([CHANNEL]);
  });

  it("publishes again after a takeover, and records its end only in the run that owns it", async () => {
    scriptStepStart();
    scriptView();
    scriptSnapshotDelta();
    ownRun(1, FOREIGN_TOKEN);

    await expect(runStep(publish)).rejects.toBeInstanceOf(RunNotOwnedError);

    expect(redisMock.publish).toHaveBeenCalledTimes(1);
    expect(valuesOf("update", "official.import_run_steps")).toEqual([]);

    scriptStepStart({ lastSeq: null });
    scriptView();
    scriptSnapshotDelta();
    scriptRecorded();
    scriptStepFinish();

    await runStep(publish, { run: claimedRun({ attempt: 2 }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(published().map(({ event }) => (event as { runId: string }).runId)).toEqual([RUN_ID, RUN_ID]);
  });
});
