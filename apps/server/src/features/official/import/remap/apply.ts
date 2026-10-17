/* eslint-disable no-await-in-loop */
import {
  licensees,
  notifications,
  officialPermitListings,
  officialPermitSectors,
  officialPermits,
  officialSiteWatches,
  officialSites,
  stationsPermits,
  userLists,
} from "@openbts/drizzle";
import { eq, inArray, sql } from "drizzle-orm";

import { chunks } from "../../../../lib/collections.js";
import { idsIn } from "../../../../lib/conditions.js";
import type { DbTx } from "../../../../types/global.js";
import { insertChanges } from "../changes.js";
import { STATEMENT_BATCH_SIZE } from "../config.js";
import type { ChangeInput, ClaimedRun, RemapRun } from "../types.js";
import { type RemapCounts, type RemapPlan, placeOf, planRemap } from "./plan.js";
import { lockLicensee, readRemapInput, readRemapRun } from "./read.js";

type Move = RemapPlan["moves"][number];
type CreatedSite = { id: number; siteCode: string; locationId: number };
type Repointed = { watchesRepointed: number; notificationsRepointed: number; listsRepointed: number };
type Applied = { changes: ChangeInput[]; repointed: Repointed };

export type RemapReport = RemapCounts & Repointed;

async function rekeySites(tx: DbTx, siteIds: readonly number[], operatorId: number): Promise<void> {
  for (const group of chunks(siteIds, STATEMENT_BATCH_SIZE)) {
    await tx
      .update(officialSites)
      .set({ operator_id: operatorId })
      .where(sql`${officialSites.id} IN ${idsIn(group)}`);
  }
}

async function createSplitSites(
  tx: DbTx,
  splits: RemapPlan["splits"],
  operatorId: number,
  startedAt: Date,
): Promise<{ createdSiteIds: number[]; moves: Move[] }> {
  const created: CreatedSite[] = [];
  for (const group of chunks(splits, STATEMENT_BATCH_SIZE)) {
    created.push(
      ...(await tx
        .insert(officialSites)
        .select(
          tx
            .select({
              source_id: officialSites.source_id,
              station_id: officialSites.station_id,
              operator_id: sql`${operatorId}::integer`.as("operator_id"),
              location_id: officialSites.location_id,
              createdAt: sql`${startedAt.toISOString()}::timestamp with time zone`.as("createdAt"),
              updatedAt: sql`${startedAt.toISOString()}::timestamp with time zone`.as("updatedAt"),
            })
            .from(officialSites)
            .where(sql`${officialSites.id} IN ${idsIn(group.map((split) => split.fromSiteId))}`),
        )
        .returning({ id: officialSites.id, siteCode: officialSites.station_id, locationId: officialSites.location_id })),
    );
  }

  const createdIdByPlace = new Map(created.map((site) => [placeOf(site), site.id]));
  const moves = splits.flatMap((split) => {
    const toSiteId = createdIdByPlace.get(placeOf(split));
    if (toSiteId === undefined) throw new Error(`The site split off site ${split.fromSiteId} was not created`);
    return split.permitIds.map((permitId) => ({ permitId, toSiteId }));
  });
  return { createdSiteIds: created.map((site) => site.id), moves };
}

async function movePermits(tx: DbTx, moves: readonly Move[]): Promise<void> {
  for (const group of chunks(moves, STATEMENT_BATCH_SIZE)) {
    const moved = JSON.stringify(group.map(({ permitId, toSiteId }) => ({ permit_id: permitId, to_site_id: toSiteId })));
    await tx.execute(sql`
      UPDATE ${officialPermits} AS permit
      SET official_site_id = moved.to_site_id
      FROM jsonb_to_recordset(${moved}::jsonb) AS moved (permit_id integer, to_site_id integer)
      WHERE permit.id = moved.permit_id
    `);
  }
}

