import {
  cellCopies,
  cellMatches,
  locations,
  lteCells,
  nrCells,
  observedCellSummaries,
  observedCells,
  observedSites,
  siteLinks,
  stations,
} from "@openbts/drizzle";
import { DEFAULT_GNBID_LENGTH } from "@openbts/shared/contract";
import { type SQL, and, eq, gte, inArray, isNull, notExists, or } from "drizzle-orm";

import { unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import { bboxCondition } from "../../../stations/read.js";
import { CELLS_PER_ENB, NCI_BITS, gnbidOf } from "../../cells/identity.js";
import { type ObservedSiteRecord, loadObservedSites } from "../../sites/read.js";
import type { Point } from "../../tiles/squares.js";
import { loadObservedCellValues } from "../cells/newCell.js";
import { latestConfirmedValue } from "../cells/sightings.js";
import { daysBefore } from "../dates.js";
import type { RaisedFlag } from "../kinds.js";
import { observedSiteSubject } from "../subjects.js";
import { isFlagSubject, metersBetween, shownPoint, siteMeasureOf } from "./flaggedSite.js";

const RENUMBERED_FIRST_SEEN_DAYS = 7;
const METERS_PER_DEGREE = 111_320;

export const RENUMBERED_WITHIN_M = 300;

export type MatchedCellOfOurs = { cellId: number; clid: number | null; channel: number | null; pci: number | null };
export type RenumberCandidate = { previous: ObservedSiteRecord; stationId: number; station: Point; cells: readonly MatchedCellOfOurs[] };
export type NewSiteCell = { observedCellId: number; cellKey: number; channel: number | null; pci: number | null };

function isSameOperator(previous: ObservedSiteRecord, site: ObservedSiteRecord): boolean {
  if (previous.operatorId !== null && site.operatorId !== null) return previous.operatorId === site.operatorId;
  return previous.plmn === site.plmn;
}

function pairAlike(ours: readonly MatchedCellOfOurs[], cells: readonly NewSiteCell[]) {
  const unused = [...cells];
  return ours.flatMap((cell) => {
    if (cell.channel === null || cell.pci === null) return [];
    const index = unused.findIndex((candidate) => candidate.channel === cell.channel && candidate.pci === cell.pci);
    if (index === -1) return [];
    const [alike] = unused.splice(index, 1);
    return alike === undefined ? [] : [{ ours: cell, observed: alike }];
  });
}

function newIdsOf(site: ObservedSiteRecord, ours: MatchedCellOfOurs, { cellKey }: NewSiteCell) {
  const clidOf = (clid: number) => (clid === ours.clid ? {} : { clid });
  const update = { action: "update" as const, id: ours.cellId };
  if (site.rat === "NR") {
    const length = site.gnbidLength ?? DEFAULT_GNBID_LENGTH;
    const gnbid = gnbidOf(cellKey, length);
    return { ...update, gnbid, ...clidOf(cellKey - gnbid * 2 ** (NCI_BITS - length)) };
  }
  return { ...update, enbid: Math.floor(cellKey / CELLS_PER_ENB), ...clidOf(cellKey % CELLS_PER_ENB) };
}

export function raiseRenumberedFlag(
  site: ObservedSiteRecord,
  cells: readonly NewSiteCell[],
  candidates: readonly RenumberCandidate[],
  { quietBefore }: { quietBefore: string },
): RaisedFlag<"renumbered"> | null {
  const point = shownPoint(site);
  const isNewSite = site.status === "unmatched" || site.status === "suggested";
  if (!isFlagSubject(site) || site.stationId !== null || (site.rat !== "LTE" && site.rat !== "NR") || !isNewSite) return null;
  if (!site.isConfirmed || point === null || site.firstSeenOn === null || site.estimate === null) return null;
  const firstSeenOn = site.firstSeenOn;
  const estimate = site.estimate;

  const found = candidates.flatMap((candidate) => {
    const { previous } = candidate;
    const lastSeenOn = previous.lastSeenOn;
    if (previous.id === site.id || previous.rat !== site.rat || !isSameOperator(previous, site)) return [];
    if (lastSeenOn === null || lastSeenOn >= quietBefore || firstSeenOn < daysBefore(lastSeenOn, RENUMBERED_FIRST_SEEN_DAYS)) return [];
    if (metersBetween(point, candidate.station) > Math.max(previous.estimate?.uncertaintyM ?? 0, RENUMBERED_WITHIN_M)) return [];

    const pairs = pairAlike(candidate.cells, cells);
    const known = candidate.cells.filter((cell) => cell.channel !== null && cell.pci !== null).length;
    const isOnlyCell = candidate.cells.length === 1 && pairs.length === 1;
    return (pairs.length >= 2 || isOnlyCell) && 2 * pairs.length >= known ? [{ candidate, pairs }] : [];
  });
  const [best] = found.toSorted((a, b) => b.pairs.length - a.pairs.length || a.candidate.previous.id - b.candidate.previous.id);
  if (best === undefined) return null;

  return {
    kind: "renumbered",
    subjectKey: observedSiteSubject(site),
    refs: { observedSiteId: site.id, stationId: best.candidate.stationId },
    evidence: { previousObservedSiteId: best.candidate.previous.id, alikeCellCount: best.pairs.length },
    suggestion: { cells: best.pairs.map(({ ours, observed }) => newIdsOf(site, ours, observed)) },
    measure: siteMeasureOf(site, estimate),
  };
}

function boxAround({ latitude, longitude }: Point, reachM: number): SQL {
  const latitudeSpan = reachM / METERS_PER_DEGREE;
  const longitudeSpan = reachM / (METERS_PER_DEGREE * Math.max(Math.cos((latitude * Math.PI) / 180), 0.01));
  return bboxCondition(locations.point, [longitude - longitudeSpan, latitude - latitudeSpan, longitude + longitudeSpan, latitude + latitudeSpan]);
}

async function loadOurMatchedCells(tx: DbTx, siteIds: readonly number[]): Promise<Map<number, MatchedCellOfOurs[]>> {
  if (siteIds.length === 0) return new Map();

  const rows = await tx
    .selectDistinct({
      observedSiteId: observedCells.observedSiteId,
      cellId: cellMatches.cellId,
      lteClid: lteCells.clid,
      earfcn: lteCells.earfcn,
      ltePci: lteCells.pci,
      nrClid: nrCells.clid,
      arfcn: nrCells.arfcn,
      nrPci: nrCells.pci,
    })
    .from(cellMatches)
    .innerJoin(observedCells, eq(observedCells.id, cellMatches.observedCellId))
    .leftJoin(lteCells, eq(lteCells.cell_id, cellMatches.cellId))
    .leftJoin(nrCells, eq(nrCells.cell_id, cellMatches.cellId))
    .where(and(inArray(observedCells.observedSiteId, [...siteIds]), eq(cellMatches.kind, "cell")));
  const ours = rows.flatMap(({ observedSiteId, cellId, lteClid, earfcn, ltePci, nrClid, arfcn, nrPci }) => {
    if (observedSiteId === null || cellId === null) return [];
    return [{ observedSiteId, cell: { cellId, clid: lteClid ?? nrClid, channel: earfcn ?? arfcn, pci: ltePci ?? nrPci } }];
  });
  return new Map([...Map.groupBy(ours, (row) => row.observedSiteId)].map(([siteId, matched]) => [siteId, matched.map(({ cell }) => cell)]));
}

export async function loadNewSiteCells(tx: DbTx, siteIds: readonly number[]): Promise<Map<number, NewSiteCell[]>> {
  if (siteIds.length === 0) return new Map();

  const own = await tx
    .select({ id: observedCells.id, cellKey: observedCells.cellKey, observedSiteId: observedCells.observedSiteId })
    .from(observedCells)
    .leftJoin(cellCopies, eq(cellCopies.observedCellId, observedCells.id))
    .where(and(inArray(observedCells.observedSiteId, [...siteIds]), isNull(cellCopies.observedCellId)));
  if (own.length === 0) return new Map();

  const values = await loadObservedCellValues(
    tx,
    own.map((cell) => cell.id),
  );
  const valuesByCell = Map.groupBy(values, (value) => value.observedCellId);
  const confirmed = (cellId: number, field: "channel" | "pci") =>
    latestConfirmedValue((valuesByCell.get(cellId) ?? []).filter((value) => value.field === field));
  const newCells = own.flatMap(({ id, cellKey, observedSiteId }) =>
    observedSiteId === null ? [] : [{ observedSiteId, observedCellId: id, cellKey, channel: confirmed(id, "channel"), pci: confirmed(id, "pci") }],
  );
  return Map.groupBy(newCells, (cell) => cell.observedSiteId);
}

export async function loadRenumberCandidates(
  tx: DbTx,
  newSites: readonly ObservedSiteRecord[],
  reachM: number,
  quietBefore: string,
): Promise<RenumberCandidate[]> {
  const points = newSites.flatMap((site) => shownPoint(site) ?? []);
  if (points.length === 0) return [];

  const seenLately = tx
    .select({ id: observedCells.id })
    .from(observedCells)
    .innerJoin(observedCellSummaries, eq(observedCellSummaries.observedCellId, observedCells.id))
    .where(and(eq(observedCells.observedSiteId, siteLinks.observedSiteId), gte(observedCellSummaries.lastSeenOn, quietBefore)));
  const links = await tx
    .select({
      observedSiteId: siteLinks.observedSiteId,
      stationId: siteLinks.stationId,
      latitude: locations.latitude,
      longitude: locations.longitude,
    })
    .from(siteLinks)
    .innerJoin(observedSites, eq(observedSites.id, siteLinks.observedSiteId))
    .innerJoin(stations, eq(stations.id, siteLinks.stationId))
    .innerJoin(locations, eq(locations.id, stations.location_id))
    .where(
      and(
        eq(siteLinks.kind, "matched"),
        inArray(observedSites.rat, ["LTE", "NR"]),
        isNull(observedSites.retiredAt),
        notExists(seenLately),
        or(...points.map((point) => boxAround(point, reachM))),
      ),
    );
  const [previousSites, ours] = await Promise.all([
    loadObservedSites(unique(links.map((link) => link.observedSiteId))),
    loadOurMatchedCells(tx, unique(links.map((link) => link.observedSiteId))),
  ]);
  const previousById = new Map(previousSites.map((site) => [site.id, site]));
  return links.flatMap(({ observedSiteId, stationId, latitude, longitude }): RenumberCandidate[] => {
    const previous = previousById.get(observedSiteId);
    return previous === undefined ? [] : [{ previous, stationId, station: { latitude, longitude }, cells: ours.get(observedSiteId) ?? [] }];
  });
}
