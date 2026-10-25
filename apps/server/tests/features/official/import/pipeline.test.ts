import type { MicrowaveLinkRecord, OfficialSourceDefinition, PermitKind, SiteRecord, SitesDataset } from "@openbts/country-packs/sources";
import { PgDialect } from "drizzle-orm/pg-core";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { directoryArchive } from "../../../../src/features/official/import/archive.js";
import { type StoredLink, toLinkValues } from "../../../../src/features/official/import/links/values.js";
import { processDryRun, processRun } from "../../../../src/features/official/import/run.js";
import { RunNotOwnedError } from "../../../../src/features/official/import/runs.js";
import { unlistedPermits } from "../../../../src/features/official/import/steps/unlistedPermits.js";
import type { ImportEnvironment } from "../../../../src/features/official/import/types.js";
import type { DbTx } from "../../../../src/types/global.js";
import { logger } from "../../../../src/utils/logger.js";
import { type DatabaseCall, dbMock } from "../../../helpers/boundaries.js";
import {
  FOREIGN_TOKEN,
  RUN_ID,
  claimedRun,
  ownRun,
  recordTransactions,
  scriptDatasetOutcomes,
  sourceOf,
  valuesOf,
  whereOf,
} from "../../../helpers/importEngineFixtures.js";

const FILE_DATE = new Date("2026-10-01T14:15:16.789Z");
const ZIP_FILE = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("workbook")]);
const ZIP_FILE_SHA256 = createHash("sha256").update(ZIP_FILE).digest("hex");
const SITES_FILE_URL = "https://files.invalid/2026-10-01_north.xlsx";
const SITES_DATASET = { id: 1, key: "towers", holdShrinkPercent: null, error: null };
const LINKS_DATASET = { id: 3, key: "links", holdShrinkPercent: null, error: null };
const STORED_DATASETS = [
  { datasetId: SITES_DATASET.id, key: SITES_DATASET.key, layer: "sites" },
  { datasetId: LINKS_DATASET.id, key: LINKS_DATASET.key, layer: "microwave_links" },
] as const;
const NORTH_APPLIED = { datasetId: SITES_DATASET.id, slice: "north", outcome: "applied" } as const;
const NORTH_HELD = { datasetId: SITES_DATASET.id, slice: "north", outcome: "held" } as const;
const NORTH_UNCHANGED = { datasetId: SITES_DATASET.id, slice: "north", outcome: "unchanged" } as const;
const LINKS_APPLIED = { datasetId: LINKS_DATASET.id, slice: "", outcome: "applied" } as const;

const dialect = new PgDialect();
const EXECUTED_STATEMENTS: readonly (readonly [RegExp, string])[] = [
  [
    /^SELECT place\.id, COALESCE\(known\.region_id, region_at\(place\.longitude, place\.latitude, claimed\.id\), claimed\.id\) AS "regionId"/,
    "resolve: regions",
  ],
  [/^SELECT published\.licensee FROM jsonb_array_elements_text\(\$1::jsonb\) AS published \(licensee\) ORDER BY/, "resolve: order licensee names"],
  [/^SET LOCAL effective_io_concurrency = 16$/, "stage: limit read-ahead"],
  [/^SET LOCAL work_mem = '64MB'$/, "stage: raise work memory"],
  [
    /^DO \$create\$ BEGIN IF to_regclass\('"pg_temp"\."official_import_staged_permits"'\) IS NULL THEN CREATE TEMPORARY TABLE/,
    "stage: create the table",
  ],
  [/^TRUNCATE/, "stage: empty the table"],
  [/^INSERT INTO "pg_temp"/, "stage: records"],
  [/^ANALYZE "pg_temp"\."official_import_staged_permits"$/, "stage: analyze"],
  [/^UPDATE "official"\."locations" AS location/, "apply: update locations named by the register"],
  [/SET location_id = moved\.to_location_id/, "apply: move sites"],
  [/^WITH added AS/, "apply: insert sites"],
  [/^ANALYZE "pg_temp"\."official_import_staged_permits" \(location_id, official_site_id\)$/, "apply: analyze site ids"],
  [/^ANALYZE "pg_temp"\."official_import_staged_permits" \(permit_id\)$/, "apply: analyze permit ids"],
  [/^WITH listed AS/, "apply: insert listings"],
  [/^DELETE FROM "official"\."permit_sectors"/, "apply: delete unpublished sectors"],
  [/^INSERT INTO "official"\."permit_sectors"/, "apply: insert sectors"],
  [/^DELETE FROM "official"\."permit_listings"/, "apply: unlist"],
  [/^UPDATE "official"\."microwave_links" AS link/, "apply: update links"],
];
const STAGED_PERMITS = "official_import_staged_permits";

type StagedRow = {
  ordinal: number;
  slice: string;
  region_id: number;
  site_code: string;
  licensee_id: number;
  operator_id: number;
  site_name: string | null;
  site_name_ordinal: number | null;
  decision_number: string;
  sectors: { azimuth: number | null; antenna_height: number | null; antenna_type: string | null }[];
};

let archiveDirectory: string;
let environment: ImportEnvironment;
let keptReports: Parameters<ImportEnvironment["keepDryRunReport"]>[];

function executedQuery(call: DatabaseCall) {
  return dialect.sqlToQuery(call.clauses.statement?.[0] as Parameters<PgDialect["sqlToQuery"]>[0]);
}

function executedText(call: DatabaseCall): string {
  return executedQuery(call).sql.replace(/\s+/g, " ").trim();
}

function executedLabel(call: DatabaseCall): string {
  const text = executedText(call);
  return EXECUTED_STATEMENTS.find(([pattern]) => pattern.test(text))?.[1] ?? text;
}

function trace(): string[] {
  return dbMock.calls.map((call) => (call.operation === "execute" ? executedLabel(call) : [call.operation, call.table].filter(Boolean).join(" ")));
}

function writesOf(operations: readonly string[]): string[] {
  return operations.filter((operation) => /^(insert|update|delete|apply|stage: records)/.test(operation));
}

function siteRecord(overrides: { siteId?: string; name?: string | null; slice?: string } = {}): SiteRecord {
  return {
    slice: overrides.slice ?? "north",
    location: { longitude: 21.0123, latitude: 52.2297, city: "Warszawa", address: "ul. Testowa 1", regionIsoCode: "PL-14" },
    site: { siteId: overrides.siteId ?? "BT1001", licensee: "Orange Polska S.A.", name: overrides.name ?? null },
    permit: {
      label: { rat: "LTE", mhz: 800, variant: "commercial" },
      number: "DZC/1",
      decisionType: "permit",
      expiresOn: "2030-01-01",
      status: null,
    },
    sectors: [{ azimuth: 120, antennaHeight: 30.5, antennaPlacement: "outdoor" }],
  };
}

function linkRecord(overrides: Partial<MicrowaveLinkRecord> = {}): MicrowaveLinkRecord {
  return {
    slice: "",
    licensee: "Orange Polska S.A.",
    permitNumber: "RL/1",
    decisionType: "permit",
    issuedOn: "2025-01-01",
    expiresOn: "2030-01-01",
    tx: {
      longitude: 21.01,
      latitude: 52.22,
      groundHeight: 110,
      antennaHeight: 30,
      city: "Warszawa",
      province: null,
      street: null,
      locationDescription: null,
    },
    rx: {
      longitude: 21.05,
      latitude: 52.25,
      groundHeight: 120,
      antennaHeight: 25,
      city: "Marki",
      province: null,
      street: null,
      locationDescription: null,
    },
    freqKhz: 23_000_000,
    channelNumber: 5,
    channelWidthMhz: 28,
    polarization: "V",
    eirpDbm: 30.5,
    technical: { transmitter: { type: "RTN 950", manufacturer: "Huawei" } },
    publishesEveryTechnicalColumn: false,
    ...overrides,
  };
}

function storedLink(id: number, record: MicrowaveLinkRecord): StoredLink {
  return {
    plan_symbol: null,
    modulation_type: null,
    bandwidth: null,
    tx_antenna_attenuation: null,
    tx_transmitter_type_id: null,
    tx_antenna_type_id: null,
    tx_antenna_gain: null,
    rx_antenna_type_id: null,
    rx_antenna_gain: null,
    rx_noise_figure: null,
    rx_atpc_attenuation: null,
    ...toLinkValues(record, 8, { transmitterTypeIds: new Map([["RTN 950", 31]]), antennaTypeIds: new Map() }),
    id,
    dataset_id: LINKS_DATASET.id,
    source_ref: null,
    specs_date: null,
    updatedAt: FILE_DATE,
    createdAt: FILE_DATE,
  };
}

