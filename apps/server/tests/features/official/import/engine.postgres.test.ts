import type { MicrowaveLinkRecord, OfficialSourceDefinition, PermitKind, SiteRecord, SiteSector, SitesDataset } from "@openbts/country-packs/sources";
import {
  countries,
  licensees,
  microwaveLinks,
  officialDatasetSlices,
  officialDatasets,
  officialImportChanges,
  officialImportRunDatasets,
  officialImportRunSkips,
  officialImportRunSlices,
  officialImportRuns,
  officialListedFiles,
  officialPermitListings,
  officialPermitSectors,
  officialPermits,
  officialSiteWatches,
  officialSites,
  officialSources,
  operators,
  regions,
  stations,
  stationsPermits,
  userLists,
  users,
} from "@openbts/drizzle";
import type * as productionDatabase from "@openbts/drizzle/db";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { directoryArchive } from "../../../../src/features/official/import/archive.js";
import { readChanges } from "../../../../src/features/official/import/changes.js";
import { processRun } from "../../../../src/features/official/import/run.js";
import { type EnqueueRunInput, claimNextRun, enqueueRun } from "../../../../src/features/official/import/runs.js";
import { syncSources } from "../../../../src/features/official/import/sourceSync.js";
import { unlistedPermits } from "../../../../src/features/official/import/steps/unlistedPermits.js";
import type { ClaimedRun, ImportEnvironment } from "../../../../src/features/official/import/types.js";
import type { DbTx } from "../../../../src/types/global.js";

const DATABASE_URL = process.env.OFFICIAL_IMPORT_TEST_DATABASE_URL ?? "";
const SOURCE_KEY = "engine-test";
const COUNTRY_CODE = "ZZ";
const REGION_ISO_CODE = "ZZ-ET";
const OPERATOR_NAME = "Engine Test Mobile";
const LICENSEE_NAME = "Engine Test Mobile S.A.";
const OTHER_OPERATOR_NAME = "Engine Test Other";
const OTHER_LICENSEE_NAME = "Engine Test Other S.A.";
const REGISTRY_LICENSEE_NAME = "Engine Test Mobile registry";
const DATASET_KEYS = ["permits", "registry", "links"] as const;
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

type DatasetKey = (typeof DATASET_KEYS)[number];
type Published = { permits: SiteRecord[]; registry: SiteRecord[]; links: MicrowaveLinkRecord[] };
type World = {
  tx: DbTx;
  published: Published;
  sourceId: number;
  datasetIds: Record<DatasetKey, number>;
  operatorIds: { mapped: number; other: number };
  environment: ImportEnvironment;
};

class RolledBack extends Error {}

const open = vi.hoisted((): { transaction: object | null } => ({ transaction: null }));

vi.mock("../../../../src/database/psql.js", () => {
  const db = new Proxy(
    {},
    {
      get(_target, property) {
        if (open.transaction === null) return undefined;

        const member: unknown = Reflect.get(open.transaction, property);
        return typeof member === "function" ? member.bind(open.transaction) : member;
      },
    },
  );
  return { db, default: db };
});

let database: typeof productionDatabase;
let archiveDirectory: string;

async function rolledBack(work: (tx: DbTx) => Promise<void>): Promise<void> {
  try {
    await database.db.transaction(async (tx) => {
      open.transaction = tx;
      await work(tx);
      throw new RolledBack();
    });
  } catch (error) {
    if (!(error instanceof RolledBack)) throw error;
  } finally {
    open.transaction = null;
  }
}

function siteRecord(number: number, published: { licensee?: string; permitNumber?: string } = {}): SiteRecord {
  return {
    slice: "north",
    location: { longitude: -30 - number / 100, latitude: 40.25, city: "Engine test city", address: null, regionIsoCode: REGION_ISO_CODE },
    site: { siteId: `ET${number}`, licensee: published.licensee ?? LICENSEE_NAME, name: null },
    permit: {
      label: { rat: "LTE", mhz: 800, variant: "commercial" },
      number: published.permitNumber ?? `ET/${number}`,
      decisionType: "permit",
      expiresOn: "2030-01-01",
      status: null,
    },
    sectors: [{ azimuth: 120, antennaHeight: 30.5, antennaPlacement: "outdoor" }],
  };
}

function linkRecord(permitNumber: string): MicrowaveLinkRecord {
  const end = (longitude: number) => ({
    longitude,
    latitude: 40.25,
    groundHeight: 10,
    antennaHeight: 30,
    city: null,
    province: null,
    street: null,
    locationDescription: null,
  });

  return {
    slice: "",
    licensee: LICENSEE_NAME,
    permitNumber,
    decisionType: "permit",
    issuedOn: "2025-01-01",
    expiresOn: "2030-01-01",
    tx: end(-30.01),
    rx: end(-30.02),
    freqKhz: 23_000_000,
    channelNumber: 5,
    channelWidthMhz: 28,
    polarization: "V",
    eirpDbm: 30.5,
    technical: {},
    publishesEveryTechnicalColumn: false,
  };
}