async function mergePermits(tx: DbTx, merges: RemapPlan["merges"]): Promise<ChangeInput[]> {
  const unlinked: ChangeInput[] = [];
  for (const group of chunks(merges, STATEMENT_BATCH_SIZE)) {
    const merged = JSON.stringify(group.map(({ permitId, intoPermitId }) => ({ permit_id: permitId, into_permit_id: intoPermitId })));
    const permitIds = group.map((merge) => merge.permitId);
    await tx.execute(sql`
      WITH taken AS (
        DELETE FROM ${officialPermitListings} AS listing
        USING jsonb_to_recordset(${merged}::jsonb) AS merged (permit_id integer, into_permit_id integer)
        WHERE listing.permit_id = merged.permit_id
        RETURNING merged.into_permit_id, listing.dataset_id, listing.slice, listing.licensee_id, listing.source_ref
      )
      INSERT INTO ${officialPermitListings} (permit_id, dataset_id, slice, licensee_id, source_ref)
      SELECT taken.into_permit_id, taken.dataset_id, taken.slice, taken.licensee_id, taken.source_ref
      FROM taken
      WHERE NOT EXISTS (
        SELECT 1 FROM ${officialPermitListings} AS kept
        WHERE kept.permit_id = taken.into_permit_id AND kept.dataset_id = taken.dataset_id
      )
    `);
    await tx.execute(sql`
      INSERT INTO ${officialPermitSectors} (permit_id, azimuth, elevation, antenna_height, antenna_type)
      SELECT DISTINCT merged.into_permit_id, sector.azimuth, sector.elevation, sector.antenna_height, sector.antenna_type
      FROM jsonb_to_recordset(${merged}::jsonb) AS merged (permit_id integer, into_permit_id integer)
      JOIN ${officialPermitSectors} AS sector ON sector.permit_id = merged.permit_id
      WHERE NOT EXISTS (
        SELECT 1 FROM ${officialPermitSectors} AS stored
        WHERE stored.permit_id = merged.into_permit_id
          AND stored.azimuth IS NOT DISTINCT FROM sector.azimuth AND stored.elevation IS NOT DISTINCT FROM sector.elevation
          AND stored.antenna_height IS NOT DISTINCT FROM sector.antenna_height AND stored.antenna_type IS NOT DISTINCT FROM sector.antenna_type
      )
    `);

    const links = await tx
      .select({ permitId: stationsPermits.permit_id, stationId: stationsPermits.station_id })
      .from(stationsPermits)
      .where(inArray(stationsPermits.permit_id, permitIds));
    unlinked.push(...links.map(({ permitId, stationId }): ChangeInput => ({ kind: "station_unlinked", permitId, stationId })));
    await tx.delete(officialPermits).where(inArray(officialPermits.id, permitIds));
  }

  return unlinked;
}

async function repointEmptiedSites(tx: DbTx, emptiedSites: RemapPlan["emptiedSites"]): Promise<Repointed> {
  const repointed: Repointed = { watchesRepointed: 0, notificationsRepointed: 0, listsRepointed: 0 };
  for (const group of chunks(emptiedSites, STATEMENT_BATCH_SIZE)) {
    const merged = JSON.stringify(group.map(({ siteId, intoSiteId }) => ({ site_id: siteId, into_site_id: intoSiteId })));
    const watches = await tx.execute(sql`
      UPDATE ${officialSiteWatches} AS watch
      SET official_site_id = merged.into_site_id
      FROM jsonb_to_recordset(${merged}::jsonb) AS merged (site_id integer, into_site_id integer)
      WHERE watch.official_site_id = merged.site_id AND NOT EXISTS (
        SELECT 1 FROM ${officialSiteWatches} AS kept
        WHERE kept.user_id = watch.user_id AND kept.official_site_id = merged.into_site_id
      )
      RETURNING watch.id
    `);
    const notices = await tx.execute(sql`
      UPDATE ${notifications} AS notice
      SET official_site_id = merged.into_site_id
      FROM jsonb_to_recordset(${merged}::jsonb) AS merged (site_id integer, into_site_id integer)
      WHERE notice.official_site_id = merged.site_id AND (notice."readAt" IS NOT NULL OR NOT EXISTS (
        SELECT 1 FROM ${notifications} AS kept
        WHERE kept.user_id = notice.user_id AND kept.official_site_id = merged.into_site_id AND kept.type = notice.type AND kept."readAt" IS NULL
      ))
      RETURNING notice.id
    `);
    const lists = await tx.execute(sql`
      WITH merged AS (
        SELECT pair.site_id, pair.into_site_id
        FROM jsonb_to_recordset(${merged}::jsonb) AS pair (site_id integer, into_site_id integer)
      ), repointed AS (
        SELECT saved_list.id,
          COALESCE(
            jsonb_agg(COALESCE(to_jsonb(merged.into_site_id), item."value") ORDER BY item."position")
              FILTER (WHERE merged.site_id IS NULL OR NOT (saved_list.stations -> 'official') @> to_jsonb(merged.into_site_id)),
            '[]'::jsonb
          ) AS ids
        FROM ${userLists} AS saved_list
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(saved_list.stations -> 'official') = 'array' THEN saved_list.stations -> 'official' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS item ("value", "position")
        LEFT JOIN merged ON item."value" = to_jsonb(merged.site_id)
        GROUP BY saved_list.id
        HAVING count(merged.site_id) > 0
      )
      UPDATE ${userLists} AS saved_list
      SET stations = jsonb_set(saved_list.stations, '{official}', repointed.ids)
      FROM repointed
      WHERE saved_list.id = repointed.id
      RETURNING saved_list.id
    `);
    const emptiedSiteIds = group.map((emptied) => emptied.siteId);
    await tx.delete(officialSites).where(inArray(officialSites.id, emptiedSiteIds));

    repointed.watchesRepointed += watches.length;
    repointed.notificationsRepointed += notices.length;
    repointed.listsRepointed += lists.length;
  }

  return repointed;
}