type Readers = {
  sites?: () => AsyncIterable<SiteRecord>;
  links?: () => AsyncIterable<MicrowaveLinkRecord>;
  sitesCover?: readonly string[];
  sitesPermitKind?: PermitKind;
  syncSiteNames?: SitesDataset["syncSiteNames"];
};

function sourceWith(readers: Readers): OfficialSourceDefinition {
  const release = (coveredSlices: readonly string[], fileName: string) => [
    { coveredSlices, files: [{ url: `https://files.invalid/${fileName}`, fileName }], publishedOn: "2026-10-01" },
  ];

  return sourceOf({
    shortLicenseeName: (publishedName) => publishedName.replace(/ S\.A\.$/, ""),
    datasets: [
      {
        key: "towers",
        layer: "sites",
        permitKind: readers.sitesPermitKind ?? "permit",
        checkEveryHours: 6,
        discover: async () => release(readers.sitesCover ?? ["north"], "2026-10-01_north.xlsx"),
        parse: (context) => {
          context.skip("north", "bad_coordinates");
          return readers.sites?.() ?? (async function* empty() {})();
        },
        syncSiteNames: readers.syncSiteNames,
      },
      {
        key: "links",
        layer: "microwave_links",
        permitKind: "permit",
        checkEveryHours: 6,
        discover: async () => release([""], "2026-10-01_links.xlsx"),
        parse: () => readers.links?.() ?? (async function* empty() {})(),
      },
    ],
  });
}

async function* recordsOf<PublishedRecord>(records: readonly PublishedRecord[]): AsyncIterable<PublishedRecord> {
  yield* records;
}

function scriptStatements(...results: unknown[][]): void {
  dbMock.enqueueFor("execute", undefined, ...results);
}

function jsonParamsOf<Param>(label: string): Param[] {
  return dbMock.calls
    .filter((call) => call.operation === "execute" && executedLabel(call) === label)
    .map((call): Param => JSON.parse(String(executedQuery(call).params[0])));
}

function stagedRows(): StagedRow[] {
  return jsonParamsOf<StagedRow[]>("stage: records").flat();
}

function scriptPreparation(): void {
  dbMock.enqueueFor("select", "official.import_run_slices", []);
  dbMock.enqueueFor("select", "official.import_run_approvals", []);
  dbMock.enqueueFor("select", "official.listed_files", []);
}

function scriptRehearsalWithoutDatasets(): void {
  dbMock.enqueueFor("select", "official.import_run_datasets", [], []);
  ownRun(1);
  dbMock.enqueueFor("select", "official.licensees", []);
  dbMock.enqueueFor("select", "official.import_run_slices", []);
  dbMock.enqueueFor("select", "official.import_run_skips", []);
  dbMock.enqueueFor("select", "official.import_changes", []);
}

function listedAsServed(): Record<string, unknown> {
  return {
    sourceId: 1,
    url: SITES_FILE_URL,
    fileName: "2026-10-01_north.xlsx",
    sizeBytes: ZIP_FILE.length,
    publishedOn: "2026-10-01",
    etag: '"v1"',
    lastModified: null,
    fileSha256: ZIP_FILE_SHA256,
    checkedAt: new Date(),
  };
}

function requestsOf(method: "HEAD" | "GET"): number {
  return vi.mocked(fetch).mock.calls.filter(([, init]) => (init?.method ?? "GET") === method).length;
}

function scriptRecordedRelease(snapshotId: number): void {
  dbMock.enqueueFor("select", "official.files", []);
  dbMock.enqueueFor("insert", "official.files", undefined);
  dbMock.enqueueFor("select", "official.snapshots", []);
  dbMock.enqueueFor("insert", "official.snapshots", [{ id: snapshotId }]);
  dbMock.enqueueFor("insert", "official.snapshot_files", undefined);
  dbMock.enqueueFor("select", "official.dataset_slices", []);
  dbMock.enqueueFor("insert", "official.dataset_slices", undefined);
  dbMock.enqueueFor("select", "official.snapshot_slices", []);
  dbMock.enqueueFor("insert", "official.snapshot_slices", undefined);
  dbMock.enqueueFor("insert", "official.listed_files", undefined);
}

function scriptResolution(regionIds: readonly (number | null)[], licensees: readonly string[]): void {
  scriptStatements(
    regionIds.map((regionId, id) => ({ id, regionId })),
    licensees.map((licensee) => ({ licensee })),
  );
}

function scriptStaging(insertedBatches: number): void {
  scriptStatements([], [], [], [], ...Array.from({ length: insertedBatches }, () => []), []);
}

function scriptStagedSites(staged: { live: number }): void {
  dbMock.enqueueFor("select", "official.dataset_slices", [{ slice: "north", snapshotId: null }]);
  scriptResolution([14], ["Orange Polska S.A."]);
  dbMock.enqueueFor("select", "official.licensees", [{ id: 8, legalName: "Orange Polska S.A.", operatorId: 4 }]);
  scriptStaging(1);
  dbMock.enqueueFor("select", "official.permit_listings", staged.live > 0 ? [{ slice: "north", listings: staged.live }] : []);
  dbMock.enqueueFor("select", "official.import_run_approvals", []);
}

function scriptStagedMatches(updates = 10): void {
  dbMock.enqueueFor("update", STAGED_PERMITS, ...Array.from({ length: updates }, () => undefined));
}

function scriptAppliedSites({ replacesSectors = false }: { replacesSectors?: boolean } = {}): void {
  scriptStagedMatches();
  scriptStatements([]);
  dbMock.enqueueFor("insert", "official.locations", [{ id: 12 }], []);
  dbMock.enqueueFor("select", STAGED_PERMITS, [{ officialSiteId: 503, fromLocationId: 11, locationId: 12, firstOrdinal: 0, slice: "north" }]);
  scriptStatements([]);
  scriptStatements([{ officialSiteId: 504, slice: "north" }], [], []);
  dbMock.enqueueFor("insert", "official.permits", [{ id: 701 }]);
  scriptStatements([]);
  dbMock.enqueueFor("update", "official.permits", undefined);
  dbMock.enqueueFor("update", "official.permit_listings", undefined);
  scriptStatements([
    { permitId: 701, slice: "north", officialSiteId: 504 },
    { permitId: 650, slice: "north", officialSiteId: 501 },
  ]);
  if (replacesSectors) scriptStatements([]);
  scriptStatements([], [{ permitId: 600, slice: "north", officialSiteId: 502, wasLastListing: true }]);
  dbMock.enqueueFor("update", "official.sites", undefined);
}

function scriptAppliedSitesWithoutChanges(): void {
  scriptStagedMatches(5);
  dbMock.enqueueFor("insert", "official.locations", [], []);
  dbMock.enqueueFor("select", STAGED_PERMITS, []);
  dbMock.enqueueFor("insert", "official.permits", []);
  dbMock.enqueueFor("update", "official.permits", undefined);
  dbMock.enqueueFor("update", "official.permit_listings", undefined);
  scriptStatements([], [], [], [], [], [], [], []);
}

function scriptCheckpoint(written: { skips?: boolean; changes?: boolean; slicesApplied?: boolean } = {}): void {
  dbMock.enqueueFor("insert", "official.import_run_slices", undefined);
  if (written.skips) dbMock.enqueueFor("insert", "official.import_run_skips", undefined);
  if (written.changes) dbMock.enqueueFor("insert", "official.import_changes", undefined);
  if (written.slicesApplied) dbMock.enqueueFor("update", "official.dataset_slices", undefined);
  dbMock.enqueueFor("update", "official.import_runs", undefined);
}

function scriptChangeCheck(
  runSlices: Parameters<typeof scriptDatasetOutcomes>[1],
  runDatasets: Parameters<typeof scriptDatasetOutcomes>[0] = [],
): void {
  ownRun(1);
  scriptDatasetOutcomes(runDatasets, runSlices, STORED_DATASETS);
}

