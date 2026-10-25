import {
  cellMatches,
  cellPlmns,
  cells,
  crowdSettings,
  locations,
  observedCells,
  observedSites,
  plmns,
  siteEstimates,
  siteLinks,
  stations,
} from "@openbts/drizzle";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import { unique } from "../../../lib/collections.js";
import type { DbTx } from "../../../types/global.js";
import { findNetworkOperators } from "../../analyzer/match.js";
import type { LockedCell } from "../cells/locks.js";
import { SETTINGS_ROW_ID } from "./select.js";

const siteLinkSelectSchema = createSelectSchema(siteLinks).pick({ observedSiteId: true, stationId: true, kind: true });

type SiteLinkRow = z.infer<typeof siteLinkSelectSchema>;

function stationWithMostCells(cellsByStation: ReadonlyMap<number, number>): number | undefined {
  const [best] = [...cellsByStation].toSorted(([stationA, cellsA], [stationB, cellsB]) => cellsB - cellsA || stationA - stationB);
  return best?.[0];
}

async function findMatchedStations(tx: DbTx, siteIds: readonly number[]): Promise<Map<number, number>> {
  const votes = await tx
    .select({
      siteId: observedCells.observedSiteId,
      siteRat: observedSites.rat,
      cellRat: observedCells.rat,
      matchedStationId: cellMatches.stationId,
      cellStationId: cells.station_id,
      cellCount: count(),
    })
    .from(cellMatches)
    .innerJoin(observedCells, eq(observedCells.id, cellMatches.observedCellId))
    .innerJoin(observedSites, eq(observedSites.id, observedCells.observedSiteId))
    .leftJoin(cells, eq(cells.id, cellMatches.cellId))
    .where(inArray(observedCells.observedSiteId, [...siteIds]))
    .groupBy(observedCells.observedSiteId, observedSites.rat, observedCells.rat, cellMatches.stationId, cells.station_id);

  const votesBySite = new Map<number, Map<number, number>>();
  for (const { siteId, siteRat, cellRat, matchedStationId, cellStationId, cellCount } of votes) {
    const stationId = matchedStationId ?? cellStationId;
    const castsVote = siteRat === null || siteRat === cellRat;
    if (siteId === null || stationId === null || !castsVote) continue;
    const cellsByStation = votesBySite.get(siteId) ?? new Map<number, number>();
    cellsByStation.set(stationId, (cellsByStation.get(stationId) ?? 0) + cellCount);
    votesBySite.set(siteId, cellsByStation);
  }
  return new Map(
    [...votesBySite].flatMap(([siteId, cellsByStation]) => {
      const stationId = stationWithMostCells(cellsByStation);
      return stationId === undefined ? [] : [[siteId, stationId] as const];
    }),
  );
}

export async function linkSites(tx: DbTx, siteIds: readonly number[]): Promise<void> {
  if (siteIds.length === 0) return;

  const [matchedStations, links] = await Promise.all([
    findMatchedStations(tx, siteIds),
    tx
      .select()
      .from(siteLinks)
      .where(inArray(siteLinks.observedSiteId, [...siteIds])),
  ]);
  const linkBySite = new Map(links.map((link) => [link.observedSiteId, link]));

  const unlinkedIds = links
    .filter((link) => link.linkedById === null && link.kind === "matched" && !matchedStations.has(link.observedSiteId))
    .map((link) => link.observedSiteId);
  const linked = [...matchedStations].flatMap(([observedSiteId, stationId]) => {
    const link = linkBySite.get(observedSiteId);
    const isKept = link !== undefined && (link.linkedById !== null || (link.kind === "matched" && link.stationId === stationId));
    return isKept ? [] : [{ observedSiteId, stationId, kind: "matched" as const }];
  });

  if (unlinkedIds.length > 0) await tx.delete(siteLinks).where(and(inArray(siteLinks.observedSiteId, unlinkedIds), isNull(siteLinks.linkedById)));
  await upsertSiteLinks(tx, linked);
}

async function upsertSiteLinks(tx: DbTx, links: SiteLinkRow[]): Promise<void> {
  if (links.length === 0) return;
  await tx
    .insert(siteLinks)
    .values(links)
    .onConflictDoUpdate({
      target: siteLinks.observedSiteId,
      set: { stationId: sql`excluded.station_id`, kind: sql`excluded.kind`, linkedAt: sql`now()` },
      setWhere: isNull(siteLinks.linkedById),
    });
}