async function* recordsOf<PublishedRecord>(records: readonly PublishedRecord[]): AsyncIterable<PublishedRecord> {
  yield* records;
}

function sourceOf(published: Published, syncSiteNames: SitesDataset["syncSiteNames"] | undefined, permitsKind: PermitKind): OfficialSourceDefinition {
  const releaseOf = (dataset: DatasetKey) => async () => [
    {
      coveredSlices: [dataset === "links" ? "" : "north"],
      files: [{ url: `https://files.invalid/${dataset}.xlsx`, fileName: `${dataset}.xlsx` }],
      publishedOn: "2026-10-01",
    },
  ];

  return {
    key: SOURCE_KEY,
    countryCode: COUNTRY_CODE,
    shortName: "ENGINE",
    authority: "Engine test authority",
    homepageUrl: "https://authority.invalid",
    licence: "none stated",
    attribution: "Source: engine test",
    isRedistributable: true,
    shortLicenseeName: (publishedName) => publishedName.replace(/ S\.A\.$/, ""),
    operatorNameOfLicensee: (publishedName) => (publishedName === OTHER_LICENSEE_NAME ? OTHER_OPERATOR_NAME : OPERATOR_NAME),
    datasets: [
      {
        key: "permits",
        layer: "sites",
        permitKind: permitsKind,
        checkEveryHours: 6,
        discover: releaseOf("permits"),
        parse: () => recordsOf(published.permits),
        syncSiteNames,
      },
      {
        key: "registry",
        layer: "sites",
        permitKind: "permit",
        checkEveryHours: 6,
        discover: releaseOf("registry"),
        parse: () => recordsOf(published.registry),
        yieldsSitePlacementTo: ["permits"],
      },
      {
        key: "links",
        layer: "microwave_links",
        permitKind: "permit",
        checkEveryHours: 6,
        discover: releaseOf("links"),
        parse: () => recordsOf(published.links),
      },
    ],
  };
}

function serve(published: Published): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const dataset = DATASET_KEYS.find((key) => url.endsWith(`/${key}.xlsx`));
      if (init?.method === "HEAD" || dataset === undefined) return new Response(null, { status: 404 });

      return new Response(Buffer.concat([ZIP_SIGNATURE, Buffer.from(JSON.stringify({ dataset, records: published[dataset] }))]));
    }),
  );
}

async function openWorld(tx: DbTx, syncSiteNames?: SitesDataset["syncSiteNames"], permitsKind: PermitKind = "permit"): Promise<World> {
  const published: Published = { permits: [], registry: [], links: [] };
  const source = sourceOf(published, syncSiteNames, permitsKind);
  serve(published);

  await tx.insert(countries).values({ code: COUNTRY_CODE });
  await tx.insert(regions).values({ name: "Engine test region", code: "ET", countryCode: COUNTRY_CODE, isoCode: REGION_ISO_CODE });
  const [mapped, other] = await tx
    .insert(operators)
    .values([
      { name: OPERATOR_NAME, full_name: LICENSEE_NAME, countryCode: COUNTRY_CODE },
      { name: OTHER_OPERATOR_NAME, full_name: OTHER_LICENSEE_NAME, countryCode: COUNTRY_CODE },
    ])
    .returning({ id: operators.id });
  if (!mapped || !other) throw new Error("The operators were not added");
  await syncSources([source]);

  const datasets = await tx
    .select({ key: officialDatasets.key, id: officialDatasets.id, sourceId: officialDatasets.sourceId })
    .from(officialDatasets)
    .innerJoin(officialSources, eq(officialSources.id, officialDatasets.sourceId))
    .where(eq(officialSources.key, SOURCE_KEY));
  const datasetOf = (key: DatasetKey) => {
    const dataset = datasets.find((row) => row.key === key);
    if (!dataset) throw new Error(`The source sync did not add the dataset ${key}`);
    return dataset;
  };

  return {
    tx,
    published,
    sourceId: datasetOf("permits").sourceId,
    datasetIds: { permits: datasetOf("permits").id, registry: datasetOf("registry").id, links: datasetOf("links").id },
    operatorIds: { mapped: mapped.id, other: other.id },
    environment: {
      sources: [source],
      database: tx,
      archive: directoryArchive(archiveDirectory),
      steps: [unlistedPermits],
      keepDryRunReport: async () => undefined,
    },
  };
}

async function claimRun(world: World, queued: Partial<EnqueueRunInput>): Promise<ClaimedRun> {
  const runId = await enqueueRun(world.tx, {
    sourceId: world.sourceId,
    kind: "import",
    trigger: "cli",
    isDryRun: false,
    datasetIds: [],
    requestedById: null,
    approvals: [],
    ...queued,
  });
  const run = await claimNextRun();
  if (run?.id !== runId) throw new Error("Another import run was waiting: use a database no runner works on");

  return run;
}

