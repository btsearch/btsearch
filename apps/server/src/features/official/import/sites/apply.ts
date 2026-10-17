import type { PublishedSiteName, SitesDataset } from "@openbts/country-packs/sources";
import { officialLocations, officialPermitListings, officialPermitSectors, officialPermits, officialSites } from "@openbts/drizzle";
import { type SQL, and, eq, isNull, ne, or, sql } from "drizzle-orm";

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

async function matchLocations(tx: DbTx, sourceId: number): Promise<void> {
  await tx
    .update(stagedPermits)
    .set({ locationId: officialLocations.id })
    .from(officialLocations)
    .where(
      and(
        isNull(stagedPermits.locationId),
        eq(officialLocations.source_id, sourceId),
        isNull(officialLocations.source_ref),
        eq(officialLocations.longitude, stagedPermits.longitude),
        eq(officialLocations.latitude, stagedPermits.latitude),
      ),
    );
}

async function insertLocations(tx: DbTx, sourceId: number): Promise<void> {
  await tx.insert(officialLocations).select(
    tx
      .selectDistinctOn([stagedPermits.longitude, stagedPermits.latitude], {
        source_id: sql`${sourceId}::integer`.as("source_id"),
        region_id: stagedPermits.regionId,
        city: stagedPermits.city,
        address: stagedPermits.address,
        longitude: stagedPermits.longitude,
        latitude: stagedPermits.latitude,
      })
      .from(stagedPermits)
      .where(isNull(stagedPermits.locationId))
      .orderBy(stagedPermits.longitude, stagedPermits.latitude, stagedPermits.ordinal),
  );
}

async function matchSites(tx: DbTx): Promise<void> {
  await tx
    .update(stagedPermits)
    .set({ officialSiteId: officialSites.id })
    .from(officialSites)
    .where(
      and(
        isNull(stagedPermits.officialSiteId),
        isNull(officialSites.source_ref),
        eq(officialSites.station_id, stagedPermits.siteCode),
        eq(officialSites.operator_id, stagedPermits.operatorId),
        eq(officialSites.location_id, stagedPermits.locationId),
      ),
    );
}

async function readMoveCandidates(tx: DbTx, sourceId: number): Promise<MoveCandidate[]> {
  const candidates = await tx.execute<MoveCandidate>(sql`
    SELECT unmatched.site_code AS "siteCode", unmatched.operator_id AS "operatorId", unmatched.location_id AS "locationId",
      unmatched.first_ordinal AS "firstOrdinal", unmatched.slice, site.id AS "officialSiteId", site.location_id AS "fromLocationId"
    FROM (
      SELECT staged.site_code, staged.operator_id, staged.location_id, min(staged.ordinal) AS first_ordinal, min(staged.slice) AS slice
      FROM ${stagedPermits} AS staged
      WHERE staged.official_site_id IS NULL
      GROUP BY staged.site_code, staged.operator_id, staged.location_id
    ) AS unmatched
    JOIN ${officialSites} AS site
      ON site.source_id = ${sourceId}::integer AND site.site_id = unmatched.site_code AND site.operator_id = unmatched.operator_id
    ORDER BY unmatched.first_ordinal, site.id
  `);
  return [...candidates];
}

async function moveSites(tx: DbTx, moves: readonly SiteMove[], fileDate: Date): Promise<void> {
  for (const group of chunks(moves, STATEMENT_BATCH_SIZE)) {
    const moved = JSON.stringify(
      group.map((move) => ({
        official_site_id: move.officialSiteId,
        to_location_id: move.toLocationId,
        site_code: move.siteCode,
        operator_id: move.operatorId,
      })),
    );
    // eslint-disable-next-line no-await-in-loop
    await tx.execute(sql`
      UPDATE ${officialSites} AS site
      SET location_id = moved.to_location_id, "updatedAt" = ${fileDate.toISOString()}::timestamp with time zone
      FROM jsonb_to_recordset(${moved}::jsonb) AS moved (official_site_id integer, to_location_id integer)
      WHERE site.id = moved.official_site_id
    `);
    // eslint-disable-next-line no-await-in-loop
    await tx.execute(sql`
      UPDATE ${stagedPermits} AS staged
      SET official_site_id = moved.official_site_id
      FROM jsonb_to_recordset(${moved}::jsonb) AS moved (official_site_id integer, site_code text, operator_id integer)
      WHERE staged.official_site_id IS NULL AND staged.site_code = moved.site_code AND staged.operator_id = moved.operator_id
    `);
  }
}