function scriptAppliedLinks(stored: readonly StoredLink[]): void {
  dbMock.enqueueFor("select", "official.dataset_slices", [{ slice: "", snapshotId: null }]);
  dbMock.enqueueFor("select", "official.licensees", [{ id: 8, legalName: "Orange Polska S.A.", operatorId: 4 }]);
  dbMock.enqueueFor("count", "official.microwave_links", stored.length);
  dbMock.enqueueFor("select", "official.import_run_approvals", []);
  dbMock.enqueueFor("select", "official.microwave_link_manufacturers", [{ id: 11, name: "Huawei" }]);
  dbMock.enqueueFor("select", "official.microwave_link_antenna_types", []);
  dbMock.enqueueFor("select", "official.microwave_link_transmitter_types", []);
  dbMock.enqueueFor("insert", "official.microwave_link_transmitter_types", [{ id: 31, name: "RTN 950" }]);
  dbMock.enqueueFor("select", "official.microwave_links", [...stored]);
  dbMock.enqueueFor("insert", "official.microwave_links", [{ id: 804 }]);
  scriptStatements([]);
  dbMock.enqueueFor("delete", "official.microwave_links", undefined);
}

beforeEach(() => {
  archiveDirectory = mkdtempSync(path.join(tmpdir(), "official-import-test-"));
  keptReports = [];
  environment = {
    sources: [],
    database: dbMock as unknown as DbTx,
    archive: directoryArchive(archiveDirectory),
    steps: [],
    keepDryRunReport: async (...kept) => {
      dbMock.calls.push({ operation: "keep the dry-run report", clauses: {} });
      keptReports.push(kept);
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "HEAD" ? new Response(null, { headers: { "content-length": String(ZIP_FILE.length), etag: '"v1"' } }) : new Response(ZIP_FILE),
    ),
  );
  recordTransactions();
});

afterEach(() => {
  rmSync(archiveDirectory, { recursive: true, force: true });
});

