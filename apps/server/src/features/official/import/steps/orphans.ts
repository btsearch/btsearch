import {
  licensees,
  microwaveLinkSnapshotCounts,
  microwaveLinks,
  officialLocations,
  officialPermitListings,
  officialPermits,
  officialRemapRuns,
  officialSites,
  userLists,
} from "@openbts/drizzle";
import { and, eq, isNull, notExists, sql } from "drizzle-orm";

import { unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import { logger } from "../../../../utils/logger.js";
import { readEveryChange } from "../changes.js";
import type { AfterStep, AfterStepContext, ChangeRow } from "../types.js";
import { retryingDeadlocks } from "./deadlocks.js";

function archivedMicrowaveLinkIdsOf(changes: readonly ChangeRow[]): number[] {
  return unique(changes.map((change) => (change.kind === "microwave_link_archived" ? change.microwaveLinkId : null)));
}

async function deleteSitesWithoutPermits(tx: DbTx, sourceId: number): Promise<number[]> {
  const deleted = await tx
    .delete(officialSites)
    .where(
      and(
        eq(officialSites.source_id, sourceId),
        notExists(tx.select({ id: officialPermits.id }).from(officialPermits).where(eq(officialPermits.official_site_id, officialSites.id))),
      ),
    )
    .returning({ id: officialSites.id });
  return deleted.map((site) => site.id);
}

async function deleteLocationsWithoutSites(tx: DbTx, sourceId: number): Promise<number> {
  const deleted = await tx
    .delete(officialLocations)
    .where(
      and(
        eq(officialLocations.source_id, sourceId),
        notExists(tx.select({ id: officialSites.id }).from(officialSites).where(eq(officialSites.location_id, officialLocations.id))),
      ),
    )
    .returning({ id: officialLocations.id });
  return deleted.length;
}

async function deleteUnmappedLicenseesWithoutReferences(tx: DbTx, sourceId: number): Promise<number> {
  const deleted = await tx
    .delete(licensees)
    .where(
      and(
        eq(licensees.sourceId, sourceId),
        isNull(licensees.operatorId),
        notExists(tx.select({ id: microwaveLinks.id }).from(microwaveLinks).where(eq(microwaveLinks.operator_id, licensees.id))),
        notExists(
          tx
            .select({ permitId: officialPermitListings.permitId })
            .from(officialPermitListings)
            .where(eq(officialPermitListings.licenseeId, licensees.id)),
        ),
        notExists(tx.select({ runId: officialRemapRuns.runId }).from(officialRemapRuns).where(eq(officialRemapRuns.licenseeId, licensees.id))),
        notExists(
          tx
            .select({ snapshotId: microwaveLinkSnapshotCounts.snapshotId })
            .from(microwaveLinkSnapshotCounts)
            .where(eq(microwaveLinkSnapshotCounts.licenseeId, licensees.id)),
        ),
      ),
    )
    .returning({ id: licensees.id });
  return deleted.length;
}

async function removeSitesFromLists(tx: DbTx, officialSiteIds: readonly number[]): Promise<void> {
  if (officialSiteIds.length === 0) return;

  await tx.execute(sql`
    WITH gone AS (
      SELECT item."value"::integer AS id
      FROM jsonb_array_elements_text(${JSON.stringify(officialSiteIds)}::jsonb) AS item ("value")
    ), held AS (
      SELECT saved_list.id AS list_id, item."position", item."value",
        CASE WHEN jsonb_typeof(item."value") = 'number' THEN item."value"::numeric END AS held_id
      FROM ${userLists} AS saved_list
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(saved_list.stations -> 'official') = 'array' THEN saved_list.stations -> 'official' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS item ("value", "position")
    ), kept AS (
      SELECT held.list_id, COALESCE(jsonb_agg(held."value" ORDER BY held."position") FILTER (WHERE gone.id IS NULL), '[]'::jsonb) AS ids
      FROM held
      LEFT JOIN gone ON gone.id = held.held_id
      GROUP BY held.list_id
      HAVING count(gone.id) > 0
    )
    UPDATE ${userLists} AS saved_list
    SET stations = jsonb_set(saved_list.stations, '{official}', kept.ids)
    FROM kept
    WHERE saved_list.id = kept.list_id
  `);
}

async function removeMicrowaveLinksFromLists(tx: DbTx, microwaveLinkIds: readonly number[]): Promise<void> {
  if (microwaveLinkIds.length === 0) return;

  await tx.execute(sql`
    WITH gone AS (
      SELECT item."value"::integer AS id
      FROM jsonb_array_elements_text(${JSON.stringify(microwaveLinkIds)}::jsonb) AS item ("value")
    ), held AS (
      SELECT saved_list.id AS list_id, item."position", item."value",
        CASE WHEN jsonb_typeof(item."value") = 'number' THEN item."value"::numeric END AS held_id
      FROM ${userLists} AS saved_list
      CROSS JOIN LATERAL jsonb_array_elements(saved_list.radiolines) WITH ORDINALITY AS item ("value", "position")
    ), kept AS (
      SELECT held.list_id, COALESCE(jsonb_agg(held."value" ORDER BY held."position") FILTER (WHERE gone.id IS NULL), '[]'::jsonb) AS ids
      FROM held
      LEFT JOIN gone ON gone.id = held.held_id
      GROUP BY held.list_id
      HAVING count(gone.id) > 0
    )
    UPDATE ${userLists} AS saved_list
    SET radiolines = kept.ids
    FROM kept
    WHERE saved_list.id = kept.list_id
  `);
}

async function perform(context: AfterStepContext): Promise<void> {
  const { run } = context;

  const removed = await retryingDeadlocks(() =>
    context.transaction(async (tx) => {
      const deletedSiteIds = await deleteSitesWithoutPermits(tx, run.sourceId);
      const deletedLocationCount = await deleteLocationsWithoutSites(tx, run.sourceId);
      const deletedLicenseeCount = await deleteUnmappedLicenseesWithoutReferences(tx, run.sourceId);
      const archivedMicrowaveLinkIds = archivedMicrowaveLinkIdsOf(await readEveryChange(tx, run.id, ["microwave_link_archived"]));
      await removeSitesFromLists(tx, deletedSiteIds);
      await removeMicrowaveLinksFromLists(tx, archivedMicrowaveLinkIds);
      await context.markFinished(tx);

      return {
        sites: deletedSiteIds.length,
        locations: deletedLocationCount,
        licensees: deletedLicenseeCount,
        microwaveLinks: archivedMicrowaveLinkIds.length,
      };
    }),
  );
  logger.info("official.import.orphans", { runId: run.id, ...removed });
}

export const orphans: AfterStep = { name: "orphans", runsInDryRun: false, perform };
