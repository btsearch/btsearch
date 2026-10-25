import { dirtySites, observedCells, siteIgnores, siteLinks, siteReplacements } from "@openbts/drizzle";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { chunks, unique } from "../../../lib/collections.js";
import type { DbTx } from "../../../types/global.js";
import type { LockedCell } from "../cells/locks.js";
import { passDismissalsToSuccessors } from "../flags/sites/flagMoves.js";

export const ROWS_PER_QUERY = 1000;

export type CellMove = { cell: LockedCell; siteId: number };
type Replacement = { observedSiteId: number; replacedBySiteId: number };

export async function moveCells(tx: DbTx, moves: readonly CellMove[]): Promise<void> {
  for (const part of chunks(moves, ROWS_PER_QUERY)) {
    const rows = sql.join(
      part.map(({ cell, siteId }) => sql`(${cell.id}::integer, ${siteId}::integer)`),
      sql`, `,
    );
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(observedCells)
      .set({ observedSiteId: sql`moves.site_id` })
      .from(sql`(VALUES ${rows}) AS moves (cell_id, site_id)`)
      .where(eq(observedCells.id, sql`moves.cell_id`));
  }
}

export async function recordReplacements(tx: DbTx, moves: readonly CellMove[], retiredSiteIds: ReadonlySet<number>): Promise<void> {
  const replacements = new Map<string, Replacement>();
  for (const { cell, siteId } of moves) {
    const { observedSiteId } = cell;
    if (observedSiteId === null || !retiredSiteIds.has(observedSiteId)) continue;
    replacements.set(`${observedSiteId}:${siteId}`, { observedSiteId, replacedBySiteId: siteId });
  }
  // oxlint-disable-next-line no-await-in-loop
  for (const rows of chunks([...replacements.values()], ROWS_PER_QUERY)) await tx.insert(siteReplacements).values(rows).onConflictDoNothing();
  await passIgnoresAndHandLinksToSuccessors(tx, [...replacements.values()]);
  await passDismissalsToSuccessors(tx, [...replacements.values()]);
}

async function passIgnoresAndHandLinksToSuccessors(tx: DbTx, replacements: readonly Replacement[]): Promise<void> {
  if (replacements.length === 0) return;

  const siteIds = unique(replacements.flatMap((replacement) => [replacement.observedSiteId, replacement.replacedBySiteId]));
  const [ignores, handLinks] = await Promise.all([
    tx.select().from(siteIgnores).where(inArray(siteIgnores.observedSiteId, siteIds)),
    tx
      .select()
      .from(siteLinks)
      .where(and(inArray(siteLinks.observedSiteId, siteIds), isNotNull(siteLinks.linkedById))),
  ]);
  const ignoreBySite = new Map(ignores.map((ignore) => [ignore.observedSiteId, ignore]));
  const linkBySite = new Map(handLinks.map((link) => [link.observedSiteId, link]));
  const isIgnoredOrLinkedByHand = (siteId: number) => ignoreBySite.has(siteId) || linkBySite.has(siteId);

  const predecessorBySuccessor = new Map<number, number>();
  for (const { observedSiteId, replacedBySiteId } of replacements.toSorted((a, b) => a.observedSiteId - b.observedSiteId)) {
    if (isIgnoredOrLinkedByHand(observedSiteId) && !isIgnoredOrLinkedByHand(replacedBySiteId) && !predecessorBySuccessor.has(replacedBySiteId)) {
      predecessorBySuccessor.set(replacedBySiteId, observedSiteId);
    }
  }
  const successors = [...predecessorBySuccessor];
  const passedIgnores = successors.flatMap(([successorId, predecessorId]) => {
    const ignore = ignoreBySite.get(predecessorId);
    return ignore === undefined ? [] : [{ ...ignore, observedSiteId: successorId }];
  });
  const passedLinks = successors.flatMap(([successorId, predecessorId]) => {
    const link = linkBySite.get(predecessorId);
    return link === undefined ? [] : [{ ...link, observedSiteId: successorId }];
  });

  if (passedIgnores.length > 0) await tx.insert(siteIgnores).values(passedIgnores).onConflictDoNothing();
  if (passedLinks.length > 0) {
    await tx
      .insert(siteLinks)
      .values(passedLinks)
      .onConflictDoUpdate({
        target: siteLinks.observedSiteId,
        set: {
          stationId: sql`excluded.station_id`,
          kind: sql`excluded.kind`,
          linkedById: sql`excluded.linked_by_id`,
          linkedAt: sql`excluded.linked_at`,
        },
      });
  }
}

export async function markSitesDirty(tx: DbTx, siteIds: readonly number[]): Promise<void> {
  const siteIdsInLockOrder = siteIds.toSorted((a, b) => a - b);
  for (const ids of chunks(siteIdsInLockOrder, ROWS_PER_QUERY)) {
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .insert(dirtySites)
      .values(ids.map((observedSiteId) => ({ observedSiteId })))
      .onConflictDoNothing();
  }
}