function findNearbyStations(tx: DbTx, siteIds: readonly number[]) {
  return tx
    .select({
      siteId: siteEstimates.observedSiteId,
      stationId: stations.id,
      operatorId: stations.operator_id,
      distanceM: sql<number>`ST_Distance(${locations.point}::geography, ${siteEstimates.point}::geography)`.mapWith(Number),
    })
    .from(siteEstimates)
    .innerJoin(crowdSettings, and(eq(crowdSettings.id, SETTINGS_ROW_ID), eq(crowdSettings.publishedAlgorithmVersion, siteEstimates.algorithmVersion)))
    .innerJoin(
      locations,
      and(
        sql`${locations.point} && ST_Expand(${siteEstimates.point}, ${siteEstimates.uncertaintyM} / (111320.0 * cos(radians(ST_Y(${siteEstimates.point})))))`,
        sql`ST_DWithin(${locations.point}::geography, ${siteEstimates.point}::geography, ${siteEstimates.uncertaintyM})`,
      ),
    )
    .innerJoin(stations, eq(stations.location_id, locations.id))
    .where(inArray(siteEstimates.observedSiteId, [...siteIds]));
}

async function findBroadcasts(tx: DbTx, stationIds: readonly number[], codes: readonly string[]): Promise<Set<string>> {
  if (stationIds.length === 0) return new Set();
  const rows = await tx
    .selectDistinct({ stationId: cells.station_id, code: plmns.code })
    .from(cellPlmns)
    .innerJoin(cells, eq(cells.id, cellPlmns.cellId))
    .innerJoin(plmns, eq(plmns.id, cellPlmns.plmnId))
    .where(and(inArray(cells.station_id, [...stationIds]), inArray(plmns.code, [...codes])));
  return new Set(rows.map((row) => `${row.stationId}:${row.code}`));
}

export async function suggestStations(tx: DbTx, locked: readonly LockedCell[]): Promise<void> {
  const plmnOfSite = new Map(locked.flatMap((cell) => (cell.observedSiteId === null ? [] : [[cell.observedSiteId, cell.plmn] as const])));
  if (plmnOfSite.size === 0) return;

  const links = await tx
    .select()
    .from(siteLinks)
    .where(inArray(siteLinks.observedSiteId, [...plmnOfSite.keys()]));
  const decided = new Set(links.filter((link) => link.kind === "matched" || link.linkedById !== null).map((link) => link.observedSiteId));
  const open = [...plmnOfSite.keys()].filter((siteId) => !decided.has(siteId));
  if (open.length === 0) return;

  const codes = unique([...plmnOfSite.values()]);
  const [operatorsOf, nearby] = await Promise.all([findNetworkOperators(codes), findNearbyStations(tx, open)]);
  const broadcasts = await findBroadcasts(tx, unique(nearby.map((candidate) => candidate.stationId)), codes);
  const onTheNetwork = nearby.filter(({ siteId, stationId, operatorId }) => {
    const plmn = plmnOfSite.get(siteId) ?? "";
    const isOperatorsStation = operatorId !== null && (operatorsOf.get(plmn) ?? []).includes(operatorId);
    return isOperatorsStation || broadcasts.has(`${stationId}:${plmn}`);
  });
  const suggested = new Map<number, number>();
  for (const { siteId, stationId } of onTheNetwork.toSorted((a, b) => a.distanceM - b.distanceM || a.stationId - b.stationId)) {
    if (!suggested.has(siteId)) suggested.set(siteId, stationId);
  }

  const linkBySite = new Map(links.map((link) => [link.observedSiteId, link]));
  const withdrawn = open.filter((siteId) => linkBySite.get(siteId)?.kind === "suggested" && !suggested.has(siteId));
  const changed = [...suggested].flatMap(([observedSiteId, stationId]) =>
    linkBySite.get(observedSiteId)?.stationId === stationId ? [] : [{ observedSiteId, stationId, kind: "suggested" as const }],
  );
  if (withdrawn.length > 0) await tx.delete(siteLinks).where(and(inArray(siteLinks.observedSiteId, withdrawn), isNull(siteLinks.linkedById)));
  await upsertSiteLinks(tx, changed);
}