async function runImport(world: World, datasets: readonly DatasetKey[], approvals: EnqueueRunInput["approvals"] = []): Promise<string> {
  const run = await claimRun(world, { datasetIds: datasets.map((key) => world.datasetIds[key]), approvals });
  expect(await processRun(run, world.environment)).toBe("done");

  return run.id;
}

async function remapToOtherOperator(world: World, licenseeName: string): Promise<string> {
  const [licensee] = await world.tx
    .select({ id: licensees.id, operatorId: licensees.operatorId })
    .from(licensees)
    .where(and(eq(licensees.sourceId, world.sourceId), eq(licensees.full_name, licenseeName)));
  if (!licensee) throw new Error(`No import stored the licensee ${licenseeName}`);

  const remap = { licenseeId: licensee.id, fromOperatorId: licensee.operatorId, toOperatorId: world.operatorIds.other };
  const run = await claimRun(world, { kind: "remap", remap });
  expect(await processRun(run, world.environment)).toBe("done");

  return run.id;
}

async function addUser(tx: DbTx, name: string): Promise<string> {
  const [user] = await tx
    .insert(users)
    .values({ name, email: `${name}@engine-test.invalid` })
    .returning({ id: users.id });
  if (!user) throw new Error("The user was not added");

  return user.id;
}

async function addList(tx: DbTx, userId: string, officialSiteIds: number[]): Promise<void> {
  await tx.insert(userLists).values({ name: "Engine test list", created_by: userId, stations: { internal: [], official: officialSiteIds } });
}

async function listedSitesOf(tx: DbTx, userId: string) {
  return tx.select({ stations: userLists.stations }).from(userLists).where(eq(userLists.created_by, userId));
}

async function watchesOf({ tx, sourceId }: World) {
  return tx
    .select({ userId: officialSiteWatches.userId, officialSiteId: officialSiteWatches.officialSiteId })
    .from(officialSiteWatches)
    .innerJoin(officialSites, eq(officialSites.id, officialSiteWatches.officialSiteId))
    .where(eq(officialSites.source_id, sourceId));
}

async function placedPermitsOf({ tx, sourceId }: World) {
  return tx
    .select({ id: officialPermits.id, number: officialPermits.decision_number, operatorId: officialSites.operator_id })
    .from(officialPermits)
    .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
    .where(eq(officialSites.source_id, sourceId))
    .orderBy(asc(officialPermits.decision_number));
}

async function slicesOf({ tx }: World, runId: string) {
  return tx
    .select({
      dataset: officialDatasets.key,
      slice: officialImportRunSlices.slice,
      outcome: officialImportRunSlices.outcome,
      stagedCount: officialImportRunSlices.stagedCount,
      liveCount: officialImportRunSlices.liveCount,
    })
    .from(officialImportRunSlices)
    .innerJoin(officialDatasets, eq(officialDatasets.id, officialImportRunSlices.datasetId))
    .where(eq(officialImportRunSlices.runId, runId))
    .orderBy(asc(officialDatasets.key));
}

async function approvalOfRelease({ tx }: World, runId: string): Promise<EnqueueRunInput["approvals"]> {
  return tx
    .select({ datasetId: officialImportRunSlices.datasetId, slice: officialImportRunSlices.slice, snapshotId: officialImportRunSlices.snapshotId })
    .from(officialImportRunSlices)
    .where(eq(officialImportRunSlices.runId, runId));
}

async function changesOf({ tx }: World, runId: string): Promise<Record<string, number>> {
  const counted = await tx
    .select({ dataset: officialDatasets.key, kind: officialImportChanges.kind, changes: count() })
    .from(officialImportChanges)
    .leftJoin(officialDatasets, eq(officialDatasets.id, officialImportChanges.datasetId))
    .where(eq(officialImportChanges.runId, runId))
    .groupBy(officialDatasets.key, officialImportChanges.kind);

  return Object.fromEntries(counted.map(({ dataset, kind, changes }) => [dataset === null ? kind : `${dataset}: ${kind}`, changes]));
}

async function sitesOf({ tx, sourceId }: World) {
  return tx
    .select({ id: officialSites.id, siteId: officialSites.station_id, locationId: officialSites.location_id })
    .from(officialSites)
    .where(eq(officialSites.source_id, sourceId))
    .orderBy(asc(officialSites.station_id));
}

async function permitsOf({ tx, sourceId }: World) {
  return tx
    .select({ id: officialPermits.id, number: officialPermits.decision_number })
    .from(officialPermits)
    .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
    .where(eq(officialSites.source_id, sourceId))
    .orderBy(asc(officialPermits.decision_number));
}

