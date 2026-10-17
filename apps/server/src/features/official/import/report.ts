import { officialDatasets, officialImportRunDatasets, officialImportRunSkips, officialImportRunSlices } from "@openbts/drizzle";
import { and, asc, eq, isNotNull } from "drizzle-orm";

import type { DbTx } from "../../../types/global.js";
import { countChanges } from "./changes.js";
import type { RemapReport } from "./remap/apply.js";
import type { ChangeKind, SiteNameTally, SliceOutcome } from "./types.js";

export type ChangeCountByKind = Partial<Record<ChangeKind, number>>;
export type SliceReport = {
  datasetKey: string;
  slice: string;
  outcome: SliceOutcome;
  stagedCount: number;
  liveCount: number;
  changes: ChangeCountByKind;
  skipped: Record<string, number>;
};
export type DryRunReport = {
  slices: SliceReport[];
  failedDatasets: { datasetKey: string; error: string }[];
  afterStepChanges: ChangeCountByKind;
  siteNames: SiteNameTally;
  licenseeNamesCorrected: number;
  remap: RemapReport | null;
};

export async function readReport(
  tx: DbTx,
  runId: string,
  countedOutsideTheDatabase: Pick<DryRunReport, "siteNames" | "licenseeNamesCorrected" | "remap">,
): Promise<DryRunReport> {
  const slices = await tx
    .select({
      datasetId: officialImportRunSlices.datasetId,
      datasetKey: officialDatasets.key,
      slice: officialImportRunSlices.slice,
      outcome: officialImportRunSlices.outcome,
      stagedCount: officialImportRunSlices.stagedCount,
      liveCount: officialImportRunSlices.liveCount,
    })
    .from(officialImportRunSlices)
    .innerJoin(officialDatasets, eq(officialDatasets.id, officialImportRunSlices.datasetId))
    .where(eq(officialImportRunSlices.runId, runId))
    .orderBy(asc(officialImportRunSlices.datasetId), asc(officialImportRunSlices.slice));
  const skips = await tx.select().from(officialImportRunSkips).where(eq(officialImportRunSkips.runId, runId));
  const changes = await countChanges(tx, runId);
  const failedDatasets = await tx
    .select({ datasetKey: officialDatasets.key, error: officialImportRunDatasets.error })
    .from(officialImportRunDatasets)
    .innerJoin(officialDatasets, eq(officialDatasets.id, officialImportRunDatasets.datasetId))
    .where(and(eq(officialImportRunDatasets.runId, runId), isNotNull(officialImportRunDatasets.error)));

  return {
    ...countedOutsideTheDatabase,
    slices: slices.map(({ datasetId, ...slice }) => ({
      ...slice,
      changes: Object.fromEntries(
        changes.filter((change) => change.datasetId === datasetId && change.slice === slice.slice).map((change) => [change.kind, change.count]),
      ),
      skipped: Object.fromEntries(
        skips.filter((skip) => skip.datasetId === datasetId && skip.slice === slice.slice).map((skip) => [skip.reason, skip.recordCount]),
      ),
    })),
    failedDatasets: failedDatasets.flatMap(({ datasetKey, error }) => (error === null ? [] : [{ datasetKey, error }])),
    afterStepChanges: Object.fromEntries(changes.filter((change) => change.datasetId === null).map((change) => [change.kind, change.count])),
  };
}
