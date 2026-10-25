/* oxlint-disable no-await-in-loop */
import { cellMatches, matchQueue, observedCellValues, observedCells } from "@openbts/drizzle";
import { CELL_MATCH_LIMIT, CID_RANGE } from "@openbts/shared/contract";
import type { CellMatchResult, ObservedCell } from "@openbts/shared/contract";
import { and, asc, eq, gt, inArray, isNull, notExists, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import db from "../../../database/psql.js";
import { unique } from "../../../lib/collections.js";
import type { DbTx } from "../../../types/global.js";
import { logger } from "../../../utils/logger.js";
import { type SystemCellMatch, matchCellsAsSystem } from "../../analyzer/match.js";
import { passEditedCells, passFlagsOfGoneObservations, runCellPass } from "../flags/cells/pass.js";
import { passSiteFlags } from "../flags/sites/pass.js";
import { findGsmUmtsCellsOf, isGsmUmtsCell, placeGsmUmtsCells } from "../sites/gsmUmtsPlacement.js";
import { linkSites, suggestStations } from "../sites/links.js";
import { markSitesDirty } from "../sites/moves.js";
import { giveNrCellsSites, recutNrSites } from "../sites/nrPlacement.js";
import { linkOfficialSites } from "../sites/officialLinks.js";
import { summarizeCuratedCells } from "./curatedSummaries.js";
import { CELLS_PER_ENB, MATCHED_FIELDS, type MatchedField, isMatchedField } from "./identity.js";
import { type LockedCell, lockMatcher, lockObservedCells } from "./locks.js";

const FULL_PASS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FULL_PASS_BATCHES_PER_RUN = 20;

const cellMatchSelectSchema = createSelectSchema(cellMatches);

type CellMatchRow = Omit<z.infer<typeof cellMatchSelectSchema>, "matchedAt">;
type CurrentValues = Partial<Record<MatchedField, number>>;
type BatchResult = { changedCount: number; observedSiteIds: number[] };
type MatchedBatch = BatchResult & {
  curatedCellIds: number[];
  gsmUmtsCellIds: number[];
  changedLteNrStationIds: number[];
  changedLteNrSiteIds: number[];
};

let fullPassAfterId: number | null = 0;
let fullPassStartedAt = Date.now();

export async function matchObservedCells(): Promise<void> {
  if (fullPassAfterId === null && Date.now() - fullPassStartedAt >= FULL_PASS_INTERVAL_MS) {
    fullPassAfterId = 0;
    fullPassStartedAt = Date.now();
  }
  if (fullPassAfterId === 0) await recutNrSites();
  await giveNrCellsSites();
  await giveGsmUmtsCellsSites();

  const queued = await matchQueuedCells();
  let { changed } = queued;
  const touchedSiteIds = [...queued.siteIds];
  if (fullPassAfterId !== null) {
    const pass = await continueFullPass(fullPassAfterId);
    fullPassAfterId = pass.nextAfterId;
    changed += pass.changed;
    touchedSiteIds.push(...pass.siteIds);
  }
  if (changed > 0) logger.info("observations.cells.matched", { changed });
  await passEditedCells();
  await passFlagsOfGoneObservations();
  await passSiteFlags(touchedSiteIds);
}

async function matchQueuedCells(): Promise<{ changed: number; siteIds: number[] }> {
  let changed = 0;
  const siteIds: number[] = [];
  let queued: number[];
  do {
    const rows = await db.select({ id: matchQueue.observedCellId }).from(matchQueue).orderBy(asc(matchQueue.queuedAt)).limit(CELL_MATCH_LIMIT);
    queued = rows.map((row) => row.id);
    if (queued.length > 0) {
      const batch = await matchBatch(queued, { isFullPass: false });
      changed += batch.changedCount;
      siteIds.push(...batch.observedSiteIds);
    }
  } while (queued.length === CELL_MATCH_LIMIT);
  return { changed, siteIds };
}

async function continueFullPass(afterId: number): Promise<{ nextAfterId: number | null; changed: number; siteIds: number[] }> {
  let changed = 0;
  const siteIds: number[] = [];
  let cursor = afterId;
  for (let batch = 0; batch < FULL_PASS_BATCHES_PER_RUN; batch++) {
    const rows = await db
      .select({ id: observedCells.id })
      .from(observedCells)
      .where(gt(observedCells.id, cursor))
      .orderBy(asc(observedCells.id))
      .limit(CELL_MATCH_LIMIT);
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      const matched = await matchBatch(ids, { isFullPass: true });
      changed += matched.changedCount;
      siteIds.push(...matched.observedSiteIds);
    }
    const last = rows.at(-1);
    if (last === undefined || rows.length < CELL_MATCH_LIMIT) return { nextAfterId: null, changed, siteIds };
    cursor = last.id;
  }
  return { nextAfterId: cursor, changed, siteIds };
}

