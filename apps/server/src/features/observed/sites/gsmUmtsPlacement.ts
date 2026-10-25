import { cellMatches, cells, observedCells, observedSites } from "@openbts/drizzle";
import { and, count, eq, inArray, isNotNull, isNull, notExists, or, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import { chunks, unique } from "../../../lib/collections.js";
import type { DbTx } from "../../../types/global.js";
import type { LockedCell } from "../cells/locks.js";
import { type CellMove, ROWS_PER_QUERY, moveCells, recordReplacements } from "./moves.js";

const siteIdentitySchema = createSelectSchema(observedSites).pick({ plmn: true, stationId: true, rat: true, nodeId: true });

type SiteIdentity = z.infer<typeof siteIdentitySchema>;
export type LteNrSite = { id: number; rat: SiteIdentity["rat"]; matchedCellCount: number };
type SiteChoice = { siteId: number } | { identity: SiteIdentity };

const isMadeByServer = or(isNotNull(observedSites.stationId), inArray(observedSites.rat, ["GSM", "UMTS", "NR"]));

export function isGsmUmtsCell(cell: Pick<LockedCell, "rat">): boolean {
  return cell.rat === "GSM" || cell.rat === "UMTS";
}

function stationNetworkKey(stationId: number, plmn: string): string {
  return `${stationId}/${plmn}`;
}

function identityKey({ plmn, stationId, rat, nodeId }: SiteIdentity): string {
  return `${plmn}/${stationId}/${rat}/${nodeId}`;
}

function byPreference(a: LteNrSite, b: LteNrSite): number {
  return Number(b.rat === "LTE") - Number(a.rat === "LTE") || b.matchedCellCount - a.matchedCellCount || a.id - b.id;
}

export function chooseSite(
  cell: Pick<LockedCell, "plmn" | "rat" | "cellKey">,
  matchedStationId: number | undefined,
  stationLteNrSites: readonly LteNrSite[],
): SiteChoice {
  if (matchedStationId === undefined) return { identity: { plmn: cell.plmn, stationId: null, rat: cell.rat, nodeId: cell.cellKey } };
  const [preferred] = stationLteNrSites.toSorted(byPreference);
  return preferred ? { siteId: preferred.id } : { identity: { plmn: cell.plmn, stationId: matchedStationId, rat: null, nodeId: null } };
}

export async function findGsmUmtsCellsOf(tx: DbTx, stationIds: readonly number[], siteIds: readonly number[]): Promise<number[]> {
  if (stationIds.length === 0 && siteIds.length === 0) return [];

  const isGsmUmts = inArray(observedCells.rat, ["GSM", "UMTS"]);
  const [matchedToStations, onSites] = await Promise.all([
    tx
      .select({ id: observedCells.id })
      .from(cellMatches)
      .innerJoin(cells, eq(cells.id, cellMatches.cellId))
      .innerJoin(observedCells, eq(observedCells.id, cellMatches.observedCellId))
      .where(and(inArray(cells.station_id, [...stationIds]), isGsmUmts)),
    tx
      .select({ id: observedCells.id })
      .from(observedCells)
      .where(and(inArray(observedCells.observedSiteId, [...siteIds]), isGsmUmts)),
  ]);
  return unique([...matchedToStations, ...onSites].map((cell) => cell.id));
}

async function findMatchedStationOfCells(tx: DbTx, locked: readonly LockedCell[]): Promise<Map<number, number>> {
  const cellIds = locked.map((cell) => cell.id);
  const matched = await Promise.all(
    chunks(cellIds, ROWS_PER_QUERY).map((ids) =>
      tx
        .select({ observedCellId: cellMatches.observedCellId, stationId: cells.station_id })
        .from(cellMatches)
        .innerJoin(cells, eq(cells.id, cellMatches.cellId))
        .where(inArray(cellMatches.observedCellId, ids)),
    ),
  );
  return new Map(matched.flat().map(({ observedCellId, stationId }) => [observedCellId, stationId]));
}

async function findLteNrSitesOfStations(tx: DbTx, stationIds: readonly number[], plmns: readonly string[]): Promise<Map<string, LteNrSite[]>> {
  const siteColumns = { id: observedSites.id, plmn: observedSites.plmn, rat: observedSites.rat, matchedCellCount: count() };
  const onLiveLteNrSite = and(inArray(observedCells.rat, ["LTE", "NR"]), inArray(observedSites.plmn, [...plmns]), isNull(observedSites.retiredAt));

  const sitesByStation = new Map<string, Map<number, LteNrSite>>();
  const found = await Promise.all(
    chunks(stationIds, ROWS_PER_QUERY).flatMap((ids) => [
      tx
        .select({ ...siteColumns, stationId: cells.station_id })
        .from(cells)
        .innerJoin(cellMatches, eq(cellMatches.cellId, cells.id))
        .innerJoin(observedCells, eq(observedCells.id, cellMatches.observedCellId))
        .innerJoin(observedSites, eq(observedSites.id, observedCells.observedSiteId))
        .where(and(inArray(cells.station_id, ids), onLiveLteNrSite))
        .groupBy(observedSites.id, cells.station_id),
      tx
        .select({ ...siteColumns, stationId: cellMatches.stationId })
        .from(cellMatches)
        .innerJoin(observedCells, eq(observedCells.id, cellMatches.observedCellId))
        .innerJoin(observedSites, eq(observedSites.id, observedCells.observedSiteId))
        .where(and(inArray(cellMatches.stationId, ids), onLiveLteNrSite))
        .groupBy(observedSites.id, cellMatches.stationId),
    ]),
  );
  for (const { id, plmn, rat, stationId, matchedCellCount } of found.flat()) {
    if (stationId === null) continue;
    const key = stationNetworkKey(stationId, plmn);
    const sites = sitesByStation.get(key) ?? new Map<number, LteNrSite>();
    sites.set(id, { id, rat, matchedCellCount: (sites.get(id)?.matchedCellCount ?? 0) + matchedCellCount });
    sitesByStation.set(key, sites);
  }
  return new Map([...sitesByStation].map(([key, sites]) => [key, [...sites.values()]]));
}

async function findSites(tx: DbTx, identities: readonly SiteIdentity[]): Promise<Map<string, number>> {
  const sites = await Promise.all(
    chunks(identities, ROWS_PER_QUERY).map((part) =>
      tx
        .select({
          id: observedSites.id,
          plmn: observedSites.plmn,
          stationId: observedSites.stationId,
          rat: observedSites.rat,
          nodeId: observedSites.nodeId,
        })
        .from(observedSites)
        .where(
          and(
            isNull(observedSites.retiredAt),
            inArray(observedSites.plmn, unique(part.map((identity) => identity.plmn))),
            or(
              inArray(observedSites.stationId, unique(part.map((identity) => identity.stationId))),
              and(
                inArray(observedSites.rat, unique(part.map((identity) => identity.rat))),
                inArray(observedSites.nodeId, unique(part.map((identity) => identity.nodeId))),
              ),
            ),
          ),
        ),
    ),
  );
  return new Map(sites.flat().map(({ id, ...identity }) => [identityKey(identity), id]));
}

async function findOrCreateSites(tx: DbTx, wanted: readonly SiteIdentity[]): Promise<Map<string, number>> {
  const identities = [...new Map(wanted.map((identity) => [identityKey(identity), identity])).values()];
  const found = await findSites(tx, identities);
  const missing = identities.filter((identity) => !found.has(identityKey(identity)));
  if (missing.length === 0) return found;

  // oxlint-disable-next-line no-await-in-loop
  for (const rows of chunks(missing, ROWS_PER_QUERY)) await tx.insert(observedSites).values(rows).onConflictDoNothing();
  return new Map([...found, ...(await findSites(tx, missing))]);
}

async function retireEmptiedSites(tx: DbTx, siteIds: readonly number[]): Promise<Set<number>> {
  const cellOfSite = tx.select({ id: observedCells.id }).from(observedCells).where(eq(observedCells.observedSiteId, observedSites.id));
  const retired = new Set<number>();
  for (const ids of chunks(siteIds, ROWS_PER_QUERY)) {
    // oxlint-disable-next-line no-await-in-loop
    const sites = await tx
      .update(observedSites)
      .set({ retiredAt: sql`now()` })
      .where(and(inArray(observedSites.id, ids), isMadeByServer, notExists(cellOfSite)))
      .returning({ id: observedSites.id });
    for (const { id } of sites) retired.add(id);
  }
  return retired;
}

export async function placeGsmUmtsCells(tx: DbTx, locked: readonly LockedCell[]): Promise<{ changedSiteIds: number[]; placedCells: LockedCell[] }> {
  const stationOfCell = await findMatchedStationOfCells(tx, locked);
  const lteNrSites = await findLteNrSitesOfStations(tx, unique([...stationOfCell.values()]), unique(locked.map((cell) => cell.plmn)));
  const choices = locked.map((cell) => {
    const stationId = stationOfCell.get(cell.id);
    const stationLteNrSites = stationId === undefined ? [] : (lteNrSites.get(stationNetworkKey(stationId, cell.plmn)) ?? []);
    return { cell, choice: chooseSite(cell, stationId, stationLteNrSites) };
  });
  const wantedSites = choices.flatMap(({ choice }) => ("identity" in choice ? [choice.identity] : []));
  const siteIdOf = await findOrCreateSites(tx, wantedSites);

  const moves = choices.flatMap(({ cell, choice }): CellMove[] => {
    const siteId = "siteId" in choice ? choice.siteId : siteIdOf.get(identityKey(choice.identity));
    if (siteId === undefined) throw new Error(`The site of observed cell ${cell.id} was neither created nor found`);
    return siteId === cell.observedSiteId ? [] : [{ cell, siteId }];
  });
  await moveCells(tx, moves);
  const retiredSiteIds = await retireEmptiedSites(tx, unique(moves.map((move) => move.cell.observedSiteId)));
  await recordReplacements(tx, moves, retiredSiteIds);
  return {
    changedSiteIds: unique(moves.flatMap(({ cell, siteId }) => [cell.observedSiteId, siteId])),
    placedCells: moves.map(({ cell, siteId }): LockedCell => ({ ...cell, observedSiteId: siteId })),
  };
}
