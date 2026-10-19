import "dotenv/config";
import { type OfficialSourceDefinition, officialSourceByKey, officialSources as sourcesInCode } from "@openbts/country-packs/sources";
import { officialDatasetSlices, officialDatasets, officialSources } from "@openbts/drizzle";
import { sql as connection, db } from "@openbts/drizzle/db";
import { eq } from "drizzle-orm";
import { access } from "node:fs/promises";

import { archiveFromEnvironment } from "../features/official/import/archive.js";
import { saveDryRunReport } from "../features/official/import/dryRunReports.js";
import { type DryRunReport, readReport } from "../features/official/import/report.js";
import { processDryRun, processRun } from "../features/official/import/run.js";
import { cancelRun, claimRun, enqueueRun } from "../features/official/import/runs.js";
import { afterSteps } from "../features/official/import/steps/index.js";
import type { ClaimedRun, ImportEnvironment } from "../features/official/import/types.js";
import { type ImportArguments, type StoredDataset, USAGE, UsageError, chooseDatasets, parseImportArguments } from "./officialImport/arguments.js";
import { localReleaseOf, withLocalRelease } from "./officialImport/localRelease.js";
import { type RunSummary, rehearsalLines, summaryLines } from "./officialImport/summary.js";

const COUNTED_BY_DRY_RUNS_ONLY: Pick<DryRunReport, "siteNames" | "licenseeNamesCorrected" | "remap"> = {
  siteNames: { written: 0, skipped: 0 },
  licenseeNamesCorrected: 0,
  remap: null,
};

async function withLocalFile(
  source: OfficialSourceDefinition,
  dataset: StoredDataset | undefined,
  localFile: ImportArguments["localFile"],
): Promise<OfficialSourceDefinition> {
  if (localFile === null || dataset === undefined) return source;

  await access(localFile.path);
  const slices = await db
    .select({ key: officialDatasetSlices.key })
    .from(officialDatasetSlices)
    .where(eq(officialDatasetSlices.datasetId, dataset.id));
  if (!slices.some(({ key }) => key === localFile.slice)) {
    const known = slices.map(({ key }) => `"${key}"`).join(", ");
    console.log(`note: "${localFile.slice}" would be a new slice of ${dataset.key}; its slices are ${known || "none yet"}`);
  }

  return withLocalRelease(source, dataset.key, localReleaseOf(localFile.path, localFile.slice));
}

async function rehearse(run: ClaimedRun, environment: ImportEnvironment): Promise<DryRunReport> {
  const dryRun = await processDryRun(run, environment);
  if (dryRun.end === "lost") throw new Error(`run ${run.id} was cancelled or taken over`);
  if (dryRun.end === "failed") throw new Error(dryRun.error);

  return dryRun.report;
}

async function apply(run: ClaimedRun, environment: ImportEnvironment): Promise<RunSummary | null> {
  const end = await processRun(run, environment);
  if (end === "lost") throw new Error(`run ${run.id} was cancelled or taken over`);
  if (end === "failed") throw new Error(`run ${run.id} failed; the error is logged above and stored on the run`);
  if (end === "unchanged") return null;

  return db.transaction((tx) => readReport(tx, run.id, COUNTED_BY_DRY_RUNS_ONLY));
}

function print(summary: RunSummary, closingLines: readonly string[]): void {
  for (const line of [...summaryLines(summary), ...closingLines]) console.log(line);
  if (summary.failedDatasets.length > 0) process.exitCode = 1;
}

async function main(): Promise<void> {
  const options = parseImportArguments(process.argv.slice(2));
  const source = officialSourceByKey(options.sourceKey);
  if (source === null) throw new UsageError(`the code has no source ${options.sourceKey}; it has ${sourcesInCode.map(({ key }) => key).join(", ")}`);

  const [storedSource] = await db.select({ id: officialSources.id }).from(officialSources).where(eq(officialSources.key, source.key)).limit(1);
  if (!storedSource) throw new Error(`the database has no source ${source.key}; the importer adds it when it starts`);

  const storedDatasets = await db
    .select({ id: officialDatasets.id, key: officialDatasets.key, isEnabled: officialDatasets.isEnabled })
    .from(officialDatasets)
    .where(eq(officialDatasets.sourceId, storedSource.id));
  const datasets = chooseDatasets(options, source, storedDatasets);
  const environment: ImportEnvironment = {
    sources: [await withLocalFile(source, datasets[0], options.localFile)],
    database: db,
    archive: archiveFromEnvironment(),
    steps: afterSteps,
    keepDryRunReport: saveDryRunReport,
  };

  console.log(options.apply ? "applying" : "dry run, pass --apply to write");
  const runId = await db.transaction((tx) =>
    enqueueRun(tx, {
      sourceId: storedSource.id,
      kind: options.kind,
      trigger: "cli",
      isDryRun: !options.apply,
      datasetIds: datasets.map(({ id }) => id),
      requestedById: null,
      approvals: [],
    }),
  );
  if (options.enqueue) {
    console.log(`queued run ${runId}; the importer picks it up`);
    return;
  }

  const run = await claimRun(runId);
  if (run === null) {
    await cancelRun(db, runId);
    throw new Error(`run ${runId} could not be claimed and was cancelled: ${source.key} has a running run, or the importer took this one first`);
  }

  if (run.isDryRun) {
    const report = await rehearse(run, environment);
    print(report, rehearsalLines(report));
  } else {
    const summary = await apply(run, environment);
    if (summary === null) console.log(`nothing changed; run ${run.id} is not kept`);
    else print(summary, [`run ${run.id} is done`]);
  }
}

main()
  .catch((error: unknown) => {
    if (error instanceof UsageError) console.error(`${error.message}\n${USAGE}`);
    else console.error("import failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await connection.end();
    process.exit();
  });