export async function matchCellsNow(observedCellIds: readonly number[]): Promise<void> {
  await matchBatch(observedCellIds, { isFullPass: true });
}

async function matchBatch(observedCellIds: readonly number[], { isFullPass }: { isFullPass: boolean }): Promise<BatchResult> {
  const matched = await db.transaction(async (tx): Promise<MatchedBatch | null> => {
    await lockMatcher(tx);
    const locked = await lockObservedCells(tx, observedCellIds, "key share");
    if (locked.length === 0) return null;
    const lockedIds = locked.map((cell) => cell.id);
    await tx.delete(matchQueue).where(inArray(matchQueue.observedCellId, lockedIds));

    const matches = await matchLockedCells(tx, locked);
    const saved = await saveCellMatches(tx, locked, matches);
    await linkSites(tx, isFullPass ? unique(locked.map((cell) => cell.observedSiteId)) : saved.changedSiteIds);
    await suggestStations(tx, locked);
    await linkOfficialSites(tx, locked, matches);
    await summarizeCuratedCells(tx, saved.curatedCellIds);
    await markSitesDirty(tx, saved.changedSiteIds);

    const changedLteNrCells = saved.changedCells.filter((cell) => cell.rat === "LTE" || cell.rat === "NR");
    return {
      changedCount: saved.changedCells.length,
      observedSiteIds: unique(locked.map((cell) => cell.observedSiteId)),
      curatedCellIds: saved.curatedCellIds,
      gsmUmtsCellIds: locked.filter(isGsmUmtsCell).map((cell) => cell.id),
      changedLteNrStationIds: unique(changedLteNrCells.map((cell) => matches.get(cell.id)?.result.stationId)),
      changedLteNrSiteIds: unique(changedLteNrCells.map((cell) => cell.observedSiteId)),
    };
  });
  if (matched === null) return { changedCount: 0, observedSiteIds: [] };

  await db.transaction(async (tx) => {
    await lockMatcher(tx);
    const cellIdsToPlaceAgain = await findGsmUmtsCellsOf(tx, matched.changedLteNrStationIds, matched.changedLteNrSiteIds);
    await placeGsmUmtsCellsAndLinkSites(tx, unique([...matched.gsmUmtsCellIds, ...cellIdsToPlaceAgain]));
  });
  await runCellPass({ cellIds: matched.curatedCellIds, observedSiteIds: matched.observedSiteIds });
  return matched;
}

async function loadCurrentValues(tx: DbTx, observedCellIds: readonly number[]): Promise<Map<number, CurrentValues>> {
  const rows = await tx
    .select({ observedCellId: observedCellValues.observedCellId, field: observedCellValues.field, value: observedCellValues.value })
    .from(observedCellValues)
    .where(
      and(
        inArray(observedCellValues.observedCellId, [...observedCellIds]),
        inArray(observedCellValues.field, [...MATCHED_FIELDS]),
        eq(observedCellValues.isCurrent, true),
      ),
    );

  const values = new Map<number, CurrentValues>();
  for (const { observedCellId, field, value } of rows) {
    if (isMatchedField(field)) values.set(observedCellId, { ...values.get(observedCellId), [field]: value });
  }
  return values;
}

function toObservedCell({ plmn, rat, cellKey }: LockedCell, values: CurrentValues): ObservedCell | null {
  const { areaCode, pci, channel } = values;
  switch (rat) {
    case "GSM":
      return { rat: "gsm", plmn, lac: Math.floor(cellKey / CID_RANGE), cid: cellKey % CID_RANGE, bsic: pci };
    case "UMTS":
      if (areaCode === undefined) return null;
      return { rat: "umts", plmn, lac: areaCode, cid: cellKey % CID_RANGE, rnc: Math.floor(cellKey / CID_RANGE), psc: pci, uarfcn: channel };
    case "LTE":
      return { rat: "lte", plmn, enbid: Math.floor(cellKey / CELLS_PER_ENB), clid: cellKey % CELLS_PER_ENB, tac: areaCode, pci, earfcn: channel };
    case "NR":
      return { rat: "nr", plmn, nci: cellKey, tac: areaCode, pci, arfcn: channel };
    default:
      return null;
  }
}

