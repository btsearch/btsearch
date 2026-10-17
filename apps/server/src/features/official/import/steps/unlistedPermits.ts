import { officialPermitListings, officialPermits, officialSites, stationsPermits } from "@openbts/drizzle";
import { and, asc, eq, gt, inArray, notExists } from "drizzle-orm";

import type { DbTx } from "../../../../types/global.js";
import { insertChanges } from "../changes.js";
import { STATEMENT_BATCH_SIZE } from "../config.js";
import type { AfterStep, AfterStepContext, ChangeInput, ClaimedRun } from "../types.js";

type UnlistedPermit = { permitId: number; officialSiteId: number };

async function readUnlistedPermits(tx: DbTx, sourceId: number, afterPermitId: number): Promise<UnlistedPermit[]> {
  return tx
    .select({ permitId: officialPermits.id, officialSiteId: officialPermits.official_site_id })
    .from(officialPermits)
    .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
    .where(
      and(
        eq(officialSites.source_id, sourceId),
        gt(officialPermits.id, afterPermitId),
        notExists(
          tx
            .select({ permitId: officialPermitListings.permitId })
            .from(officialPermitListings)
            .where(eq(officialPermitListings.permitId, officialPermits.id)),
        ),
      ),
    )
    .orderBy(officialPermits.id)
    .limit(STATEMENT_BATCH_SIZE);
}

async function archiveUnlistedPermits(tx: DbTx, run: ClaimedRun, afterPermitId: number): Promise<UnlistedPermit[]> {
  const unlisted = await readUnlistedPermits(tx, run.sourceId, afterPermitId);
  if (unlisted.length === 0) return unlisted;

  const permitIds = unlisted.map((permit) => permit.permitId);
  const links = await tx
    .select({ permitId: stationsPermits.permit_id, stationId: stationsPermits.station_id })
    .from(stationsPermits)
    .where(inArray(stationsPermits.permit_id, permitIds))
    .orderBy(asc(stationsPermits.permit_id), asc(stationsPermits.station_id));
  const linksByPermit = Map.groupBy(links, (link) => link.permitId);

  await insertChanges(
    tx,
    run.id,
    unlisted.flatMap(({ permitId, officialSiteId }): ChangeInput[] => [
      { kind: "permit_archived", officialSiteId, permitId },
      ...(linksByPermit.get(permitId) ?? []).map(({ stationId }): ChangeInput => ({ kind: "station_unlinked", permitId, stationId })),
    ]),
  );
  await tx.delete(officialPermits).where(inArray(officialPermits.id, permitIds));

  return unlisted;
}

async function perform(context: AfterStepContext): Promise<void> {
  let afterPermitId = 0;
  for (;;) {
    const after = afterPermitId;
    // eslint-disable-next-line no-await-in-loop
    const archived = await context.transaction((tx) => archiveUnlistedPermits(tx, context.run, after));
    const last = archived.at(-1);
    if (last === undefined || archived.length < STATEMENT_BATCH_SIZE) return;
    afterPermitId = last.permitId;
  }
}

export const unlistedPermits: AfterStep = { name: "unlisted_permits", runsInDryRun: true, perform };
