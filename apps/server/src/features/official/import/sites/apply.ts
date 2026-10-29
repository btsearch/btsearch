import type { PermitKind, PublishedSiteName, SitesDataset } from "@openbts/country-packs/sources";
import { officialDatasets, officialLocations, officialPermitListings, officialPermitSectors, officialPermits, officialSites } from "@openbts/drizzle";
import { type SQL, and, eq, inArray, isNotNull, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { chunks, unique } from "../../../../lib/collections.js";
import { idsIn } from "../../../../lib/conditions.js";
import type { DbTx } from "../../../../types/global.js";
import { sourceAuditOn } from "../audit.js";
import { STATEMENT_BATCH_SIZE } from "../config.js";
import type { ChangeInput, ReleaseInput } from "../types.js";
import { type MoveCandidate, type SiteMove, decideSiteMoves } from "./lineage.js";
import { dropStagedSlices, sliceListOf, stagedPermits } from "./staging.js";

type AddedSite = { officialSiteId: number; slice: string };
type ListedPermit = { permitId: number; slice: string; officialSiteId: number };
type UnlistedPermit = ListedPermit & { wasLastListing: boolean };

const KINDS_LISTING_EVERY_SECTOR: ReadonlySet<PermitKind> = new Set(["inventory", "registration"]);

async function matchLocations(tx: DbTx, sourceId: number): Promise<void> {
  await tx
    .update(stagedPermits)
    .set({ locationId: officialLocations.id })
    .from(officialLocations)
    .where(
      and(
        isNull(stagedPermits.locationId),
        isNull(stagedPermits.locationRef),
        eq(officialLocations.source_id, sourceId),
        isNull(officialLocations.source_ref),
        eq(officialLocations.longitude, stagedPermits.longitude),
        eq(officialLocations.latitude, stagedPermits.latitude),
      ),
    );
  await tx
    .update(stagedPermits)
    .set({ locationId: officialLocations.id })
    .from(officialLocations)
    .where(
      and(isNull(stagedPermits.locationId), eq(officialLocations.source_id, sourceId), eq(officialLocations.source_ref, stagedPermits.locationRef)),
    );
}

async function insertLocations(tx: DbTx, sourceId: number): Promise<number> {
  const locationColumns = {
    source_id: sql`${sourceId}::integer`.as("source_id"),
    region_id: stagedPermits.regionId,
    city: stagedPermits.city,
    address: stagedPermits.address,
    longitude: stagedPermits.longitude,
    latitude: stagedPermits.latitude,
    precision_meters: stagedPermits.precisionMeters,
    source_ref: stagedPermits.locationRef,
  };
  const byCoordinates = await tx
    .insert(officialLocations)
    .select(
      tx
        .selectDistinctOn([stagedPermits.longitude, stagedPermits.latitude], locationColumns)
        .from(stagedPermits)
        .where(and(isNull(stagedPermits.locationId), isNull(stagedPermits.locationRef)))
        .orderBy(stagedPermits.longitude, stagedPermits.latitude, stagedPermits.ordinal),
    )
    .returning({ id: officialLocations.id });
  const byRef = await tx
    .insert(officialLocations)
    .select(
      tx
        .selectDistinctOn([stagedPermits.locationRef], locationColumns)
        .from(stagedPermits)
        .where(and(isNull(stagedPermits.locationId), isNotNull(stagedPermits.locationRef)))
        .orderBy(stagedPermits.locationRef, stagedPermits.ordinal),
    )
    .returning({ id: officialLocations.id });
  return byCoordinates.length + byRef.length;
}

async function updateLocationsMatchedByRef(tx: DbTx, fileDate: Date): Promise<void> {
  await tx.execute(sql`
    UPDATE ${officialLocations} AS location
    SET longitude = published.longitude, latitude = published.latitude, city = published.city, address = published.address,
      precision_meters = published.precision_meters, region_id = published.region_id, "updatedAt" = ${fileDate.toISOString()}::timestamp with time zone
    FROM (
      SELECT DISTINCT ON (staged.location_id) staged.location_id, staged.longitude, staged.latitude, staged.city, staged.address,
        staged.precision_meters, staged.region_id
      FROM ${stagedPermits} AS staged
      WHERE staged.location_ref IS NOT NULL AND staged.location_id IS NOT NULL
      ORDER BY staged.location_id, staged.ordinal
    ) AS published
    WHERE location.id = published.location_id
      AND (location.longitude, location.latitude, location.city, location.address, location.precision_meters, location.region_id)
        IS DISTINCT FROM (published.longitude, published.latitude, published.city, published.address, published.precision_meters, published.region_id)
  `);
}

async function matchSites(tx: DbTx, sourceId: number): Promise<void> {
  await tx
    .update(stagedPermits)
    .set({ officialSiteId: officialSites.id })
    .from(officialSites)
    .where(
      and(
        isNull(stagedPermits.officialSiteId),
        isNull(stagedPermits.siteRef),
        eq(officialSites.source_id, sourceId),
        isNull(officialSites.source_ref),
        eq(officialSites.station_id, stagedPermits.siteCode),
        eq(officialSites.operator_id, stagedPermits.operatorId),
      ),
    );
  await tx
    .update(stagedPermits)
    .set({ officialSiteId: officialSites.id })
    .from(officialSites)
    .where(and(isNull(stagedPermits.officialSiteId), eq(officialSites.source_id, sourceId), eq(officialSites.source_ref, stagedPermits.siteRef)));
}

function isNotPlacedByAnyOf(tx: DbTx, sourceId: number, datasetKeys: readonly string[]): SQL | undefined {
  if (datasetKeys.length === 0) return undefined;

  return notExists(
    tx
      .select({ id: officialPermits.id })
      .from(officialPermits)
      .innerJoin(officialPermitListings, eq(officialPermitListings.permitId, officialPermits.id))
      .innerJoin(officialDatasets, eq(officialDatasets.id, officialPermitListings.datasetId))
      .where(
        and(
          eq(officialPermits.official_site_id, officialSites.id),
          eq(officialDatasets.sourceId, sourceId),
          inArray(officialDatasets.key, [...datasetKeys]),
        ),
      ),
  );
}

async function readMoveCandidates(tx: DbTx, sourceId: number, strongerDatasetKeys: readonly string[]): Promise<MoveCandidate[]> {
  const named = tx
    .select({
      officialSiteId: stagedPermits.officialSiteId,
      locationId: sql<number>`${stagedPermits.locationId}`.as("location_id"),
      firstOrdinal: sql<number>`min(${stagedPermits.ordinal})`.as("first_ordinal"),
      slice: sql<string>`min(${stagedPermits.slice})`.as("slice"),
    })
    .from(stagedPermits)
    .where(isNotNull(stagedPermits.officialSiteId))
    .groupBy(stagedPermits.officialSiteId, stagedPermits.locationId)
    .as("named");
  const here = alias(stagedPermits, "here");

  return tx
    .select({
      officialSiteId: officialSites.id,
      fromLocationId: officialSites.location_id,
      locationId: named.locationId,
      firstOrdinal: named.firstOrdinal,
      slice: named.slice,
    })
    .from(named)
    .innerJoin(officialSites, eq(officialSites.id, named.officialSiteId))
    .where(
      and(
        notExists(
          tx
            .select({ ordinal: here.ordinal })
            .from(here)
            .where(and(eq(here.officialSiteId, officialSites.id), eq(here.locationId, officialSites.location_id))),
        ),
        isNotPlacedByAnyOf(tx, sourceId, strongerDatasetKeys),
      ),
    )
    .orderBy(named.firstOrdinal, officialSites.id);
}

async function moveSites(tx: DbTx, moves: readonly SiteMove[], fileDate: Date): Promise<void> {
  for (const group of chunks(moves, STATEMENT_BATCH_SIZE)) {
    const moved = sql.param(group.map((move) => ({ official_site_id: move.officialSiteId, to_location_id: move.toLocationId })));
    // eslint-disable-next-line no-await-in-loop
    await tx.execute(sql`
      UPDATE ${officialSites} AS site
      SET location_id = moved.to_location_id, "updatedAt" = ${fileDate.toISOString()}::timestamp with time zone
      FROM jsonb_to_recordset(${moved}::jsonb) AS moved (official_site_id integer, to_location_id integer)
      WHERE site.id = moved.official_site_id
    `);
  }
}

async function insertSitesByCode(tx: DbTx, sourceId: number, fileDate: Date): Promise<AddedSite[]> {
  const added = await tx.execute<AddedSite>(sql`
    WITH added AS (
      INSERT INTO ${officialSites} (source_id, site_id, operator_id, location_id, "createdAt", "updatedAt")
      SELECT DISTINCT ON (named.site_code, named.operator_id) ${sourceId}::integer, named.site_code, named.operator_id, named.location_id,
        ${fileDate.toISOString()}::timestamp with time zone, ${fileDate.toISOString()}::timestamp with time zone
      FROM (
        SELECT staged.site_code, staged.operator_id, staged.location_id, min(staged.ordinal) AS first_ordinal
        FROM ${stagedPermits} AS staged
        WHERE staged.official_site_id IS NULL AND staged.site_ref IS NULL
        GROUP BY staged.site_code, staged.operator_id, staged.location_id
      ) AS named
      ORDER BY named.site_code, named.operator_id, named.first_ordinal DESC
      RETURNING id, site_id, operator_id
    )
    SELECT added.id AS "officialSiteId", min(staged.slice) AS slice
    FROM added
    JOIN ${stagedPermits} AS staged
      ON staged.site_ref IS NULL AND staged.site_code = added.site_id AND staged.operator_id = added.operator_id
    GROUP BY added.id
    ORDER BY added.id
  `);
  return [...added];
}

async function insertSitesByRef(tx: DbTx, sourceId: number, fileDate: Date): Promise<AddedSite[]> {
  const added = await tx.execute<AddedSite>(sql`
    WITH added AS (
      INSERT INTO ${officialSites} (source_id, source_ref, site_id, operator_id, location_id, "createdAt", "updatedAt")
      SELECT DISTINCT ON (named.site_ref) ${sourceId}::integer, named.site_ref, named.site_code, named.operator_id, named.location_id,
        ${fileDate.toISOString()}::timestamp with time zone, ${fileDate.toISOString()}::timestamp with time zone
      FROM (
        SELECT staged.site_ref, staged.site_code, staged.operator_id, staged.location_id, min(staged.ordinal) AS first_ordinal
        FROM ${stagedPermits} AS staged
        WHERE staged.official_site_id IS NULL AND staged.site_ref IS NOT NULL
        GROUP BY staged.site_ref, staged.site_code, staged.operator_id, staged.location_id
      ) AS named
      ORDER BY named.site_ref, named.first_ordinal DESC
      RETURNING id, source_ref
    )
    SELECT added.id AS "officialSiteId", min(staged.slice) AS slice
    FROM added
    JOIN ${stagedPermits} AS staged ON staged.site_ref = added.source_ref
    GROUP BY added.id
    ORDER BY added.id
  `);
  return [...added];
}

async function matchPermits(tx: DbTx): Promise<void> {
  await tx
    .update(stagedPermits)
    .set({ permitId: officialPermits.id })
    .from(officialPermits)
    .where(
      and(
        isNull(stagedPermits.permitId),
        eq(officialPermits.official_site_id, stagedPermits.officialSiteId),
        sql`${officialPermits.rat} IS NOT DISTINCT FROM ${stagedPermits.rat}`,
        sql`${officialPermits.label_mhz} IS NOT DISTINCT FROM ${stagedPermits.labelMhz}`,
        sql`${officialPermits.label_variant} IS NOT DISTINCT FROM ${stagedPermits.labelVariant}`,
        sql`${officialPermits.decision_number} IS NOT DISTINCT FROM ${stagedPermits.decisionNumber}`,
        sql`${officialPermits.decision_type} IS NOT DISTINCT FROM ${stagedPermits.decisionType}`,
        sql`${officialPermits.expiry_date} IS NOT DISTINCT FROM ${stagedPermits.expiryDate}`,
      ),
    );
}

async function insertPermits(tx: DbTx, fileDate: Date): Promise<Set<number>> {
  const added = await tx
    .insert(officialPermits)
    .select(
      tx
        .selectDistinct({
          official_site_id: stagedPermits.officialSiteId,
          rat: stagedPermits.rat,
          label_mhz: stagedPermits.labelMhz,
          label_variant: stagedPermits.labelVariant,
          decision_number: stagedPermits.decisionNumber,
          decision_type: stagedPermits.decisionType,
          expiry_date: stagedPermits.expiryDate,
          status: stagedPermits.status,
          createdAt: sql`${fileDate.toISOString()}::timestamp with time zone`.as("createdAt"),
          updatedAt: sql`${fileDate.toISOString()}::timestamp with time zone`.as("updatedAt"),
        })
        .from(stagedPermits)
        .where(isNull(stagedPermits.permitId)),
    )
    .returning({ id: officialPermits.id });
  return new Set(added.map((permit) => permit.id));
}

async function updatePermitStatuses(tx: DbTx, fileDate: Date): Promise<void> {
  await tx
    .update(officialPermits)
    .set({ status: stagedPermits.status, updatedAt: sql`${fileDate.toISOString()}::timestamp with time zone` })
    .from(stagedPermits)
    .where(and(eq(officialPermits.id, stagedPermits.permitId), sql`${officialPermits.status} IS DISTINCT FROM ${stagedPermits.status}`));
}

async function refreshListings(tx: DbTx, datasetId: number): Promise<void> {
  const fresh = tx
    .selectDistinctOn([stagedPermits.permitId], {
      permitId: stagedPermits.permitId,
      slice: stagedPermits.slice,
      licenseeId: stagedPermits.licenseeId,
    })
    .from(stagedPermits)
    .orderBy(stagedPermits.permitId, stagedPermits.ordinal)
    .as("fresh");
  await tx
    .update(officialPermitListings)
    .set({ licenseeId: fresh.licenseeId, slice: fresh.slice })
    .from(fresh)
    .where(
      and(
        eq(officialPermitListings.permitId, fresh.permitId),
        eq(officialPermitListings.datasetId, datasetId),
        or(sql`${officialPermitListings.licenseeId} IS DISTINCT FROM ${fresh.licenseeId}`, ne(officialPermitListings.slice, fresh.slice)),
      ),
    );
}

async function insertListings(tx: DbTx, datasetId: number): Promise<ListedPermit[]> {
  const listed = await tx.execute<ListedPermit>(sql`
    WITH listed AS (
      INSERT INTO ${officialPermitListings} (permit_id, dataset_id, slice, licensee_id)
      SELECT DISTINCT ON (staged.permit_id) staged.permit_id, ${datasetId}::integer, staged.slice, staged.licensee_id
      FROM ${stagedPermits} AS staged
      WHERE NOT EXISTS (
        SELECT 1 FROM ${officialPermitListings} AS listing
        WHERE listing.permit_id = staged.permit_id AND listing.dataset_id = ${datasetId}::integer
      )
      ORDER BY staged.permit_id, staged.ordinal
      RETURNING permit_id, slice
    )
    SELECT listed.permit_id AS "permitId", listed.slice, permit.official_site_id AS "officialSiteId"
    FROM listed
    JOIN ${officialPermits} AS permit ON permit.id = listed.permit_id
    ORDER BY listed.permit_id
  `);
  return [...listed];
}

const PUBLISHED_SECTORS = sql`
  SELECT round(published.azimuth)::integer AS azimuth, published.antenna_height, published.antenna_type
  FROM jsonb_to_recordset(staged.sectors)
    AS published (azimuth numeric, antenna_height double precision, antenna_type antenna_type)
`;

const SAME_SECTOR = sql`
  stored.azimuth IS NOT DISTINCT FROM sector.azimuth AND stored.antenna_height IS NOT DISTINCT FROM sector.antenna_height
  AND stored.antenna_type IS NOT DISTINCT FROM sector.antenna_type
`;

async function insertSectors(tx: DbTx): Promise<void> {
  await tx.execute(sql`
    INSERT INTO ${officialPermitSectors} (permit_id, azimuth, antenna_height, antenna_type)
    SELECT DISTINCT staged.permit_id, sector.azimuth, sector.antenna_height, sector.antenna_type
    FROM ${stagedPermits} AS staged
    CROSS JOIN LATERAL (${PUBLISHED_SECTORS}) AS sector
    WHERE NOT EXISTS (
      SELECT 1 FROM ${officialPermitSectors} AS stored
      WHERE stored.permit_id = staged.permit_id AND ${SAME_SECTOR}
    )
  `);
}

async function deleteUnpublishedSectors(tx: DbTx): Promise<void> {
  await tx.execute(sql`
    DELETE FROM ${officialPermitSectors} AS stored
    WHERE stored.permit_id IN (SELECT staged.permit_id FROM ${stagedPermits} AS staged)
      AND NOT EXISTS (
        SELECT 1 FROM ${stagedPermits} AS staged
        CROSS JOIN LATERAL (${PUBLISHED_SECTORS}) AS sector
        WHERE staged.permit_id = stored.permit_id AND ${SAME_SECTOR}
      )
  `);
}

async function unlistMissing(tx: DbTx, datasetId: number, slices: readonly string[]): Promise<UnlistedPermit[]> {
  const unlisted = await tx.execute<UnlistedPermit>(sql`
    DELETE FROM ${officialPermitListings} AS listing
    USING ${officialPermits} AS permit
    WHERE permit.id = listing.permit_id AND listing.dataset_id = ${datasetId}::integer AND listing.slice IN (${sliceListOf(slices)})
      AND NOT EXISTS (SELECT 1 FROM ${stagedPermits} AS staged WHERE staged.permit_id = listing.permit_id)
    RETURNING listing.permit_id AS "permitId", listing.slice, permit.official_site_id AS "officialSiteId",
      NOT EXISTS (
        SELECT 1 FROM ${officialPermitListings} AS other
        WHERE other.permit_id = listing.permit_id AND other.dataset_id <> listing.dataset_id
      ) AS "wasLastListing"
  `);
  return [...unlisted];
}

async function touchSites(tx: DbTx, officialSiteIds: readonly number[], fileDate: Date): Promise<void> {
  for (const group of chunks(officialSiteIds, STATEMENT_BATCH_SIZE)) {
    // eslint-disable-next-line no-await-in-loop
    await tx
      .update(officialSites)
      .set({ updatedAt: sql`GREATEST(${officialSites.updatedAt}, ${fileDate.toISOString()}::timestamp with time zone)` })
      .where(sql`${officialSites.id} IN ${idsIn(group)}`);
  }
}

async function analyzeFilledIds(tx: DbTx, columns: SQL): Promise<void> {
  await tx.execute(sql`ANALYZE ${stagedPermits} (${columns})`);
}

async function readSiteNames(tx: DbTx): Promise<PublishedSiteName[]> {
  return tx
    .selectDistinctOn([stagedPermits.operatorId, stagedPermits.siteCode], {
      operatorId: stagedPermits.operatorId,
      siteId: sql<string>`${stagedPermits.siteCode}`,
      name: sql<string>`${stagedPermits.siteName}`,
    })
    .from(stagedPermits)
    .where(and(ne(stagedPermits.siteName, ""), isNotNull(stagedPermits.siteCode)))
    .orderBy(stagedPermits.operatorId, stagedPermits.siteCode, stagedPermits.siteNameOrdinal);
}

async function resolveStagedSites(
  tx: DbTx,
  { scope, fileDate }: ReleaseInput,
  definition: SitesDataset,
): Promise<{ moves: SiteMove[]; added: AddedSite[] }> {
  const { sourceId } = scope.run;
  await matchLocations(tx, sourceId);
  await updateLocationsMatchedByRef(tx, fileDate);
  if ((await insertLocations(tx, sourceId)) > 0) await matchLocations(tx, sourceId);

  await matchSites(tx, sourceId);
  const moves = decideSiteMoves(await readMoveCandidates(tx, sourceId, definition.yieldsSitePlacementTo ?? []));
  await moveSites(tx, moves, fileDate);
  const added = [...(await insertSitesByCode(tx, sourceId, fileDate)), ...(await insertSitesByRef(tx, sourceId, fileDate))];
  if (added.length > 0) await matchSites(tx, sourceId);
  await analyzeFilledIds(tx, sql`location_id, official_site_id`);

  return { moves, added };
}

async function writeSiteNames(tx: DbTx, { scope }: ReleaseInput, definition: SitesDataset): Promise<void> {
  if (!definition.syncSiteNames) return;

  const siteNames = await readSiteNames(tx);
  const audit = sourceAuditOn(tx, (entryCount) => {
    scope.siteNames.written += entryCount;
  });
  const { skippedSiteNames } = await definition.syncSiteNames({ tx, siteNames, audit });
  scope.siteNames.skipped += skippedSiteNames;
}

export async function applySites(tx: DbTx, input: ReleaseInput, definition: SitesDataset, appliedSlices: readonly string[]): Promise<ChangeInput[]> {
  const { dataset, release, fileDate } = input;
  const datasetId = dataset.id;
  const heldSlices = release.coveredSlices.filter((slice) => !appliedSlices.includes(slice));
  if (heldSlices.length > 0) await dropStagedSlices(tx, heldSlices);

  const { moves, added } = await resolveStagedSites(tx, input, definition);

  await matchPermits(tx);
  const addedPermitIds = await insertPermits(tx, fileDate);
  if (addedPermitIds.size > 0) await matchPermits(tx);
  await analyzeFilledIds(tx, sql`permit_id`);
  await updatePermitStatuses(tx, fileDate);

  await refreshListings(tx, datasetId);
  const listed = await insertListings(tx, datasetId);
  if (KINDS_LISTING_EVERY_SECTOR.has(definition.permitKind)) await deleteUnpublishedSectors(tx);
  await insertSectors(tx);
  const unlisted = await unlistMissing(tx, datasetId, appliedSlices);

  const addedPermits = listed.filter((permit) => addedPermitIds.has(permit.permitId));
  const lostPermits = unlisted.filter((permit) => permit.wasLastListing);
  const touchedSiteIds = unique([...addedPermits, ...lostPermits].map((permit) => permit.officialSiteId));
  await touchSites(tx, touchedSiteIds, fileDate);
  await writeSiteNames(tx, input, definition);

  return [
    ...added.map(({ officialSiteId, slice }): ChangeInput => ({ kind: "site_added", datasetId, slice, officialSiteId })),
    ...moves.map(({ officialSiteId, slice, fromLocationId }): ChangeInput => ({
      kind: "site_moved",
      datasetId,
      slice,
      officialSiteId,
      fromLocationId,
    })),
    ...listed.map(({ permitId, slice, officialSiteId }): ChangeInput => ({
      kind: addedPermitIds.has(permitId) ? "permit_added" : "permit_listed",
      datasetId,
      slice,
      officialSiteId,
      permitId,
    })),
    ...unlisted.map(({ permitId, slice, officialSiteId }): ChangeInput => ({ kind: "permit_unlisted", datasetId, slice, officialSiteId, permitId })),
  ];
}
