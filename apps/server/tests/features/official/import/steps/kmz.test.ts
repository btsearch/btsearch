import type { KmzExportContext } from "@openbts/country-packs/sources";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { kmz } from "../../../../../src/features/official/import/steps/kmz.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import {
  claimedRun,
  ownRun,
  recordTransactions,
  runStep,
  scriptDatasetOutcomes,
  scriptStepFinish,
  scriptStepStart,
  sourceOf,
  trace,
  valuesOf,
  whereOf,
} from "../../../../helpers/importEngineFixtures.js";

const APPLIED = [{ datasetId: 1, slice: "LTE:800:commercial", outcome: "applied" as const }];
const LINKS_APPLIED = { datasetId: 3, slice: "", outcome: "applied" as const };

function scriptOutcomes(runSlices: Parameters<typeof scriptDatasetOutcomes>[1]): void {
  scriptStepStart();
  ownRun(1);
  scriptDatasetOutcomes([{ datasetId: 1, error: null }], runSlices);
}

beforeEach(recordTransactions);

describe("the KMZ step", () => {
  it("exports into the configured directory, under the UTC day the run started, outside any transaction", async () => {
    vi.stubEnv("KMZ_OUTPUT_DIR", "/app/kmz");
    const transactionsOpenAtExport: number[] = [];
    const exportKmz = vi.fn(async (_context: KmzExportContext) => {
      const operations = trace();
      const begun = operations.filter((operation) => operation === "begin").length;
      const committed = operations.filter((operation) => operation === "commit").length;
      transactionsOpenAtExport.push(begun - committed);
      return ["/app/kmz/2026-10-12/stations/all.kmz"];
    });
    scriptOutcomes(APPLIED);
    scriptStepFinish();

    await runStep(kmz, { run: claimedRun({ startedAt: new Date("2026-10-12T23:59:59.999Z") }), source: sourceOf({ exportKmz }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(exportKmz).toHaveBeenCalledExactlyOnceWith({ db: dbMock, directory: "/app/kmz", day: "2026-10-12", changedDatasets: ["permits"] });
    expect(transactionsOpenAtExport).toEqual([0]);
  });

  it("names every dataset that applied a slice, and leaves the others out", async () => {
    const exportKmz = vi.fn(async (_context: KmzExportContext) => []);
    scriptOutcomes([...APPLIED, { datasetId: 2, slice: "PL", outcome: "applied" }]);
    scriptStepFinish();

    await runStep(kmz, { source: sourceOf({ exportKmz }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(exportKmz.mock.calls[0]?.[0].changedDatasets).toEqual(["permits", "device-registry"]);
  });

  it("names the microwave links only when every link holds the technical columns of its last update", async () => {
    const exportKmz = vi.fn(async (_context: KmzExportContext) => []);
    scriptOutcomes([...APPLIED, LINKS_APPLIED]);
    dbMock.enqueueFor("select", "official.microwave_links", []);
    scriptStepFinish();

    await runStep(kmz, { source: sourceOf({ exportKmz }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(exportKmz.mock.calls[0]?.[0].changedDatasets).toEqual(["permits", "microwave-links"]);
    const linkRead = dbMock.calls.find((call) => call.operation === "select" && call.table === "official.microwave_links");
    expect(whereOf(linkRead).sql).toBe(
      '(("official"."microwave_links"."dataset_id" = $1) and (((("official"."microwave_links"."specs_date" is null)) or ("official"."microwave_links"."specs_date" < "official"."microwave_links"."updatedAt"))))',
    );
    expect(whereOf(linkRead).params).toEqual([3]);
  });

  it("exports nothing when only the microwave links changed and a link lacks technical columns", async () => {
    const exportKmz = vi.fn(async (_context: KmzExportContext) => []);
    scriptOutcomes([LINKS_APPLIED]);
    dbMock.enqueueFor("select", "official.microwave_links", [{ id: 801 }]);
    scriptStepFinish();

    await runStep(kmz, { source: sourceOf({ exportKmz }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(exportKmz).not.toHaveBeenCalled();
  });

  it("exports nothing when the run applied no slice", async () => {
    const exportKmz = vi.fn(async (_context: KmzExportContext) => []);
    scriptOutcomes([{ datasetId: 1, slice: "LTE:800:commercial", outcome: "unchanged" }]);
    scriptStepFinish();

    await runStep(kmz, { source: sourceOf({ exportKmz }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(exportKmz).not.toHaveBeenCalled();
  });

  it.each(["remap", "relink"] as const)("exports nothing for a %s run", async (kind) => {
    const exportKmz = vi.fn(async (_context: KmzExportContext) => []);
    scriptStepStart();
    scriptStepFinish();

    await runStep(kmz, { run: claimedRun({ kind }), source: sourceOf({ exportKmz }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(exportKmz).not.toHaveBeenCalled();
  });

  it("exports for a replay that applied a slice", async () => {
    const exportKmz = vi.fn(async (_context: KmzExportContext) => []);
    scriptOutcomes(APPLIED);
    scriptStepFinish();

    await runStep(kmz, { run: claimedRun({ kind: "replay" }), source: sourceOf({ exportKmz }) });

    expect(exportKmz).toHaveBeenCalledOnce();
  });

  it("does nothing for a source without a KMZ export", async () => {
    scriptStepStart();
    scriptStepFinish();

    await runStep(kmz, { source: sourceOf() });

    expect(dbMock.pendingResults()).toBe(0);
    expect(dbMock.calls.some((call) => call.table === "official.datasets")).toBe(false);
  });

  it("records a failed export on the step and lets the run go on", async () => {
    const exportKmz = vi.fn(async (_context: KmzExportContext): Promise<string[]> => {
      throw new Error("ENOSPC: no space left on device");
    });
    scriptOutcomes(APPLIED);
    ownRun(1);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await expect(runStep(kmz, { source: sourceOf({ exportKmz }) })).resolves.toBeUndefined();

    expect(dbMock.pendingResults()).toBe(0);
    const [failure, finish] = valuesOf("update", "official.import_run_steps") as Record<string, unknown>[];
    expect(failure).toEqual({ error: "ENOSPC: no space left on device" });
    expect(Object.keys(finish ?? {})).toEqual(["finishedAt"]);
  });
});