async function matchLockedCells(tx: DbTx, locked: readonly LockedCell[]): Promise<Map<number, SystemCellMatch>> {
  const lockedIds = locked.map((cell) => cell.id);
  const values = await loadCurrentValues(tx, lockedIds);
  const comparable = locked.flatMap((cell) => {
    const observed = toObservedCell(cell, values.get(cell.id) ?? {});
    return observed ? [{ cell, observed }] : [];
  });
  const answers = await matchCellsAsSystem(comparable.map(({ observed }) => observed));
  return new Map(
    comparable.flatMap(({ cell }, index) => {
      const answer = answers[index];
      return answer ? [[cell.id, answer] as const] : [];
    }),
  );
}

async function giveGsmUmtsCellsSites(): Promise<void> {
  const isQueued = db.select({ id: matchQueue.observedCellId }).from(matchQueue).where(eq(matchQueue.observedCellId, observedCells.id));
  let afterId = 0;
  let orphaned: number[];
  do {
    const rows = await db
      .select({ id: observedCells.id })
      .from(observedCells)
      .where(
        and(inArray(observedCells.rat, ["GSM", "UMTS"]), isNull(observedCells.observedSiteId), gt(observedCells.id, afterId), notExists(isQueued)),
      )
      .orderBy(asc(observedCells.id))
      .limit(CELL_MATCH_LIMIT);
    orphaned = rows.map((row) => row.id);
    if (orphaned.length > 0) {
      await db.transaction(async (tx) => {
        await lockMatcher(tx);
        await placeGsmUmtsCellsAndLinkSites(tx, orphaned);
      });
    }
    afterId = orphaned.at(-1) ?? afterId;
  } while (orphaned.length === CELL_MATCH_LIMIT);
}

async function placeGsmUmtsCellsAndLinkSites(tx: DbTx, cellIds: readonly number[]): Promise<void> {
  if (cellIds.length === 0) return;

  const placed = await placeGsmUmtsCells(tx, await lockObservedCells(tx, cellIds, "no key update"));
  await linkSites(tx, placed.changedSiteIds);
  await suggestStations(tx, placed.placedCells);
  await markSitesDirty(tx, placed.changedSiteIds);
}

function toMatchRow(observedCellId: number, result: CellMatchResult): CellMatchRow | null {
  if (result.match === "none" || result.networkMatch === null || result.stationId === null) return null;
  const isStationMatch = result.match === "station";
  return {
    observedCellId,
    kind: result.match,
    networkMatch: result.networkMatch,
    cellId: isStationMatch ? null : result.cellId,
    stationId: isStationMatch ? result.stationId : null,
  };
}

function isSameMatch(stored: CellMatchRow | undefined, row: CellMatchRow): boolean {
  if (stored === undefined) return false;
  return stored.kind === row.kind && stored.networkMatch === row.networkMatch && stored.cellId === row.cellId && stored.stationId === row.stationId;
}

async function saveCellMatches(tx: DbTx, locked: readonly LockedCell[], matches: ReadonlyMap<number, SystemCellMatch>) {
  const lockedIds = locked.map((cell) => cell.id);
  const stored = await tx.select().from(cellMatches).where(inArray(cellMatches.observedCellId, lockedIds));
  const storedById = new Map(stored.map((row) => [row.observedCellId, row]));
  const rows = locked.flatMap((cell) => {
    const match = matches.get(cell.id);
    const row = match ? toMatchRow(cell.id, match.result) : null;
    return row ? [row] : [];
  });
  const matchedIds = new Set(rows.map((row) => row.observedCellId));

  const removedIds = stored.filter((row) => !matchedIds.has(row.observedCellId)).map((row) => row.observedCellId);
  const changedRows = rows.filter((row) => !isSameMatch(storedById.get(row.observedCellId), row));
  if (removedIds.length > 0) await tx.delete(cellMatches).where(inArray(cellMatches.observedCellId, removedIds));
  if (changedRows.length > 0) {
    await tx
      .insert(cellMatches)
      .values(changedRows)
      .onConflictDoUpdate({
        target: cellMatches.observedCellId,
        set: {
          kind: sql`excluded.kind`,
          networkMatch: sql`excluded.network_match`,
          cellId: sql`excluded.cell_id`,
          stationId: sql`excluded.station_id`,
          matchedAt: sql`now()`,
        },
      });
  }

  const changedIds = new Set([...removedIds, ...changedRows.map((row) => row.observedCellId)]);
  const changedCells = locked.filter((cell) => changedIds.has(cell.id));
  return {
    changedCells,
    changedSiteIds: unique(changedCells.map((cell) => cell.observedSiteId)),
    curatedCellIds: unique([...stored, ...rows].map((row) => row.cellId)),
  };
}
