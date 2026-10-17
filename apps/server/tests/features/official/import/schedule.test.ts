import { officialDatasets } from "@openbts/drizzle";
import { describe, expect, it } from "vitest";

import { type ScheduledDataset, isDue, nextCheckAfter, queueDueImports } from "../../../../src/features/official/import/schedule.js";
import type { DbTx } from "../../../../src/types/global.js";
import { dbMock } from "../../../helpers/boundaries.js";
import { RUN_ID, valuesOf } from "../../../helpers/importEngineFixtures.js";

const NOW = new Date("2026-10-12T12:00:30.000Z");
const OTHER_RUN_ID = "0199d000-0000-7000-8000-000000000002";
const tx = dbMock as unknown as DbTx;

function dataset(id: number, sourceId: number, nextCheckAt: string | null, checkEveryHours = 6): ScheduledDataset {
  return { id, sourceId, checkEveryHours, nextCheckAt: nextCheckAt === null ? null : new Date(nextCheckAt) };
}

describe("a dataset's check", () => {
  it.each<[string, string | null, boolean]>([
    ["was never planned", null, true],
    ["was planned for an earlier moment", "2026-10-12T12:00:00.000Z", true],
    ["was planned for this very moment", "2026-10-12T12:00:30.000Z", true],
    ["is planned for a later moment", "2026-10-12T12:00:30.001Z", false],
  ])("that %s is due: %s -> %s", (_case, nextCheckAt, expected) => {
    expect(isDue(dataset(1, 1, nextCheckAt), NOW)).toBe(expected);
  });

  it.each<[string, string | null, number, string]>([
    ["a first check counts from now", null, 6, "2026-10-12T18:00:30.000Z"],
    ["a check done on time keeps its hour", "2026-10-12T12:00:00.000Z", 6, "2026-10-12T18:00:00.000Z"],
    ["a check done at its very moment moves one step", "2026-10-12T12:00:30.000Z", 6, "2026-10-12T18:00:30.000Z"],
    ["checks missed for two days are not caught up one by one", "2026-10-10T12:00:00.000Z", 6, "2026-10-12T18:00:00.000Z"],
    ["a daily check keeps its hour too", "2026-10-11T03:00:00.000Z", 24, "2026-10-13T03:00:00.000Z"],
  ])("%s", (_case, nextCheckAt, checkEveryHours, expected) => {
    expect(nextCheckAfter(dataset(1, 1, nextCheckAt, checkEveryHours), NOW).toISOString()).toBe(expected);
  });
});

describe("the scheduled imports", () => {
  const late = "2026-10-12T12:00:00.000Z";
  const later = "2026-10-12T15:00:00.000Z";
  const afterLate = new Date("2026-10-12T18:00:00.000Z");

  it("reads the enabled datasets of enabled sources under a lock that lets the importer go on", async () => {
    dbMock.enqueueFor("select", "official.datasets", []);

    expect(await queueDueImports(tx, NOW)).toEqual([]);

    expect(dbMock.calls).toHaveLength(1);
    expect(dbMock.calls[0]?.clauses.for).toEqual(["no key update", { of: officialDatasets }]);
    expect(dbMock.calls[0]?.clauses.innerJoin).toHaveLength(2);
  });

  it("queues one scheduled import per source and moves the next check of its datasets on", async () => {
    dbMock.enqueueFor("select", "official.datasets", [dataset(1, 1, late), dataset(2, 1, later), dataset(3, 1, null), dataset(4, 2, late, 24)]);
    dbMock.enqueueFor("select", "official.import_runs", []);
    dbMock.enqueueFor("insert", "official.import_runs", [{ id: RUN_ID }], [{ id: OTHER_RUN_ID }]);
    dbMock.enqueueFor("insert", "official.import_run_datasets", undefined, undefined);
    dbMock.enqueueFor("update", "official.datasets", undefined, undefined, undefined);

    const queued = await queueDueImports(tx, NOW);

    expect(queued).toEqual([
      { runId: RUN_ID, sourceId: 1, datasetIds: [1, 3] },
      { runId: OTHER_RUN_ID, sourceId: 2, datasetIds: [4] },
    ]);
    expect(valuesOf("insert", "official.import_runs")).toEqual([
      { sourceId: 1, kind: "import", trigger: "scheduled", isDryRun: false, state: "queued", requestedById: null },
      { sourceId: 2, kind: "import", trigger: "scheduled", isDryRun: false, state: "queued", requestedById: null },
    ]);
    expect(valuesOf("insert", "official.import_run_datasets")).toEqual([
      [
        { runId: RUN_ID, datasetId: 1 },
        { runId: RUN_ID, datasetId: 3 },
      ],
      [{ runId: OTHER_RUN_ID, datasetId: 4 }],
    ]);
    expect(valuesOf("update", "official.datasets")).toEqual([
      { nextCheckAt: afterLate },
      { nextCheckAt: new Date("2026-10-12T18:00:30.000Z") },
      { nextCheckAt: new Date("2026-10-13T12:00:00.000Z") },
    ]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("leaves a source with a queued or running import alone, its next check included", async () => {
    dbMock.enqueueFor("select", "official.datasets", [dataset(1, 1, late), dataset(2, 1, null)]);
    dbMock.enqueueFor("select", "official.import_runs", [{ sourceId: 1 }]);

    expect(await queueDueImports(tx, NOW)).toEqual([]);
    expect(dbMock.calls.map((call) => call.operation)).toEqual(["select", "select"]);
  });

  it("does not look for running imports when nothing is due", async () => {
    dbMock.enqueueFor("select", "official.datasets", [dataset(1, 1, later)]);

    expect(await queueDueImports(tx, NOW)).toEqual([]);
    expect(dbMock.calls).toHaveLength(1);
  });
});