async function insertSites(tx: DbTx, sourceId: number, fileDate: Date): Promise<AddedSite[]> {
  const added = await tx.execute<AddedSite>(sql`
    WITH added AS (
      INSERT INTO ${officialSites} (source_id, site_id, operator_id, location_id, "createdAt", "updatedAt")
      SELECT DISTINCT ${sourceId}::integer, staged.site_code, staged.operator_id, staged.location_id,
        ${fileDate.toISOString()}::timestamp with time zone, ${fileDate.toISOString()}::timestamp with time zone
      FROM ${stagedPermits} AS staged
      WHERE staged.official_site_id IS NULL
      RETURNING id, site_id, operator_id, location_id
    )
    SELECT added.id AS "officialSiteId", min(staged.slice) AS slice
    FROM added
    JOIN ${stagedPermits} AS staged
      ON staged.site_code = added.site_id AND staged.operator_id = added.operator_id AND staged.location_id = added.location_id
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
        eq(officialPermits.rat, stagedPermits.rat),
        eq(officialPermits.label_mhz, stagedPermits.labelMhz),
        eq(officialPermits.label_variant, stagedPermits.labelVariant),
        eq(officialPermits.decision_number, stagedPermits.decisionNumber),
        eq(officialPermits.decision_type, stagedPermits.decisionType),
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
          createdAt: sql`${fileDate.toISOString()}::timestamp with time zone`.as("createdAt"),
          updatedAt: sql`${fileDate.toISOString()}::timestamp with time zone`.as("updatedAt"),
        })
        .from(stagedPermits)
        .where(isNull(stagedPermits.permitId)),
    )
    .returning({ id: officialPermits.id });
  return new Set(added.map((permit) => permit.id));
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

async function insertSectors(tx: DbTx): Promise<void> {
  await tx.execute(sql`
    INSERT INTO ${officialPermitSectors} (permit_id, azimuth, elevation, antenna_height, antenna_type)
    SELECT DISTINCT staged.permit_id, sector.azimuth, sector.elevation, sector.antenna_height, sector.antenna_type
    FROM ${stagedPermits} AS staged
    CROSS JOIN LATERAL (
      SELECT round(published.azimuth)::integer AS azimuth, round(published.elevation)::integer AS elevation,
        published.antenna_height, published.antenna_type
      FROM jsonb_to_recordset(staged.sectors)
        AS published (azimuth numeric, elevation numeric, antenna_height double precision, antenna_type antenna_type)
    ) AS sector
    WHERE NOT EXISTS (
      SELECT 1 FROM ${officialPermitSectors} AS stored
      WHERE stored.permit_id = staged.permit_id
        AND stored.azimuth IS NOT DISTINCT FROM sector.azimuth AND stored.elevation IS NOT DISTINCT FROM sector.elevation
        AND stored.antenna_height IS NOT DISTINCT FROM sector.antenna_height AND stored.antenna_type IS NOT DISTINCT FROM sector.antenna_type
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
      siteId: stagedPermits.siteCode,
      name: sql<string>`${stagedPermits.siteName}`,
    })
    .from(stagedPermits)
    .where(ne(stagedPermits.siteName, ""))
    .orderBy(stagedPermits.operatorId, stagedPermits.siteCode, stagedPermits.siteNameOrdinal);
}

async function resolveStagedSites(tx: DbTx, { scope, fileDate }: ReleaseInput): Promise<{ moves: SiteMove[]; added: AddedSite[] }> {
  const { sourceId } = scope.run;
  await matchLocations(tx, sourceId);
  await insertLocations(tx, sourceId);
  await matchLocations(tx, sourceId);

  await matchSites(tx);
  const moves = decideSiteMoves(await readMoveCandidates(tx, sourceId));
  await moveSites(tx, moves, fileDate);
  const added = await insertSites(tx, sourceId, fileDate);
  await matchSites(tx);
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

  const { moves, added } = await resolveStagedSites(tx, input);

  await matchPermits(tx);
  const addedPermitIds = await insertPermits(tx, fileDate);
  await matchPermits(tx);
  await analyzeFilledIds(tx, sql`permit_id`);

  await refreshListings(tx, datasetId);
  const listed = await insertListings(tx, datasetId);
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