async function listingsOf({ tx, sourceId }: World) {
  return tx
    .select({ number: officialPermits.decision_number, dataset: officialDatasets.key })
    .from(officialPermitListings)
    .innerJoin(officialPermits, eq(officialPermits.id, officialPermitListings.permitId))
    .innerJoin(officialDatasets, eq(officialDatasets.id, officialPermitListings.datasetId))
    .where(eq(officialDatasets.sourceId, sourceId))
    .orderBy(asc(officialPermits.decision_number), asc(officialDatasets.key));
}

async function linksOf({ tx, datasetIds }: World) {
  return tx
    .select({ id: microwaveLinks.id, permitNumber: microwaveLinks.permit_number })
    .from(microwaveLinks)
    .where(eq(microwaveLinks.dataset_id, datasetIds.links));
}

describe.skipIf(DATABASE_URL === "")(
  "the import engine on PostgreSQL (written without a database and never executed; every case is rolled back)",
  { timeout: 120_000 },
  () => {
    beforeAll(async () => {
      vi.stubEnv("DATABASE_URL", DATABASE_URL);
      database = await vi.importActual<typeof productionDatabase>("@openbts/drizzle/db");
      archiveDirectory = mkdtempSync(path.join(tmpdir(), "official-import-engine-"));

      const [contract] = await database.db.execute<{ found: string | null }>(
        sql`SELECT to_regclass('official.locations_source_lonlat_unique')::text AS found`,
      );
      if (!contract?.found) throw new Error("OFFICIAL_IMPORT_TEST_DATABASE_URL must name a database with the migrations of packages/drizzle applied");
    });

    afterAll(async () => {
      rmSync(archiveDirectory, { recursive: true, force: true });
      await database.sql.end();
    });

    it("applies a slice, then finds the same release unchanged and keeps no run for it", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        world.published.permits = [siteRecord(1), siteRecord(2)];

        const applied = await runImport(world, ["permits"]);
        const again = await claimRun(world, { datasetIds: [world.datasetIds.permits] });

        expect(await processRun(again, world.environment)).toBe("unchanged");
        expect(await slicesOf(world, applied)).toEqual([{ dataset: "permits", slice: "north", stagedCount: 2, outcome: "applied", liveCount: 0 }]);
        expect(await changesOf(world, applied)).toEqual({ "permits: site_added": 2, "permits: permit_added": 2 });
        expect(await tx.select({ id: officialImportRuns.id }).from(officialImportRuns).where(eq(officialImportRuns.id, again.id))).toEqual([]);
        expect(await listingsOf(world)).toEqual([
          { number: "ET/1", dataset: "permits" },
          { number: "ET/2", dataset: "permits" },
        ]);
      }));

    it("matches a registry permit without an expiry as the same permit on the next run", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        const withoutExpiry = (number: number): SiteRecord => {
          const record = siteRecord(number);
          return { ...record, permit: { ...record.permit, expiresOn: null } };
        };
        world.published.registry = [withoutExpiry(1)];
        await runImport(world, ["registry"]);
        const permitsBefore = await permitsOf(world);

        world.published.registry = [withoutExpiry(1), withoutExpiry(2)];
        const grown = await runImport(world, ["registry"]);
        const stored = await tx
          .select({ number: officialPermits.decision_number, expiryDate: officialPermits.expiry_date })
          .from(officialPermits)
          .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
          .where(eq(officialSites.source_id, world.sourceId))
          .orderBy(asc(officialPermits.decision_number));

        expect(permitsBefore).toHaveLength(1);
        expect(await changesOf(world, grown)).toEqual({ "registry: site_added": 1, "registry: permit_added": 1 });
        expect(await permitsOf(world)).toEqual([...permitsBefore, { id: expect.any(Number), number: "ET/2" }]);
        expect(stored).toEqual([
          { number: "ET/1", expiryDate: null },
          { number: "ET/2", expiryDate: null },
        ]);
      }));

    it("holds a slice that shrank, and applies it only with an approval for that release", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        world.published.permits = [1, 2, 3, 4, 5].map((number) => siteRecord(number));
        const full = await runImport(world, ["permits"]);

        world.published.permits = [1, 2, 3].map((number) => siteRecord(number));
        const held = await runImport(world, ["permits"]);
        const approvedOtherRelease = await runImport(world, ["permits"], await approvalOfRelease(world, full));
        const heldSlice = { dataset: "permits", slice: "north", outcome: "held", stagedCount: 3, liveCount: 5 };

        expect(await slicesOf(world, held)).toEqual([heldSlice]);
        expect(await slicesOf(world, approvedOtherRelease)).toEqual([heldSlice]);
        expect(await changesOf(world, held)).toEqual({});
        expect(await listingsOf(world)).toHaveLength(5);

        const approved = await runImport(world, ["permits"], await approvalOfRelease(world, held));

        expect(await slicesOf(world, approved)).toEqual([{ ...heldSlice, outcome: "applied" }]);
        expect(await changesOf(world, approved)).toEqual({ "permits: permit_unlisted": 2, permit_archived: 2 });
        expect((await permitsOf(world)).map((permit) => permit.number)).toEqual(["ET/1", "ET/2", "ET/3"]);
      }));

    it("moves a site that its licensee publishes at a new place", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        world.published.permits = [siteRecord(1)];
        await runImport(world, ["permits"]);
        const [siteBefore] = await sitesOf(world);
        const permitsBefore = await permitsOf(world);

        world.published.permits = [{ ...siteRecord(1), location: { ...siteRecord(1).location, longitude: -31.5 } }];
        const moved = await runImport(world, ["permits"]);
        const sitesAfter = await sitesOf(world);

        expect(sitesAfter).toEqual([{ id: siteBefore?.id, siteId: "ET1", locationId: expect.any(Number) }]);
        expect(sitesAfter[0]?.locationId).not.toBe(siteBefore?.locationId);
        expect(await permitsOf(world)).toEqual(permitsBefore);
        expect(await readChanges(tx, moved, { afterSeq: null, kinds: ["site_added", "site_moved", "permit_added"], limit: 10 })).toEqual([
          expect.objectContaining({ kind: "site_moved", officialSiteId: siteBefore?.id, fromLocationId: siteBefore?.locationId }),
        ]);
      }));

    it("keeps one site where the permits dataset puts it, and lets the registry move it once the permits dataset drops it", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        const atRegistryPlace = (record: SiteRecord): SiteRecord => ({ ...record, location: { ...record.location, longitude: -31.5 } });
        world.published.permits = [siteRecord(1)];
        world.published.registry = [atRegistryPlace(siteRecord(1))];
        const listedByBoth = await runImport(world, ["permits", "registry"]);
        const sitesOfBoth = await sitesOf(world);

        expect(sitesOfBoth).toEqual([{ id: expect.any(Number), siteId: "ET1", locationId: expect.any(Number) }]);
        expect(await changesOf(world, listedByBoth)).toEqual({ "permits: site_added": 1, "permits: permit_added": 1, "registry: permit_listed": 1 });

        world.published.registry = [atRegistryPlace(siteRecord(1)), siteRecord(2)];
        const registryAgain = await runImport(world, ["registry"]);

        expect(await changesOf(world, registryAgain)).toEqual({ "registry: site_added": 1, "registry: permit_added": 1 });
        expect((await sitesOf(world)).find((site) => site.siteId === "ET1")).toEqual(sitesOfBoth[0]);

        world.published.permits = [siteRecord(3)];
        world.published.registry = [atRegistryPlace(siteRecord(1)), siteRecord(2), siteRecord(4)];
        const droppedByPermits = await runImport(world, ["permits", "registry"]);
        const movedSite = (await sitesOf(world)).find((site) => site.siteId === "ET1");

        expect(await changesOf(world, droppedByPermits)).toEqual({
          "permits: site_added": 1,
          "permits: permit_added": 1,
          "permits: permit_unlisted": 1,
          "registry: site_added": 1,
          "registry: permit_added": 1,
          "registry: site_moved": 1,
        });
        expect(movedSite?.id).toBe(sitesOfBoth[0]?.id);
        expect(movedSite?.locationId).not.toBe(sitesOfBoth[0]?.locationId);
      }));

    it("renews a microwave link whose permit number changed", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        world.published.links = [linkRecord("ETL/1")];
        const added = await runImport(world, ["links"]);
        const linksBefore = await linksOf(world);

        world.published.links = [linkRecord("ETL/2")];
        const renewed = await runImport(world, ["links"]);

        expect(linksBefore).toHaveLength(1);
        expect(await linksOf(world)).toEqual(linksBefore.map((link) => ({ ...link, permitNumber: "ETL/2" })));
        expect(await changesOf(world, added)).toEqual({ "links: microwave_link_added": 1 });
        expect(await changesOf(world, renewed)).toEqual({ "links: microwave_link_renewed": 1 });
      }));

    it("matches a link published under a second spelling of its licensee: no new licensee, nothing archived", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        world.published.links = [linkRecord("ETL/1")];
        await runImport(world, ["links"]);
        const linksBefore = await linksOf(world);

        world.published.links = [{ ...linkRecord("ETL/1"), licensee: OPERATOR_NAME }];
        const respelled = await runImport(world, ["links"]);

        expect(linksBefore).toHaveLength(1);
        expect(await linksOf(world)).toEqual(linksBefore);
        expect(await changesOf(world, respelled)).toEqual({});
        expect(await tx.select({ legalName: licensees.full_name }).from(licensees).where(eq(licensees.sourceId, world.sourceId))).toEqual([
          { legalName: LICENSEE_NAME },
        ]);
      }));

    it("rounds a decimal azimuth instead of failing the release", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        const sector: SiteSector = { azimuth: 120.5, antennaHeight: 30.5, antennaPlacement: "outdoor" };
        world.published.permits = [{ ...siteRecord(1), sectors: [sector, { ...sector, azimuth: 121.4 }] }];

        const run = await runImport(world, ["permits"]);

        expect(await slicesOf(world, run)).toEqual([{ dataset: "permits", slice: "north", outcome: "applied", stagedCount: 1, liveCount: 0 }]);
        expect(
          await tx
            .select({ azimuth: officialPermitSectors.azimuth })
            .from(officialPermitSectors)
            .innerJoin(officialPermits, eq(officialPermits.id, officialPermitSectors.permit_id))
            .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
            .where(eq(officialSites.source_id, world.sourceId)),
        ).toEqual([{ azimuth: 121 }]);
      }));

    it("keeps an inventory permit whose status changed, and keeps only the sectors the latest release publishes", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx, undefined, "inventory");
        const record = siteRecord(1);
        const sector = (azimuth: number, antennaHeight: number): SiteSector => ({ azimuth, antennaHeight, antennaPlacement: null });
        const storedPermit = () =>
          tx
            .select({ id: officialPermits.id, status: officialPermits.status })
            .from(officialPermits)
            .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
            .where(eq(officialSites.source_id, world.sourceId));
        const storedSectors = () =>
          tx
            .select({ azimuth: officialPermitSectors.azimuth, antennaHeight: officialPermitSectors.antenna_height })
            .from(officialPermitSectors)
            .innerJoin(officialPermits, eq(officialPermits.id, officialPermitSectors.permit_id))
            .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
            .where(eq(officialSites.source_id, world.sourceId))
            .orderBy(asc(officialPermitSectors.azimuth));

        world.published.permits = [{ ...record, permit: { ...record.permit, status: "approved" }, sectors: [sector(120, 30.5), sector(240, 30.5)] }];
        await runImport(world, ["permits"]);
        const [approved] = await storedPermit();

        world.published.permits = [{ ...record, permit: { ...record.permit, status: "in_service" }, sectors: [sector(120, 30.5), sector(240, 32)] }];
        await runImport(world, ["permits"]);

        expect(approved?.status).toBe("approved");
        expect(await storedPermit()).toEqual([{ id: approved?.id, status: "in_service" }]);
        expect(await storedSectors()).toEqual([
          { azimuth: 120, antennaHeight: 30.5 },
          { azimuth: 240, antennaHeight: 32 },
        ]);
      }));

    it("stores a permit published on several lines once, with every line's sectors, and counts permits for the guard and lines for the skips", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        const sector = (azimuth: number): SiteSector => ({ azimuth, antennaHeight: 30.5, antennaPlacement: "outdoor" });
        const withSectors = (record: SiteRecord, ...azimuths: number[]): SiteRecord => ({ ...record, sectors: azimuths.map(sector) });
        const withoutRegion = (record: SiteRecord): SiteRecord => ({ ...record, location: { ...record.location, regionIsoCode: "ZZ-XX" } });
        world.published.registry = [
          withSectors(siteRecord(1), 0),
          withSectors(siteRecord(2), 90),
          withSectors(siteRecord(1), 120),
          withoutRegion(siteRecord(3)),
          withSectors(siteRecord(1), 240, 120),
          withoutRegion(siteRecord(3)),
        ];

        const run = await runImport(world, ["registry"]);
        const sectorsOfFirst = await tx
          .select({ azimuth: officialPermitSectors.azimuth })
          .from(officialPermitSectors)
          .innerJoin(officialPermits, eq(officialPermits.id, officialPermitSectors.permit_id))
          .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
          .where(and(eq(officialSites.source_id, world.sourceId), eq(officialPermits.decision_number, "ET/1")))
          .orderBy(asc(officialPermitSectors.azimuth));

        expect(await slicesOf(world, run)).toEqual([{ dataset: "registry", slice: "north", outcome: "applied", stagedCount: 2, liveCount: 0 }]);
        expect(await changesOf(world, run)).toEqual({ "registry: site_added": 2, "registry: permit_added": 2 });
        expect(sectorsOfFirst).toEqual([{ azimuth: 0 }, { azimuth: 120 }, { azimuth: 240 }]);
        expect(
          await tx
            .select({ reason: officialImportRunSkips.reason, recordCount: officialImportRunSkips.recordCount })
            .from(officialImportRunSkips)
            .where(eq(officialImportRunSkips.runId, run)),
        ).toEqual([{ reason: "unknown_region", recordCount: 2 }]);
      }));

    it("keeps one permit for two datasets, unlists it when one drops it and archives it when both did", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        const others = [2, 3, 4, 5, 6].map((number) => siteRecord(number));
        world.published.permits = [siteRecord(1)];
        world.published.registry = [siteRecord(1), ...others];
        const listedByBoth = await runImport(world, ["permits", "registry"]);
        const permitsOfBoth = await permitsOf(world);

        expect(await changesOf(world, listedByBoth)).toEqual({
          "permits: site_added": 1,
          "permits: permit_added": 1,
          "registry: site_added": 5,
          "registry: permit_added": 5,
          "registry: permit_listed": 1,
        });
        expect(permitsOfBoth).toHaveLength(6);
        expect((await listingsOf(world)).filter((listing) => listing.number === "ET/1")).toEqual([
          { number: "ET/1", dataset: "permits" },
          { number: "ET/1", dataset: "registry" },
        ]);

        world.published.registry = others;
        const droppedByOne = await runImport(world, ["permits", "registry"]);

        expect(await changesOf(world, droppedByOne)).toEqual({ "registry: permit_unlisted": 1 });
        expect(await permitsOf(world)).toEqual(permitsOfBoth);

        world.published.permits = [siteRecord(7)];
        const droppedByBoth = await runImport(world, ["permits", "registry"]);

        expect(await changesOf(world, droppedByBoth)).toEqual({
          "permits: site_added": 1,
          "permits: permit_added": 1,
          "permits: permit_unlisted": 1,
          permit_archived: 1,
        });
        expect((await permitsOf(world)).map((permit) => permit.number)).toEqual(["ET/2", "ET/3", "ET/4", "ET/5", "ET/6", "ET/7"]);
      }));

    it("keeps the id of a permit that moves from one dataset to the other in one run", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        world.published.permits = [siteRecord(1), siteRecord(2)];
        world.published.registry = [siteRecord(3)];
        await runImport(world, ["permits", "registry"]);
        const permitsBefore = await permitsOf(world);

        world.published.permits = [siteRecord(2), siteRecord(4)];
        world.published.registry = [siteRecord(3), siteRecord(1)];
        const moved = await runImport(world, ["permits", "registry"]);

        expect(await changesOf(world, moved)).toEqual({
          "permits: site_added": 1,
          "permits: permit_added": 1,
          "permits: permit_unlisted": 1,
          "registry: permit_listed": 1,
        });
        expect(permitsBefore).toHaveLength(3);
        expect(await permitsOf(world)).toEqual(expect.arrayContaining(permitsBefore));
        expect((await listingsOf(world)).filter((listing) => listing.number === "ET/1")).toEqual([{ number: "ET/1", dataset: "registry" }]);
      }));

    it("re-keys a site in place for a remap: its id, watch, list entry and link stay", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        world.published.permits = [siteRecord(1)];
        await runImport(world, ["permits"]);
        const [siteBefore] = await sitesOf(world);
        const [permit] = await permitsOf(world);
        if (!siteBefore || !permit) throw new Error("The import stored no site");

        const userId = await addUser(tx, "watcher");
        await tx.insert(officialSiteWatches).values({ userId, officialSiteId: siteBefore.id });
        await addList(tx, userId, [siteBefore.id]);
        const [station] = await tx
          .insert(stations)
          .values({ station_id: "ET1", operator_id: world.operatorIds.mapped })
          .returning({ id: stations.id });
        if (!station) throw new Error("The station was not added");
        await tx.insert(stationsPermits).values({ station_id: station.id, permit_id: permit.id });

        const remapped = await remapToOtherOperator(world, LICENSEE_NAME);

        expect(await sitesOf(world)).toEqual([siteBefore]);
        expect(await placedPermitsOf(world)).toEqual([{ ...permit, operatorId: world.operatorIds.other }]);
        expect(await watchesOf(world)).toEqual([{ userId, officialSiteId: siteBefore.id }]);
        expect(await listedSitesOf(tx, userId)).toEqual([{ stations: { internal: [], official: [siteBefore.id] } }]);
        expect(
          await tx.select({ permitId: stationsPermits.permit_id }).from(stationsPermits).where(eq(stationsPermits.station_id, station.id)),
        ).toEqual([{ permitId: permit.id }]);
        expect(await changesOf(world, remapped)).toEqual({ site_remapped: 1 });
        expect(
          await tx
            .select({ operatorId: licensees.operatorId })
            .from(licensees)
            .where(and(eq(licensees.sourceId, world.sourceId), eq(licensees.full_name, LICENSEE_NAME))),
        ).toEqual([{ operatorId: world.operatorIds.other }]);
      }));

    it("merges a remapped site into the new operator's site: equal permits become one, watches and list entries follow once", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        world.published.permits = [siteRecord(1), siteRecord(1, { licensee: OTHER_LICENSEE_NAME })];
        await runImport(world, ["permits"]);
        const stored = await tx
          .select({ id: officialSites.id, operatorId: officialSites.operator_id })
          .from(officialSites)
          .where(eq(officialSites.source_id, world.sourceId));
        const old = stored.find((site) => site.operatorId === world.operatorIds.mapped);
        const target = stored.find((site) => site.operatorId === world.operatorIds.other);
        const keptPermit = (await placedPermitsOf(world)).find((permit) => permit.operatorId === world.operatorIds.other);
        if (!old || !target || !keptPermit) throw new Error("The import did not store both operators' sites");

        const watcherOfBoth = await addUser(tx, "watcher-of-both");
        const watcherOfOld = await addUser(tx, "watcher-of-old");
        await tx.insert(officialSiteWatches).values([
          { userId: watcherOfBoth, officialSiteId: old.id },
          { userId: watcherOfBoth, officialSiteId: target.id },
          { userId: watcherOfOld, officialSiteId: old.id },
        ]);
        await addList(tx, watcherOfBoth, [old.id, target.id]);
        await addList(tx, watcherOfOld, [old.id]);

        const remapped = await remapToOtherOperator(world, LICENSEE_NAME);

        const watches = await watchesOf(world);

        expect(await sitesOf(world)).toEqual([{ id: target.id, siteId: "ET1", locationId: expect.any(Number) }]);
        expect(await placedPermitsOf(world)).toEqual([keptPermit]);
        expect(watches).toHaveLength(2);
        expect(watches).toEqual(
          expect.arrayContaining([
            { userId: watcherOfBoth, officialSiteId: target.id },
            { userId: watcherOfOld, officialSiteId: target.id },
          ]),
        );
        expect(await listedSitesOf(tx, watcherOfBoth)).toEqual([{ stations: { internal: [], official: [target.id] } }]);
        expect(await listedSitesOf(tx, watcherOfOld)).toEqual([{ stations: { internal: [], official: [target.id] } }]);
        expect(await listingsOf(world)).toEqual([{ number: "ET/1", dataset: "permits" }]);
        expect(await changesOf(world, remapped)).toEqual({ site_remapped: 1 });
      }));

    it("splits a site for a remap when another licensee, which keeps the operator, also lists one of its permits", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        world.published.permits = [siteRecord(1), siteRecord(1, { permitNumber: "ET/shared" })];
        world.published.registry = [siteRecord(1, { permitNumber: "ET/shared", licensee: REGISTRY_LICENSEE_NAME })];
        await runImport(world, ["permits", "registry"]);
        const sitesBefore = await sitesOf(world);
        const permitsBefore = await placedPermitsOf(world);

        const remapped = await remapToOtherOperator(world, LICENSEE_NAME);

        expect(sitesBefore).toHaveLength(1);
        expect(await sitesOf(world)).toHaveLength(2);
        expect(await placedPermitsOf(world)).toEqual(
          permitsBefore.map((permit) => (permit.number === "ET/1" ? { ...permit, operatorId: world.operatorIds.other } : permit)),
        );
        expect(await changesOf(world, remapped)).toEqual({ site_added: 1, site_remapped: 1 });
      }));

    it("writes a release with its checkpoint and its change set, or not at all", () =>
      rolledBack(async (tx) => {
        let sitesTheHookSaw = 0;
        const world = await openWorld(tx, async (release) => {
          const written = await release.tx
            .select({ id: officialSites.id })
            .from(officialSites)
            .innerJoin(officialSources, eq(officialSources.id, officialSites.source_id))
            .where(eq(officialSources.key, SOURCE_KEY));
          sitesTheHookSaw = written.length;
          throw new Error("The hook failed");
        });
        world.published.permits = [siteRecord(1)];

        const run = await runImport(world, ["permits"]);

        expect(sitesTheHookSaw).toBe(1);
        expect(await sitesOf(world)).toEqual([]);
        expect(await permitsOf(world)).toEqual([]);
        expect(await slicesOf(world, run)).toEqual([]);
        expect(await changesOf(world, run)).toEqual({});
        expect(
          await tx.select({ error: officialImportRunDatasets.error }).from(officialImportRunDatasets).where(eq(officialImportRunDatasets.runId, run)),
        ).toEqual([{ error: "The hook failed" }]);
      }));

    it("writes nothing for a runner whose run another runner took over", () =>
      rolledBack(async (tx) => {
        const world = await openWorld(tx);
        world.published.permits = [siteRecord(1)];
        const stalled = await claimRun(world, { datasetIds: [world.datasetIds.permits] });
        await tx.update(officialImportRuns).set({ claimToken: randomUUID() }).where(eq(officialImportRuns.id, stalled.id));

        expect(await processRun(stalled, world.environment)).toBe("lost");
        expect(await sitesOf(world)).toEqual([]);
        expect(await tx.select().from(officialListedFiles).where(eq(officialListedFiles.sourceId, world.sourceId))).toEqual([]);
        expect(await tx.select().from(officialDatasetSlices).where(eq(officialDatasetSlices.datasetId, world.datasetIds.permits))).toEqual([]);
        expect(
          await tx
            .select({ state: officialImportRuns.state, error: officialImportRuns.error })
            .from(officialImportRuns)
            .where(eq(officialImportRuns.id, stalled.id)),
        ).toEqual([{ state: "running", error: null }]);
      }));
  },
);
