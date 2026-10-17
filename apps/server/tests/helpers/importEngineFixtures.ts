import type { OfficialSourceDefinition } from "@openbts/country-packs/sources";
import { DrizzleQueryError } from "drizzle-orm";
import postgres from "postgres";

import { runAfterSteps } from "../../src/features/official/import/afterSteps.js";
import { type DirectoryArchive, directoryArchive } from "../../src/features/official/import/archive.js";
import type { AfterStep, ChangeRow, ClaimedRun } from "../../src/features/official/import/types.js";
import type { DbTx } from "../../src/types/global.js";
import { type DatabaseCall, dbMock, queryOf } from "./boundaries.js";

export const RUN_ID = "0199d000-0000-7000-8000-000000000001";
const CLAIM_TOKEN = "0199d000-0000-7000-8000-00000000aaaa";
export const FOREIGN_TOKEN = "0199d000-0000-7000-8000-00000000bbbb";

export function claimedRun(overrides: Partial<ClaimedRun> = {}): ClaimedRun {
  return {
    id: RUN_ID,
    sourceId: 1,
    sourceKey: "pl-uke",
    kind: "import",
    isDryRun: false,
    attempt: 1,
    claimToken: CLAIM_TOKEN,
    startedAt: new Date("2026-10-12T14:15:16.789Z"),
    ...overrides,
  };
}

export function sourceOf(overrides: Partial<OfficialSourceDefinition> = {}): OfficialSourceDefinition {
  return {
    key: "pl-uke",
    countryCode: "PL",
    shortName: "UKE",
    authority: "Test authority",
    homepageUrl: "https://authority.invalid",
    licence: "none stated",
    attribution: "Source: test",
    isRedistributable: true,
    shortLicenseeName: (publishedName) => publishedName,
    operatorNameOfLicensee: () => null,
    datasets: [],
    ...overrides,
  };
}

export function change(seq: number, kind: ChangeRow["kind"], ids: Partial<ChangeRow> = {}): ChangeRow {
  return {
    runId: RUN_ID,
    seq,
    kind,
    datasetId: null,
    slice: null,
    officialSiteId: null,
    permitId: null,
    stationId: null,
    microwaveLinkId: null,
    fromLocationId: null,
    ...ids,
  };
}

export function databaseFailure(code: string, message: string): DrizzleQueryError {
  const Failure = postgres.PostgresError as unknown as new (data: { code: string; message: string }) => postgres.PostgresError;
  return new DrizzleQueryError("UPDATE notifications SET read_at = now()", [], new Failure({ code, message }));
}

export function lostDeadlock(): DrizzleQueryError {
  return databaseFailure("40P01", "deadlock detected");
}

export function recordTransactions(): void {
  dbMock.transaction.mockImplementation(async (work: (database: unknown) => Promise<unknown>) => {
    dbMock.calls.push({ operation: "begin", clauses: {} });
    try {
      const result = await work(dbMock);
      dbMock.calls.push({ operation: "commit", clauses: {} });
      return result;
    } catch (error) {
      dbMock.calls.push({ operation: "rollback", clauses: {} });
      throw error;
    }
  });
}

export function ownRun(transactions: number, claimToken = CLAIM_TOKEN): void {
  for (let transaction = 0; transaction < transactions; transaction += 1) {
    dbMock.enqueueFor("select", "official.import_runs", [{ claimToken, state: "running" }]);
  }
}

export function scriptStepStart(stored?: { lastSeq: number | null; finishedAt?: Date | null }): void {
  ownRun(1);
  dbMock.enqueueFor("select", "official.import_run_steps", stored ? [{ finishedAt: null, ...stored }] : []);
  if (!stored) dbMock.enqueueFor("insert", "official.import_run_steps", undefined);
  else if (!stored.finishedAt) dbMock.enqueueFor("update", "official.import_run_steps", undefined);
}

export const UKE_DATASETS = [
  { datasetId: 1, key: "permits", layer: "sites" },
  { datasetId: 2, key: "device-registry", layer: "sites" },
  { datasetId: 3, key: "microwave-links", layer: "microwave_links" },
] as const;

export function scriptDatasetOutcomes(
  runDatasets: readonly { datasetId: number; error: string | null }[],
  runSlices: readonly { datasetId: number; slice: string; outcome: "applied" | "unchanged" | "held" }[],
  datasets: readonly { datasetId: number; key: string; layer: "sites" | "microwave_links" }[] = UKE_DATASETS,
): void {
  dbMock.enqueueFor("select", "official.datasets", [...datasets]);
  dbMock.enqueueFor("select", "official.import_run_datasets", [...runDatasets]);
  dbMock.enqueueFor("select", "official.import_run_slices", [...runSlices]);
}

export function scriptStepFinish(): void {
  ownRun(1);
  dbMock.enqueueFor("update", "official.import_run_steps", undefined);
}

export function runStep(
  step: AfterStep,
  {
    run = claimedRun(),
    source = sourceOf(),
    archive = directoryArchive("unused"),
  }: { run?: ClaimedRun; source?: OfficialSourceDefinition; archive?: DirectoryArchive } = {},
): Promise<void> {
  const scope = { run, source, database: dbMock as unknown as DbTx, signal: new AbortController().signal, siteNames: { written: 0, skipped: 0 } };
  return runAfterSteps(scope, [step], archive);
}

export function statementOf(call: DatabaseCall | undefined): { sql: string; params: unknown[] } {
  const statement = queryOf(call?.clauses.statement?.[0]);
  return { sql: statement.sql.replace(/\s+/g, " ").trim(), params: statement.params };
}

export function whereOf(call: DatabaseCall | undefined): { sql: string; params: unknown[] } {
  const condition = queryOf(call?.clauses.where?.[0]);
  return { sql: condition.sql, params: condition.params };
}

export function trace(labels: readonly (readonly [RegExp, string])[] = []): string[] {
  return dbMock.calls.map((call) => {
    if (call.operation !== "execute") return [call.operation, call.table].filter(Boolean).join(" ");

    const { sql } = statementOf(call);
    return labels.find(([pattern]) => pattern.test(sql))?.[1] ?? sql;
  });
}

export function valuesOf(operation: string, table: string): unknown[] {
  return dbMock.calls.filter((call) => call.operation === operation && call.table === table).map((call) => call.values);
}

export function transactionsOf(operations: readonly string[]): string[][] {
  const transactions: string[][] = [];
  for (const operation of operations) {
    if (operation === "begin") transactions.push([]);
    else transactions.at(-1)?.push(operation);
  }
  return transactions;
}