describe("a run through the engine", () => {
  it("applies a sites release and a links release, each in one transaction, in order", async () => {
    const kept = linkRecord();
    const gone = linkRecord({ permitNumber: "RL/gone", freqKhz: 11_000_000 });
    const source = sourceWith({
      sites: () => recordsOf([siteRecord(), siteRecord({ siteId: "X".repeat(17) })]),
      links: () => recordsOf([linkRecord({ eirpDbm: 31 }), linkRecord({ permitNumber: "RL/new", freqKhz: 38_000_000 })]),
    });
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET, LINKS_DATASET]);
    ownRun(10);

    scriptPreparation();
    scriptRecordedRelease(41);
    scriptStagedSites({ live: 1 });
    scriptAppliedSites();
    scriptCheckpoint({ skips: true, changes: true, slicesApplied: true });

    scriptPreparation();
    scriptRecordedRelease(42);
    scriptAppliedLinks([storedLink(801, kept), storedLink(803, gone)]);
    scriptCheckpoint({ changes: true, slicesApplied: true });

    dbMock.enqueueFor("select", "official.import_run_steps", []);
    dbMock.enqueueFor("insert", "official.import_run_steps", undefined);
    dbMock.enqueueFor("select", "official.permits", [{ permitId: 600, officialSiteId: 502 }]);
    dbMock.enqueueFor("select", "stations_permits", [{ permitId: 600, stationId: 100 }]);
    dbMock.enqueueFor("insert", "official.import_changes", undefined);
    dbMock.enqueueFor("delete", "official.permits", undefined);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptChangeCheck([NORTH_APPLIED, LINKS_APPLIED]);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    const end = await processRun(claimedRun(), { ...environment, sources: [source], steps: [unlistedPermits] });

    expect(end).toBe("done");
    expect(dbMock.pendingResults()).toBe(0);
    expect(trace()).toEqual([
      "select official.import_run_datasets",
      "select official.import_run_slices",
      "select official.import_run_approvals",
      "select official.listed_files",

      "begin",
      "select official.import_runs",
      "select official.files",
      "insert official.files",
      "select official.snapshots",
      "insert official.snapshots",
      "insert official.snapshot_files",
      "select official.dataset_slices",
      "insert official.dataset_slices",
      "select official.snapshot_slices",
      "insert official.snapshot_slices",
      "insert official.listed_files",
      "commit",

      "begin",
      "select official.import_runs",
      "select official.dataset_slices",
      "commit",
      "begin",
      "select official.import_runs",
      "resolve: regions",
      "resolve: order licensee names",
      "select official.licensees",
      "stage: limit read-ahead",
      "stage: raise work memory",
      "stage: create the table",
      "stage: empty the table",
      "stage: records",
      "stage: analyze",
      "select official.permit_listings",
      "select official.import_run_approvals",
      "update official_import_staged_permits",
      "update official_import_staged_permits",
      "apply: update locations named by the register",
      "insert official.locations",
      "insert official.locations",
      "update official_import_staged_permits",
      "update official_import_staged_permits",
      "update official_import_staged_permits",
      "update official_import_staged_permits",
      `select ${STAGED_PERMITS}`,
      "apply: move sites",
      "apply: insert sites",
      "apply: insert sites",
      "update official_import_staged_permits",
      "update official_import_staged_permits",
      "apply: analyze site ids",
      "update official_import_staged_permits",
      "insert official.permits",
      "update official_import_staged_permits",
      "apply: analyze permit ids",
      "update official.permits",
      "update official.permit_listings",
      "apply: insert listings",
      "apply: insert sectors",
      "apply: unlist",
      "update official.sites",
      "insert official.import_run_slices",
      "insert official.import_run_skips",
      "insert official.import_changes",
      "update official.dataset_slices",
      "update official.import_runs",
      "commit",

      "select official.import_run_slices",
      "select official.import_run_approvals",
      "select official.listed_files",

      "begin",
      "select official.import_runs",
      "select official.files",
      "insert official.files",
      "select official.snapshots",
      "insert official.snapshots",
      "insert official.snapshot_files",
      "select official.dataset_slices",
      "insert official.dataset_slices",
      "select official.snapshot_slices",
      "insert official.snapshot_slices",
      "insert official.listed_files",
      "commit",

      "begin",
      "select official.import_runs",
      "select official.dataset_slices",
      "commit",
      "begin",
      "select official.import_runs",
      "select official.licensees",
      "count official.microwave_links",
      "select official.import_run_approvals",
      "select official.microwave_link_manufacturers",
      "select official.microwave_link_antenna_types",
      "select official.microwave_link_transmitter_types",
      "insert official.microwave_link_transmitter_types",
      "select official.microwave_links",
      "insert official.microwave_links",
      "apply: update links",
      "delete official.microwave_links",
      "insert official.import_run_slices",
      "insert official.import_changes",
      "update official.dataset_slices",
      "update official.import_runs",
      "commit",

      "begin",
      "select official.import_runs",
      "select official.datasets",
      "select official.import_run_datasets",
      "select official.import_run_slices",
      "commit",

      "begin",
      "select official.import_runs",
      "select official.import_run_steps",
      "insert official.import_run_steps",
      "commit",
      "begin",
      "select official.import_runs",
      "select official.permits",
      "select stations_permits",
      "insert official.import_changes",
      "delete official.permits",
      "commit",
      "begin",
      "select official.import_runs",
      "update official.import_run_steps",
      "commit",
      "begin",
      "select official.import_runs",
      "update official.import_runs",
      "commit",
    ]);

    expect(valuesOf("insert", "official.import_run_slices")).toEqual([
      [{ runId: RUN_ID, datasetId: 1, snapshotId: 41, slice: "north", outcome: "applied", stagedCount: 1, liveCount: 1 }],
      [{ runId: RUN_ID, datasetId: 3, snapshotId: 42, slice: "", outcome: "applied", stagedCount: 2, liveCount: 2 }],
    ]);
    expect(valuesOf("insert", "official.import_run_skips")).toEqual([
      [
        { runId: RUN_ID, datasetId: 1, slice: "north", reason: "bad_coordinates", recordCount: 1 },
        { runId: RUN_ID, datasetId: 1, slice: "north", reason: "site_id_too_long", recordCount: 1 },
      ],
    ]);
    expect(valuesOf("insert", "official.import_changes")).toEqual([
      [
        { runId: RUN_ID, kind: "site_added", datasetId: 1, slice: "north", officialSiteId: 504 },
        { runId: RUN_ID, kind: "site_moved", datasetId: 1, slice: "north", officialSiteId: 503, fromLocationId: 11 },
        { runId: RUN_ID, kind: "permit_added", datasetId: 1, slice: "north", officialSiteId: 504, permitId: 701 },
        { runId: RUN_ID, kind: "permit_listed", datasetId: 1, slice: "north", officialSiteId: 501, permitId: 650 },
        { runId: RUN_ID, kind: "permit_unlisted", datasetId: 1, slice: "north", officialSiteId: 502, permitId: 600 },
      ],
      [
        { runId: RUN_ID, kind: "microwave_link_added", datasetId: 3, slice: "", microwaveLinkId: 804 },
        { runId: RUN_ID, kind: "microwave_link_archived", datasetId: 3, slice: "", microwaveLinkId: 803 },
      ],
      [
        { runId: RUN_ID, kind: "permit_archived", officialSiteId: 502, permitId: 600 },
        { runId: RUN_ID, kind: "station_unlinked", permitId: 600, stationId: 100 },
      ],
    ]);
    const linkUpdates = dbMock.calls.filter((call) => call.operation === "execute" && executedLabel(call) === "apply: update links");
    expect(linkUpdates.map((call) => executedQuery(call).params[0])).toEqual([FILE_DATE.toISOString()]);
    expect(linkUpdates.map((call) => JSON.parse(String(executedQuery(call).params[1])))).toEqual([
      [expect.objectContaining({ id: 801, tx_eirp: 31, permit_number: "RL/1", licensee_id: 8 })],
    ]);
    const [linkUpdate = ""] = linkUpdates.map(executedText);
    expect(linkUpdate).toContain('"tx_transmitter_type_id" = changed."tx_transmitter_type_id"');
    expect(linkUpdate).toContain('"licensee_id" integer');
    expect(linkUpdate).not.toContain('"modulation_type"');
    expect(valuesOf("insert", "official.microwave_links")).toEqual([
      [expect.objectContaining({ permit_number: "RL/new", operator_id: 8, tx_transmitter_type_id: 31, dataset_id: 3, createdAt: FILE_DATE })],
    ]);
  });

  it("stages a permit without an expiry as an empty day and matches it to the stored permit without one", async () => {
    const record = siteRecord();
    const source = sourceWith({ sites: () => recordsOf([{ ...record, permit: { ...record.permit, expiresOn: null } }]) });
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    ownRun(4);
    scriptPreparation();
    scriptRecordedRelease(41);
    scriptStagedSites({ live: 1 });
    scriptAppliedSites();
    scriptCheckpoint({ skips: true, changes: true, slicesApplied: true });
    scriptChangeCheck([NORTH_APPLIED]);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    expect(await processRun(claimedRun(), { ...environment, sources: [source] })).toBe("done");

    const executed = dbMock.calls.filter((call) => call.operation === "execute");
    const texts = executed.map((call) => executedText(call));
    const stagedRows = executed.filter((call) => executedText(call).startsWith('INSERT INTO "pg_temp"')).map((call) => executedQuery(call).params[0]);
    expect(texts.find((text) => text.startsWith("DO $create$"))).toContain(
      "expiry_date date, status official_permit_status, sectors jsonb NOT NULL,",
    );
    expect(texts.find((text) => text.startsWith('INSERT INTO "pg_temp"'))).toContain(
      "official_decision_type, expiry_date date, status official_permit_status, sectors jsonb",
    );
    expect(stagedRows.map((rows) => JSON.parse(String(rows)))).toEqual([[expect.objectContaining({ decision_type: "permit", expiry_date: null })]]);
    const permitMatches = dbMock.calls.filter(
      (call) => call.operation === "update" && call.table === STAGED_PERMITS && (call.values as Record<string, unknown>).permitId !== undefined,
    );
    expect(permitMatches.map((call) => whereOf(call).sql)).toEqual([
      expect.stringContaining('"official"."permits"."expiry_date" IS NOT DISTINCT FROM "pg_temp"."official_import_staged_permits"."expiry_date"'),
      expect.stringContaining('"official"."permits"."expiry_date" IS NOT DISTINCT FROM "pg_temp"."official_import_staged_permits"."expiry_date"'),
    ]);
  });

  it.each(["inventory", "registration"] as const)(
    "drops the sectors a %s release no longer lists, and updates a changed status",
    async (sitesPermitKind) => {
      const record = siteRecord();
      const source = sourceWith({ sitesPermitKind, sites: () => recordsOf([{ ...record, permit: { ...record.permit, status: "approved" } }]) });
      dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
      ownRun(4);
      scriptPreparation();
      scriptRecordedRelease(41);
      scriptStagedSites({ live: 1 });
      scriptAppliedSites({ replacesSectors: true });
      scriptCheckpoint({ skips: true, changes: true, slicesApplied: true });
      scriptChangeCheck([NORTH_APPLIED]);
      dbMock.enqueueFor("update", "official.import_runs", undefined);

      expect(await processRun(claimedRun(), { ...environment, sources: [source] })).toBe("done");

      const stagedRows = dbMock.calls
        .filter((call) => call.operation === "execute" && executedText(call).startsWith('INSERT INTO "pg_temp"'))
        .map((call) => JSON.parse(String(executedQuery(call).params[0])));
      expect(stagedRows).toEqual([[expect.objectContaining({ status: "approved" })]]);
      const statusUpdate = dbMock.calls.find((call) => call.operation === "update" && call.table === "official.permits");
      expect(whereOf(statusUpdate).sql).toContain(
        '"official"."permits"."status" IS DISTINCT FROM "pg_temp"."official_import_staged_permits"."status"',
      );
      const operations = trace();
      expect(operations[operations.indexOf("apply: insert sectors") - 1]).toBe("apply: delete unpublished sectors");
    },
  );

  it("stages one row per permit with its lines' sectors in line order, and counts permits for the guard and lines for the skips", async () => {
    const line = (overrides: { siteId?: string; name?: string | null; licensee?: string; longitude?: number }, azimuth: number): SiteRecord => {
      const record = siteRecord({ siteId: overrides.siteId, name: overrides.name });
      return {
        ...record,
        location: { ...record.location, longitude: overrides.longitude ?? record.location.longitude },
        site: { ...record.site, licensee: overrides.licensee ?? record.site.licensee },
        sectors: [{ azimuth, antennaHeight: 30.5, antennaPlacement: "outdoor" }],
      };
    };
    const source: OfficialSourceDefinition = {
      ...sourceWith({
        sites: () =>
          recordsOf([
            line({}, 10),
            line({ siteId: "BT2002", longitude: 99 }, 20),
            line({ licensee: "Orange Polska" }, 30),
            line({ name: "WAW CENTRUM" }, 40.5),
            line({ siteId: "BT3003", licensee: "Unknown S.A." }, 50),
            line({ siteId: "BT2002", longitude: 99, name: "LOST" }, 60),
            line({ name: "WAW POLNOC", licensee: "Orange Polska" }, 70),
            line({}, 80),
            line({ siteId: "BT3003", licensee: "Unknown S.A." }, 90),
          ]),
      }),
      shortLicenseeName: (publishedName) => publishedName,
    };
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    ownRun(4);
    scriptPreparation();
    scriptRecordedRelease(41);
    dbMock.enqueueFor("select", "official.dataset_slices", [{ slice: "north", snapshotId: null }]);
    scriptResolution([14, null], ["Orange Polska", "Orange Polska S.A.", "Unknown S.A."]);
    dbMock.enqueueFor("select", "official.licensees", [
      { id: 8, legalName: "Orange Polska S.A.", operatorId: 4 },
      { id: 9, legalName: "Orange Polska", operatorId: 4 },
    ]);
    dbMock.enqueueFor("select", "official.licensees", []);
    scriptStaging(1);
    dbMock.enqueueFor("select", "official.permit_listings", [{ slice: "north", listings: 10 }]);
    dbMock.enqueueFor("select", "official.import_run_approvals", []);
    scriptCheckpoint({ skips: true });
    scriptChangeCheck([NORTH_HELD]);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    expect(await processRun(claimedRun(), { ...environment, sources: [source] })).toBe("done");

    expect(dbMock.pendingResults()).toBe(0);
    expect(
      dbMock.calls
        .filter((call) => call.operation === "execute" && executedLabel(call) === "resolve: regions")
        .map((call) => executedQuery(call).params[1]),
    ).toEqual([1]);
    expect(jsonParamsOf("resolve: regions")).toEqual([
      [
        { id: 0, longitude: 21.0123, latitude: 52.2297, region_iso_code: "PL-14", source_ref: null },
        { id: 1, longitude: 99, latitude: 52.2297, region_iso_code: "PL-14", source_ref: null },
      ],
    ]);
    expect(stagedRows()).toEqual([
      expect.objectContaining({
        ordinal: 0,
        region_id: 14,
        location_ref: null,
        precision_meters: null,
        site_code: "BT1001",
        site_ref: null,
        licensee_id: 8,
        operator_id: 4,
        site_name: "WAW CENTRUM",
        site_name_ordinal: 3,
        sectors: [10, 30, 40.5, 70, 80].map((azimuth) => ({ azimuth, antenna_height: 30.5, antenna_type: "outdoor" })),
      }),
    ]);
    expect(valuesOf("insert", "official.import_run_slices")).toEqual([[expect.objectContaining({ outcome: "held", stagedCount: 1, liveCount: 10 })]]);
    expect(valuesOf("insert", "official.import_run_skips")).toEqual([
      [
        { runId: RUN_ID, datasetId: 1, slice: "north", reason: "bad_coordinates", recordCount: 1 },
        { runId: RUN_ID, datasetId: 1, slice: "north", reason: "unknown_region", recordCount: 2 },
        { runId: RUN_ID, datasetId: 1, slice: "north", reason: "unmapped_licensee", recordCount: 2 },
      ],
    ]);
  });

  it("matches a link published under another spelling of its licensee: no new licensee, nothing archived", async () => {
    const source = sourceWith({ links: () => recordsOf([linkRecord({ licensee: "Orange Polska" })]) });
    dbMock.enqueueFor("select", "official.import_run_datasets", [LINKS_DATASET]);
    ownRun(4);
    scriptPreparation();
    scriptRecordedRelease(42);
    dbMock.enqueueFor("select", "official.dataset_slices", [{ slice: "", snapshotId: null }]);
    dbMock.enqueueFor("select", "official.licensees", [], [{ id: 8, name: "Orange Polska", operatorId: 4 }]);
    dbMock.enqueueFor("count", "official.microwave_links", 1);
    dbMock.enqueueFor("select", "official.import_run_approvals", []);
    dbMock.enqueueFor("select", "official.microwave_link_manufacturers", [{ id: 11, name: "Huawei" }]);
    dbMock.enqueueFor("select", "official.microwave_link_antenna_types", []);
    dbMock.enqueueFor("select", "official.microwave_link_transmitter_types", [{ id: 31, name: "RTN 950" }]);
    dbMock.enqueueFor("select", "official.microwave_links", [storedLink(801, linkRecord())]);
    scriptCheckpoint({ slicesApplied: true });
    scriptChangeCheck([LINKS_APPLIED]);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    expect(await processRun(claimedRun(), { ...environment, sources: [source] })).toBe("done");

    expect(dbMock.pendingResults()).toBe(0);
    expect(writesOf(trace()).filter((operation) => /licensees|microwave_links|import_changes/.test(operation))).toEqual([]);
    expect(valuesOf("insert", "official.import_run_slices")).toEqual([
      [{ runId: RUN_ID, datasetId: 3, snapshotId: 42, slice: "", outcome: "applied", stagedCount: 1, liveCount: 1 }],
    ]);
  });

  it("holds a shrunk slice: nothing is applied and only the checkpoint is written", async () => {
    const sevenSites = Array.from({ length: 7 }, (_, index) => siteRecord({ siteId: `BT100${index}` }));
    const source = sourceWith({ sites: () => recordsOf(sevenSites) });
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    ownRun(4);
    scriptPreparation();
    scriptRecordedRelease(41);
    scriptStagedSites({ live: 10 });
    scriptCheckpoint({ skips: true });
    scriptChangeCheck([NORTH_HELD]);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    const end = await processRun(claimedRun(), { ...environment, sources: [source] });

    expect(end).toBe("done");
    expect(dbMock.pendingResults()).toBe(0);
    const release = trace().slice(trace().lastIndexOf("stage: create the table"));
    expect(writesOf(release)).toEqual([
      "stage: records",
      "insert official.import_run_slices",
      "insert official.import_run_skips",
      "update official.import_runs",
      "update official.import_runs",
    ]);
    expect(valuesOf("insert", "official.import_run_slices")).toEqual([
      [{ runId: RUN_ID, datasetId: 1, snapshotId: 41, slice: "north", outcome: "held", stagedCount: 7, liveCount: 10 }],
    ]);
    expect(logger.info).toHaveBeenCalledWith("official.import.held", {
      runId: RUN_ID,
      datasetKey: "towers",
      slice: "north",
      stagedCount: 7,
      liveCount: 10,
      holdShrinkPercent: 20,
      reason: "shrank",
    });
    expect(logger.info).not.toHaveBeenCalledWith("official.import.applied", expect.anything());
  });

  it("stores a new site licensee only for a name that maps to an operator, and skips and logs the names without one", async () => {
    const published = (licensee: string, siteId: string, number = "DZC/1"): SiteRecord => {
      const record = siteRecord({ siteId });
      return { ...record, site: { ...record.site, licensee }, permit: { ...record.permit, number } };
    };
    const source: OfficialSourceDefinition = {
      ...sourceWith({
        sites: () =>
          recordsOf([
            published("SATFILM S.A.", "BT2001"),
            published("Orange Polska S.A.", "BT1001"),
            published("Hidden S.A.", "BT3001"),
            published("Play S.A.", "BT4001"),
            published("Hidden S.A.", "BT3001"),
            published("Orange Polska S.A.", "BT1001", "DZC/2"),
          ]),
      }),
      operatorNameOfLicensee: (publishedName) => publishedName.replace(/ S\.A\.$/, ""),
    };
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    ownRun(4);
    scriptPreparation();
    scriptRecordedRelease(41);
    dbMock.enqueueFor("select", "official.dataset_slices", [{ slice: "north", snapshotId: null }]);
    scriptResolution([14], ["Hidden S.A.", "Orange Polska S.A.", "Play S.A.", "SATFILM S.A."]);
    dbMock.enqueueFor(
      "select",
      "official.licensees",
      [
        { id: 8, legalName: "Orange Polska S.A.", operatorId: 4 },
        { id: 9, legalName: "Hidden S.A.", operatorId: null },
      ],
      [],
    );
    dbMock.enqueueFor("select", "operators", [{ id: 5, name: "Play" }]);
    dbMock.enqueueFor("insert", "official.licensees", [{ id: 12, legalName: "Play S.A.", operatorId: 5 }]);
    scriptStaging(1);
    dbMock.enqueueFor("select", "official.permit_listings", [{ slice: "north", listings: 10 }]);
    dbMock.enqueueFor("select", "official.import_run_approvals", []);
    scriptCheckpoint({ skips: true });
    scriptChangeCheck([NORTH_HELD]);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    expect(await processRun(claimedRun(), { ...environment, sources: [source] })).toBe("done");

    expect(dbMock.pendingResults()).toBe(0);
    expect(valuesOf("insert", "official.licensees")).toEqual([[{ sourceId: 1, full_name: "Play S.A.", name: "Play", operatorId: 5 }]]);
    expect(jsonParamsOf("resolve: order licensee names")).toEqual([["SATFILM S.A.", "Orange Polska S.A.", "Hidden S.A.", "Play S.A."]]);
    expect(stagedRows().map((row) => [row.site_code, row.decision_number, row.licensee_id, row.operator_id])).toEqual([
      ["BT1001", "DZC/1", 8, 4],
      ["BT4001", "DZC/1", 12, 5],
      ["BT1001", "DZC/2", 8, 4],
    ]);
    expect(valuesOf("insert", "official.import_run_slices")).toEqual([[expect.objectContaining({ outcome: "held", stagedCount: 3, liveCount: 10 })]]);
    expect(valuesOf("insert", "official.import_run_skips")).toEqual([
      [
        { runId: RUN_ID, datasetId: 1, slice: "north", reason: "bad_coordinates", recordCount: 1 },
        { runId: RUN_ID, datasetId: 1, slice: "north", reason: "unmapped_licensee", recordCount: 3 },
      ],
    ]);
    expect(logger.info).toHaveBeenCalledWith("official.import.unmapped_licensees", {
      runId: RUN_ID,
      source: "pl-uke",
      dataset: "towers",
      slices: ["north"],
      total: 2,
      names: ["Hidden S.A.", "SATFILM S.A."],
    });
  });

  it("applies a held slice when the run carries an approval for this release", async () => {
    const source = sourceWith({ sites: () => recordsOf([siteRecord()]) });
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    ownRun(4);
    dbMock.enqueueFor("select", "official.import_run_slices", []);
    dbMock.enqueueFor("select", "official.import_run_approvals", [{ slice: "north", snapshotId: 41 }]);
    dbMock.enqueueFor("select", "official.listed_files", []);
    scriptRecordedRelease(41);
    dbMock.enqueueFor("select", "official.dataset_slices", [{ slice: "north", snapshotId: 40 }]);
    scriptResolution([14], ["Orange Polska S.A."]);
    dbMock.enqueueFor("select", "official.licensees", [{ id: 8, legalName: "Orange Polska S.A.", operatorId: 4 }]);
    scriptStaging(1);
    dbMock.enqueueFor("select", "official.permit_listings", [{ slice: "north", listings: 10 }]);
    dbMock.enqueueFor("select", "official.import_run_approvals", [{ slice: "north", snapshotId: 41 }]);
    scriptAppliedSitesWithoutChanges();
    scriptCheckpoint({ skips: true, slicesApplied: true });
    scriptChangeCheck([NORTH_APPLIED]);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    expect(await processRun(claimedRun(), { ...environment, sources: [source] })).toBe("done");

    expect(dbMock.pendingResults()).toBe(0);
    expect(valuesOf("insert", "official.import_run_slices")).toEqual([
      [{ runId: RUN_ID, datasetId: 1, snapshotId: 41, slice: "north", outcome: "applied", stagedCount: 1, liveCount: 10 }],
    ]);
  });

  it("holds the slice again when the approval names another release", async () => {
    const source = sourceWith({ sites: () => recordsOf([siteRecord()]) });
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    ownRun(4);
    dbMock.enqueueFor("select", "official.import_run_slices", []);
    dbMock.enqueueFor("select", "official.import_run_approvals", [{ slice: "north", snapshotId: 39 }]);
    dbMock.enqueueFor("select", "official.listed_files", []);
    scriptRecordedRelease(41);
    dbMock.enqueueFor("select", "official.dataset_slices", [{ slice: "north", snapshotId: 40 }]);
    scriptResolution([14], ["Orange Polska S.A."]);
    dbMock.enqueueFor("select", "official.licensees", [{ id: 8, legalName: "Orange Polska S.A.", operatorId: 4 }]);
    scriptStaging(1);
    dbMock.enqueueFor("select", "official.permit_listings", [{ slice: "north", listings: 10 }]);
    dbMock.enqueueFor("select", "official.import_run_approvals", [{ slice: "north", snapshotId: 39 }]);
    scriptCheckpoint({ skips: true });
    scriptChangeCheck([NORTH_HELD]);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    expect(await processRun(claimedRun(), { ...environment, sources: [source] })).toBe("done");

    expect(dbMock.pendingResults()).toBe(0);
    expect(valuesOf("insert", "official.import_run_slices")).toEqual([[expect.objectContaining({ outcome: "held", stagedCount: 1, liveCount: 10 })]]);
  });

  it("records an unchanged release without reading it", async () => {
    const parse = vi.fn(() => recordsOf([siteRecord()]));
    const source = sourceWith({ sites: parse });
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    ownRun(2);
    scriptPreparation();
    dbMock.enqueueFor("select", "official.files", [{ sha256: "known" }]);
    dbMock.enqueueFor("insert", "official.files", undefined);
    dbMock.enqueueFor("select", "official.snapshots", [{ id: 41 }]);
    dbMock.enqueueFor("select", "official.dataset_slices", [{ key: "north" }]);
    dbMock.enqueueFor("select", "official.snapshot_slices", [{ slice: "north" }]);
    dbMock.enqueueFor("insert", "official.listed_files", undefined);
    dbMock.enqueueFor("select", "official.dataset_slices", [{ slice: "north", snapshotId: 41 }]);
    dbMock.enqueueFor("select", "official.permit_listings", [{ slice: "north", listings: 12 }]);
    scriptCheckpoint();
    scriptChangeCheck([NORTH_UNCHANGED]);
    dbMock.enqueueFor("delete", "official.import_runs", undefined);

    expect(await processRun(claimedRun(), { ...environment, sources: [source] })).toBe("unchanged");

    expect(dbMock.pendingResults()).toBe(0);
    expect(parse).not.toHaveBeenCalled();
    expect(trace()).not.toContain("stage: create the table");
    expect(valuesOf("insert", "official.import_run_slices")).toEqual([
      [{ runId: RUN_ID, datasetId: 1, snapshotId: 41, slice: "north", outcome: "unchanged", stagedCount: 12, liveCount: 12 }],
    ]);
  });

  it("fails the dataset when its reader throws: the file is read before the release's transaction, so only the error is written", async () => {
    const source = sourceWith({
      sites: async function* broken() {
        yield siteRecord();
        throw new Error('Workbook "2026-10-01_north.xlsx" has no sheet');
      },
    });
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    ownRun(4);
    scriptPreparation();
    scriptRecordedRelease(41);
    dbMock.enqueueFor("select", "official.dataset_slices", [{ slice: "north", snapshotId: null }]);
    dbMock.enqueueFor("update", "official.import_run_datasets", undefined);
    scriptChangeCheck([], [{ datasetId: SITES_DATASET.id, error: 'Workbook "2026-10-01_north.xlsx" has no sheet' }]);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    const end = await processRun(claimedRun(), { ...environment, sources: [source] });

    expect(end).toBe("done");
    expect(dbMock.pendingResults()).toBe(0);
    expect(trace()).not.toContain("rollback");
    expect(trace().slice(trace().lastIndexOf("select official.dataset_slices") - 2)).toEqual([
      "begin",
      "select official.import_runs",
      "select official.dataset_slices",
      "commit",
      "begin",
      "select official.import_runs",
      "update official.import_run_datasets",
      "commit",
      "begin",
      "select official.import_runs",
      "select official.datasets",
      "select official.import_run_datasets",
      "select official.import_run_slices",
      "commit",
      "begin",
      "select official.import_runs",
      "update official.import_runs",
      "commit",
    ]);
    expect(valuesOf("update", "official.import_run_datasets")).toEqual([{ error: 'Workbook "2026-10-01_north.xlsx" has no sheet' }]);
  });

  it("stops before any write when the claim belongs to another runner", async () => {
    const source = sourceWith({ sites: () => recordsOf([siteRecord()]) });
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    scriptPreparation();
    ownRun(1, FOREIGN_TOKEN);

    const end = await processRun(claimedRun(), { ...environment, sources: [source] });

    expect(end).toBe("lost");
    expect(dbMock.pendingResults()).toBe(0);
    expect(trace().slice(-3)).toEqual(["begin", "select official.import_runs", "rollback"]);
    expect(writesOf(trace())).toEqual([]);
  });

  it("ends a download at once when the runner hands the run back, even as a plain AbortError, and records no failure", async () => {
    const handedBack = new AbortController();
    const downloading = Promise.withResolvers<void>();
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.method === "HEAD") return new Response(null, { headers: { "content-length": String(ZIP_FILE.length), etag: '"v1"' } });
      downloading.resolve();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError")));
      });
    });
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    scriptPreparation();

    const ending = processRun(claimedRun(), { ...environment, sources: [sourceWith({})] }, handedBack.signal);
    await downloading.promise;
    handedBack.abort(new RunNotOwnedError(RUN_ID));

    expect(await ending).toBe("lost");
    expect(dbMock.pendingResults()).toBe(0);
    expect(writesOf(trace())).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("fails the run when an after-step throws, and records the step's error", async () => {
    dbMock.enqueueFor("select", "official.import_run_datasets", []);
    ownRun(3);
    dbMock.enqueueFor("select", "official.import_run_steps", [{ lastSeq: 17, finishedAt: null }]);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined, undefined);
    dbMock.enqueueFor("update", "official.import_runs", undefined);
    scriptChangeCheck([NORTH_APPLIED]);
    const seenProgress: (number | null)[] = [];
    const failing = {
      name: "links" as const,
      runsInDryRun: true,
      perform: async (context: { lastSeq: number | null }) => {
        seenProgress.push(context.lastSeq);
        throw new Error("no route to the queue");
      },
    };

    const end = await processRun(claimedRun(), { ...environment, sources: [sourceWith({})], steps: [failing, unlistedPermits] });

    expect(end).toBe("failed");
    expect(dbMock.pendingResults()).toBe(0);
    expect(seenProgress).toEqual([17]);
    expect(valuesOf("update", "official.import_run_steps")).toEqual([{ error: null }, { error: "no route to the queue" }]);
    expect(valuesOf("update", "official.import_runs")).toEqual([
      expect.objectContaining({ state: "failed", error: "After-step links failed: no route to the queue" }),
    ]);
  });

  it("rolls a dry run back and reports what it would have changed", async () => {
    const source = sourceWith({ sites: () => recordsOf([siteRecord()]) });
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    scriptPreparation();
    ownRun(8);
    dbMock.enqueueFor("select", "official.licensees", [{ id: 7, name: "TFILM", legalName: "SATFILM S.A." }]);
    dbMock.enqueueFor("update", "official.licensees", undefined);
    scriptRecordedRelease(41);
    scriptStagedSites({ live: 0 });
    scriptStagedMatches(6);
    dbMock.enqueueFor("insert", "official.locations", [], []);
    dbMock.enqueueFor("select", STAGED_PERMITS, []);
    dbMock.enqueueFor("insert", "official.permits", [{ id: 701 }]);
    dbMock.enqueueFor("update", "official.permits", undefined);
    dbMock.enqueueFor("update", "official.permit_listings", undefined);
    scriptStatements([], [], [], [], [], [{ permitId: 701, slice: "north", officialSiteId: 504 }], [], []);
    dbMock.enqueueFor("update", "official.sites", undefined);
    scriptCheckpoint({ skips: true, changes: true, slicesApplied: true });
    dbMock.enqueueFor("select", "official.import_run_steps", []);
    dbMock.enqueueFor("insert", "official.import_run_steps", undefined);
    dbMock.enqueueFor("select", "official.permits", []);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    dbMock.enqueueFor("select", "official.import_run_slices", [
      { datasetId: 1, datasetKey: "towers", slice: "north", outcome: "applied", stagedCount: 1, liveCount: 0 },
    ]);
    dbMock.enqueueFor("select", "official.import_run_skips", [
      { runId: RUN_ID, datasetId: 1, slice: "north", reason: "bad_coordinates", recordCount: 1 },
    ]);
    dbMock.enqueueFor("select", "official.import_changes", [
      { datasetId: 1, slice: "north", kind: "permit_added", count: 1 },
      { datasetId: null, slice: null, kind: "permit_archived", count: 2 },
    ]);
    dbMock.enqueueFor("select", "official.import_run_datasets", []);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    const end = await processDryRun(claimedRun({ isDryRun: true }), { ...environment, sources: [source], steps: [unlistedPermits] });

    expect(dbMock.pendingResults()).toBe(0);
    expect(JSON.parse(JSON.stringify(end))).toEqual(end);
    expect(end).toEqual({
      end: "done",
      report: {
        slices: [
          {
            datasetKey: "towers",
            slice: "north",
            outcome: "applied",
            stagedCount: 1,
            liveCount: 0,
            changes: { permit_added: 1 },
            skipped: { bad_coordinates: 1 },
          },
        ],
        failedDatasets: [],
        afterStepChanges: { permit_archived: 2 },
        siteNames: { written: 0, skipped: 0 },
        licenseeNamesCorrected: 1,
        remap: null,
      },
    });
    expect(keptReports).toEqual([[RUN_ID, expect.anything()]]);
    expect(end).toEqual({ end: "done", report: keptReports[0]?.[1] });

    const operations = trace();
    const opened = operations.indexOf("begin");
    const rolledBack = operations.lastIndexOf("rollback");
    expect(operations.slice(opened, opened + 4)).toEqual([
      "begin",
      "select official.import_runs",
      "select official.licensees",
      "update official.licensees",
    ]);
    expect(operations.filter((operation) => operation === "rollback")).toHaveLength(1);
    expect(writesOf(operations.slice(0, opened))).toEqual([]);
    expect(operations.slice(rolledBack + 1)).toEqual([
      "keep the dry-run report",
      "begin",
      "select official.import_runs",
      "update official.import_runs",
      "commit",
    ]);
    expect(valuesOf("update", "official.import_runs").at(-1)).toMatchObject({ state: "done" });
  });

  it("does not read a release whose files are listed as at their last download, and keeps no run that changed nothing", async () => {
    const parse = vi.fn(() => recordsOf([siteRecord()]));
    const step = { name: "unlisted_permits" as const, runsInDryRun: true, perform: vi.fn(async () => undefined) };
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    dbMock.enqueueFor("select", "official.import_run_slices", []);
    dbMock.enqueueFor("select", "official.import_run_approvals", []);
    dbMock.enqueueFor("select", "official.listed_files", [listedAsServed()]);
    scriptChangeCheck([]);
    dbMock.enqueueFor("delete", "official.import_runs", undefined);

    expect(await processRun(claimedRun(), { ...environment, sources: [sourceWith({ sites: parse })], steps: [step] })).toBe("unchanged");

    expect(dbMock.pendingResults()).toBe(0);
    expect(parse).not.toHaveBeenCalled();
    expect(step.perform).not.toHaveBeenCalled();
    expect([requestsOf("HEAD"), requestsOf("GET")]).toEqual([1, 0]);
    expect(trace().slice(4)).toEqual([
      "begin",
      "select official.import_runs",
      "select official.datasets",
      "select official.import_run_datasets",
      "select official.import_run_slices",
      "delete official.import_runs",
      "commit",
    ]);
    expect(whereOf(dbMock.calls.find((call) => call.operation === "delete")).params).toEqual([RUN_ID]);
    expect(logger.info).toHaveBeenCalledWith("official.import.nothing_changed", { runId: RUN_ID });
    expect(logger.info).toHaveBeenCalledWith("official.import.file_unchanged", { runId: RUN_ID, datasetKey: "towers", url: SITES_FILE_URL });
    expect(logger.info).not.toHaveBeenCalledWith("official.import.downloading", expect.anything());
  });

  it("reads such a release again from the archive when a later attempt resumes the run", async () => {
    mkdirSync(path.join(archiveDirectory, "files"));
    writeFileSync(path.join(archiveDirectory, "files", `${ZIP_FILE_SHA256}.xlsx`), ZIP_FILE);
    dbMock.enqueueFor("select", "official.import_run_steps", []);
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    dbMock.enqueueFor("select", "official.import_run_slices", []);
    dbMock.enqueueFor("select", "official.import_run_approvals", []);
    dbMock.enqueueFor("select", "official.listed_files", [listedAsServed()]);
    ownRun(2);
    dbMock.enqueueFor("select", "official.snapshots", [{ id: 41 }]);
    dbMock.enqueueFor("select", "official.dataset_slices", [{ key: "north" }]);
    dbMock.enqueueFor("select", "official.snapshot_slices", [{ slice: "north" }]);
    dbMock.enqueueFor("select", "official.dataset_slices", [{ slice: "north", snapshotId: 41 }]);
    dbMock.enqueueFor("select", "official.permit_listings", [{ slice: "north", listings: 12 }]);
    scriptCheckpoint();
    scriptChangeCheck([NORTH_UNCHANGED]);
    dbMock.enqueueFor("delete", "official.import_runs", undefined);

    expect(await processRun(claimedRun({ attempt: 2 }), { ...environment, sources: [sourceWith({})] })).toBe("unchanged");

    expect(dbMock.pendingResults()).toBe(0);
    expect([requestsOf("HEAD"), requestsOf("GET")]).toEqual([1, 0]);
    expect(writesOf(trace())).toEqual(["insert official.import_run_slices", "update official.import_runs", "delete official.import_runs"]);
    expect(logger.info).toHaveBeenCalledWith("official.import.file_from_archive", { runId: RUN_ID, datasetKey: "towers", url: SITES_FILE_URL });
    expect(logger.info).toHaveBeenCalledWith("official.import.release_unchanged", { runId: RUN_ID, datasetKey: "towers", slices: ["north"] });
  });

  it("skips a release whose slices an earlier attempt already checkpointed", async () => {
    dbMock.enqueueFor("select", "official.import_run_steps", []);
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    dbMock.enqueueFor("select", "official.import_run_slices", [{ slice: "north" }]);
    dbMock.enqueueFor("select", "official.import_run_approvals", []);
    dbMock.enqueueFor("select", "official.listed_files", []);
    ownRun(1);
    scriptChangeCheck([NORTH_APPLIED]);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    expect(await processRun(claimedRun({ attempt: 2 }), { ...environment, sources: [sourceWith({})] })).toBe("done");

    expect(dbMock.pendingResults()).toBe(0);
    expect([requestsOf("HEAD"), requestsOf("GET")]).toEqual([0, 0]);
  });

  it("applies no release once an earlier attempt began the after-steps: a failed dataset stays failed and the steps go on", async () => {
    const parse = vi.fn(() => recordsOf([siteRecord()]));
    const finishedAt = new Date("2026-10-12T14:20:00.000Z");
    const step = (name: "unlisted_permits" | "site_notifications" | "links") => ({ name, runsInDryRun: true, perform: vi.fn(async () => undefined) });
    const steps = [step("unlisted_permits"), step("site_notifications"), step("links")];
    dbMock.enqueueFor(
      "select",
      "official.import_run_steps",
      [{ step: "unlisted_permits" }, { step: "site_notifications" }],
      [{ lastSeq: null, finishedAt }],
      [{ lastSeq: 40, finishedAt }],
      [],
    );
    dbMock.enqueueFor("insert", "official.import_run_steps", undefined);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    ownRun(5);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    const end = await processRun(claimedRun({ attempt: 2 }), { ...environment, sources: [sourceWith({ sites: parse })], steps });

    expect(end).toBe("done");
    expect(dbMock.pendingResults()).toBe(0);
    expect(parse).not.toHaveBeenCalled();
    expect([requestsOf("HEAD"), requestsOf("GET")]).toEqual([0, 0]);
    expect(steps.map(({ perform }) => perform.mock.calls.length)).toEqual([0, 0, 1]);
    expect(trace()).toEqual([
      "select official.import_run_steps",
      "begin",
      "select official.import_runs",
      "select official.import_run_steps",
      "commit",
      "begin",
      "select official.import_runs",
      "select official.import_run_steps",
      "commit",
      "begin",
      "select official.import_runs",
      "select official.import_run_steps",
      "insert official.import_run_steps",
      "commit",
      "begin",
      "select official.import_runs",
      "update official.import_run_steps",
      "commit",
      "begin",
      "select official.import_runs",
      "update official.import_runs",
      "commit",
    ]);
    expect(vi.mocked(logger.info).mock.calls.filter(([event]) => event.startsWith("official.import.step_"))).toEqual([
      ["official.import.step_started", { runId: RUN_ID, step: "links" }],
      ["official.import.step_finished", { runId: RUN_ID, step: "links", ms: expect.any(Number) }],
    ]);
  });

  it("applies the slices of a release that pass the guard and holds the others", async () => {
    const source = sourceWith({ sitesCover: ["north", "south"], sites: () => recordsOf([siteRecord(), siteRecord({ slice: "south" })]) });
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    ownRun(4);
    scriptPreparation();
    scriptRecordedRelease(41);
    dbMock.enqueueFor("select", "official.dataset_slices", []);
    scriptResolution([14], ["Orange Polska S.A."]);
    dbMock.enqueueFor("select", "official.licensees", [{ id: 8, legalName: "Orange Polska S.A.", operatorId: 4 }]);
    scriptStaging(1);
    dbMock.enqueueFor("select", "official.permit_listings", [{ slice: "south", listings: 10 }]);
    dbMock.enqueueFor("select", "official.import_run_approvals", []);
    dbMock.enqueueFor("delete", STAGED_PERMITS, undefined);
    scriptAppliedSitesWithoutChanges();
    scriptCheckpoint({ skips: true, slicesApplied: true });
    scriptChangeCheck([NORTH_APPLIED, { ...NORTH_HELD, slice: "south" }]);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    expect(await processRun(claimedRun(), { ...environment, sources: [source] })).toBe("done");

    expect(dbMock.pendingResults()).toBe(0);
    const operations = trace();
    expect(operations[operations.indexOf("select official.import_run_approvals", 5) + 1]).toBe(`delete ${STAGED_PERMITS}`);
    expect(valuesOf("insert", "official.import_run_slices")).toEqual([
      [
        { runId: RUN_ID, datasetId: 1, snapshotId: 41, slice: "north", outcome: "applied", stagedCount: 1, liveCount: 0 },
        { runId: RUN_ID, datasetId: 1, snapshotId: 41, slice: "south", outcome: "held", stagedCount: 1, liveCount: 10 },
      ],
    ]);
    const marked = dbMock.calls.find((call) => call.operation === "update" && call.table === "official.dataset_slices");
    expect(dialect.sqlToQuery(marked?.clauses.where?.[0] as Parameters<PgDialect["sqlToQuery"]>[0]).params).toEqual([1, "north"]);
  });

  it("fails the dataset when its reader gives a record of a slice the release does not cover", async () => {
    const source = sourceWith({ sites: () => recordsOf([siteRecord({ slice: "south" })]) });
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    ownRun(4);
    scriptPreparation();
    scriptRecordedRelease(41);
    dbMock.enqueueFor("select", "official.dataset_slices", []);
    dbMock.enqueueFor("update", "official.import_run_datasets", undefined);
    scriptChangeCheck([], [{ datasetId: SITES_DATASET.id, error: "unreadable" }]);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    expect(await processRun(claimedRun(), { ...environment, sources: [source] })).toBe("done");
    expect(valuesOf("update", "official.import_run_datasets")).toEqual([
      { error: 'The reader of towers gave a record of the slice "south", which its release does not cover' },
    ]);
  });

  it("hands the source's hook the published site names inside the release's transaction and counts what it wrote", async () => {
    const syncSiteNames = vi.fn<NonNullable<SitesDataset["syncSiteNames"]>>(async (context) => {
      await context.audit({ kind: "official.import", metadata: { dataset: "device_registry", operator_id: 4 } }, [
        { entity: "extra_identificators", op: "create", recordId: 900, stationId: 100, new: { id: 900, mno_name: "WAW CENTRUM" } },
      ]);
      return { skippedSiteNames: 2 };
    });
    const source = sourceWith({ sites: () => recordsOf([siteRecord({ name: "WAW CENTRUM" })]), syncSiteNames });
    dbMock.enqueueFor("select", "official.import_run_datasets", [SITES_DATASET]);
    scriptPreparation();
    ownRun(5);
    dbMock.enqueueFor("select", "official.licensees", []);
    scriptRecordedRelease(41);
    scriptStagedSites({ live: 1 });
    scriptAppliedSitesWithoutChanges();
    dbMock.enqueueFor("select", STAGED_PERMITS, [{ operatorId: 4, siteId: "BT1001", name: "WAW CENTRUM" }]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 77 }]);
    dbMock.enqueueFor("insert", "audit_logs", undefined);
    scriptCheckpoint({ skips: true, slicesApplied: true });
    dbMock.enqueueFor("select", "official.import_run_slices", []);
    dbMock.enqueueFor("select", "official.import_run_skips", []);
    dbMock.enqueueFor("select", "official.import_changes", []);
    dbMock.enqueueFor("select", "official.import_run_datasets", []);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    const end = await processDryRun(claimedRun({ isDryRun: true }), { ...environment, sources: [source] });

    expect(end).toMatchObject({ end: "done", report: { siteNames: { written: 1, skipped: 2 } } });
    expect(syncSiteNames).toHaveBeenCalledWith(expect.objectContaining({ siteNames: [{ operatorId: 4, siteId: "BT1001", name: "WAW CENTRUM" }] }));
    const operations = trace();
    expect(operations.lastIndexOf(`select ${STAGED_PERMITS}`)).toBeGreaterThan(operations.indexOf("apply: unlist"));
    expect(operations.indexOf("insert audit_logs")).toBeLessThan(operations.indexOf("insert official.import_run_slices"));
  });

  it("fails the run when the dry-run report cannot be kept", async () => {
    scriptRehearsalWithoutDatasets();
    ownRun(1);
    dbMock.enqueueFor("update", "official.import_runs", undefined);
    const keepDryRunReport = async (): Promise<void> => {
      throw new Error("Redis is away");
    };

    const end = await processDryRun(claimedRun({ isDryRun: true }), { ...environment, sources: [sourceWith({})], keepDryRunReport });

    expect(end).toEqual({ end: "failed", error: "Redis is away" });
    expect(dbMock.pendingResults()).toBe(0);
    expect(valuesOf("update", "official.import_runs")).toEqual([expect.objectContaining({ state: "failed", error: "Redis is away" })]);
  });

  it("fails the run without leaving a heartbeat behind when its working directory cannot be created", async () => {
    vi.useFakeTimers();
    for (const variable of ["TMPDIR", "TMP", "TEMP"]) vi.stubEnv(variable, path.join(archiveDirectory, "missing"));
    ownRun(1);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    const end = await processRun(claimedRun(), { ...environment, sources: [sourceWith({})] });

    expect(end).toBe("failed");
    expect(dbMock.pendingResults()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(valuesOf("update", "official.import_runs")).toEqual([
      expect.objectContaining({ state: "failed", error: expect.stringContaining("mkdtemp") }),
    ]);
  });

  it("refuses to run a dry run for real, and a real run as a rehearsal", async () => {
    await expect(processRun(claimedRun({ isDryRun: true }), environment)).rejects.toThrow("is a dry run");
    await expect(processDryRun(claimedRun(), environment)).rejects.toThrow("is not a dry run");
    expect(dbMock.calls).toEqual([]);
  });
});