async function removeListings(tx: DbTx, licenseeId: number, unlistings: RemapPlan["unlistings"]): Promise<void> {
  for (const group of chunks(unlistings, STATEMENT_BATCH_SIZE)) {
    const removed = JSON.stringify(group.map(({ permitId, datasetId }) => ({ permit_id: permitId, dataset_id: datasetId })));
    await tx.execute(sql`
      DELETE FROM ${officialPermitListings} AS listing
      USING jsonb_to_recordset(${removed}::jsonb) AS removed (permit_id integer, dataset_id integer)
      WHERE listing.permit_id = removed.permit_id AND listing.dataset_id = removed.dataset_id AND listing.licensee_id = ${licenseeId}::integer
    `);
  }
}

async function touchSites(tx: DbTx, siteIds: readonly number[], startedAt: Date): Promise<void> {
  for (const group of chunks(siteIds, STATEMENT_BATCH_SIZE)) {
    await tx
      .update(officialSites)
      .set({ updatedAt: startedAt })
      .where(sql`${officialSites.id} IN ${idsIn(group)}`);
  }
}

async function mapLicensee(tx: DbTx, { licenseeId, toOperatorId }: RemapRun): Promise<void> {
  await tx
    .update(licensees)
    .set(toOperatorId === null ? { operatorId: null } : { operatorId: toOperatorId, brandId: null })
    .where(eq(licensees.id, licenseeId));
}

async function moveToOperator(tx: DbTx, plan: RemapPlan, operatorId: number, startedAt: Date): Promise<Applied> {
  await rekeySites(tx, plan.rekeyedSiteIds, operatorId);
  const split = await createSplitSites(tx, plan.splits, operatorId, startedAt);
  await movePermits(tx, [...plan.moves, ...split.moves]);
  const unlinked = await mergePermits(tx, plan.merges);
  const repointed = await repointEmptiedSites(tx, plan.emptiedSites);

  return {
    repointed,
    changes: [
      ...plan.remappedSiteIds.map((officialSiteId): ChangeInput => ({ kind: "site_remapped", officialSiteId })),
      ...split.createdSiteIds.flatMap((officialSiteId): ChangeInput[] => [
        { kind: "site_added", officialSiteId },
        { kind: "site_remapped", officialSiteId },
      ]),
      ...unlinked,
    ],
  };
}

async function unlist(tx: DbTx, plan: RemapPlan, licenseeId: number): Promise<Applied> {
  await removeListings(tx, licenseeId, plan.unlistings);

  return {
    repointed: { watchesRepointed: 0, notificationsRepointed: 0, listsRepointed: 0 },
    changes: plan.unlistings.map(({ permitId, officialSiteId }): ChangeInput => ({ kind: "permit_unlisted", officialSiteId, permitId })),
  };
}

export async function remapLicensee(tx: DbTx, run: ClaimedRun): Promise<RemapReport> {
  const remap = await readRemapRun(tx, run.id);
  const licensee = await lockLicensee(tx, remap.licenseeId);
  if (licensee.sourceId !== run.sourceId) throw new Error(`Licensee ${remap.licenseeId} belongs to another source`);
  if (licensee.operatorId !== remap.fromOperatorId && licensee.operatorId !== remap.toOperatorId) {
    throw new Error(`The operator of licensee ${remap.licenseeId} changed after this remap was queued`);
  }

  const plan = planRemap(await readRemapInput(tx, run.sourceId, remap));
  const { changes, repointed } =
    remap.toOperatorId === null ? await unlist(tx, plan, remap.licenseeId) : await moveToOperator(tx, plan, remap.toOperatorId, run.startedAt);
  await touchSites(tx, plan.touchedSiteIds, run.startedAt);
  await mapLicensee(tx, remap);
  await insertChanges(tx, run.id, changes);

  return { ...plan.counts, ...repointed };
}
