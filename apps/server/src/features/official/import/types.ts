import type { DatasetDefinition, LocalFile, OfficialSourceDefinition, Release } from "@openbts/country-packs/sources";
import {
  officialDatasets,
  officialImportChanges,
  officialImportRunSlices,
  officialImportRunSteps,
  officialImportRuns,
  officialRemapRuns,
} from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import type { DbTx } from "../../../types/global.js";
import type { DirectoryArchive } from "./archive.js";
import type { FileHead } from "./download.js";
import type { DryRunReport } from "./report.js";

const runSelectSchema = createSelectSchema(officialImportRuns);
const datasetSelectSchema = createSelectSchema(officialDatasets);
const changeSelectSchema = createSelectSchema(officialImportChanges);
const runSliceSelectSchema = createSelectSchema(officialImportRunSlices);
const runStepSelectSchema = createSelectSchema(officialImportRunSteps);
const remapRunSelectSchema = createSelectSchema(officialRemapRuns);

type RunRow = z.infer<typeof runSelectSchema>;
type DatasetRow = z.infer<typeof datasetSelectSchema>;
type ChangeIds = "officialSiteId" | "permitId" | "stationId" | "microwaveLinkId" | "fromLocationId";

export type ChangeRow = z.infer<typeof changeSelectSchema>;
export type ChangeKind = ChangeRow["kind"];
export type ChangeInput = Pick<ChangeRow, "kind"> & Partial<Pick<ChangeRow, "datasetId" | "slice" | ChangeIds>>;
export type SliceOutcome = z.infer<typeof runSliceSelectSchema>["outcome"];
export type RunStepName = z.infer<typeof runStepSelectSchema>["step"];
export type RemapRun = Omit<z.infer<typeof remapRunSelectSchema>, "runId">;

export type ClaimedRun = Pick<RunRow, "id" | "sourceId" | "kind" | "isDryRun" | "attempt"> & {
  sourceKey: string;
  claimToken: string;
  startedAt: Date;
};

export type RunDataset = Pick<DatasetRow, "id" | "key" | "holdShrinkPercent"> & { definition: DatasetDefinition };

export type ObtainedFile = LocalFile & { sha256: string; fresh: { sizeBytes: number; head: FileHead | null } | null };
export type PreparedRelease = { dataset: RunDataset; release: Release; files: ObtainedFile[]; sha256: string };

export type SiteNameTally = { written: number; skipped: number };

export type RunScope = {
  run: ClaimedRun;
  source: OfficialSourceDefinition;
  database: Pick<DbTx, "transaction">;
  signal: AbortSignal;
  siteNames: SiteNameTally;
};

export type ReleaseInput = PreparedRelease & { scope: RunScope; snapshotId: number; fileDate: Date };
export type SliceCount = { slice: string; stagedCount: number; liveCount: number };

export type AfterStepContext = {
  run: ClaimedRun;
  source: OfficialSourceDefinition;
  archive: DirectoryArchive;
  lastSeq: number | null;
  transaction<Result>(work: (tx: DbTx) => Promise<Result>): Promise<Result>;
  saveProgress(tx: DbTx, lastSeq: number): Promise<void>;
  markFinished(tx: DbTx): Promise<void>;
  recordError(error: unknown): Promise<void>;
};
export type AfterStep = {
  name: RunStepName;
  runsInDryRun: boolean;
  appliesTo?: (source: OfficialSourceDefinition) => boolean;
  perform(context: AfterStepContext): Promise<void>;
};

export type ImportEnvironment = {
  sources: readonly OfficialSourceDefinition[];
  database: RunScope["database"];
  archive: DirectoryArchive;
  steps: readonly AfterStep[];
  keepDryRunReport(runId: string, report: DryRunReport): Promise<void>;
};
