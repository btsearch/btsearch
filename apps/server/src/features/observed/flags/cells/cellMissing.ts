import {
  cellConfirmations,
  cellCopies,
  cellMatches,
  cells,
  observationFlags,
  observedCellSummaries,
  observedCells,
  siteLinks,
} from "@openbts/drizzle";
import type { CellNetworkMatch } from "@openbts/shared/contract";
import { and, eq, inArray } from "drizzle-orm";

import { unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import { findGnbidLengths } from "../../../analyzer/match.js";
import { loadOwnerCodes } from "../../../cells/networks.js";
import { loadKnownPlmns } from "../../../cells/networkWrites.js";
import { stationCountries } from "../../../stations/country.js";
import { loadBandPlans } from "../../bandPlans.js";
import { withCodeVariants } from "../../networks.js";
import type { RaisedFlag } from "../kinds.js";
import { observedCellSubject } from "../subjects.js";
import { type FlagSyncCounts, NOTHING_SYNCED, flagsIn, syncFlags } from "../sync.js";
import {
  type NewCellContext,
  type NewCellSource,
  type NewCellStation,
  buildNewCell,
  loadListedNetworksByObservedCellId,
  loadObservedCellValues,
} from "./newCell.js";

export type SiteCell = {
  id: number;
  plmn: string;
  rat: NewCellSource["rat"];
  cellKey: number;
  observedSiteId: number | null;
  stationId: number | null;
  countryCode: string | null;
  isConfirmed: boolean;
  isCopy: boolean;
  matchedCellId: number | null;
  networkMatch: CellNetworkMatch | null;
  samples: number | null;
  people: number | null;
  lastSeenOn: string | null;
};
export type MissingCell = SiteCell & { stationId: number; samples: number; people: number; lastSeenOn: string };
export type MissingCellInput = {
  cells: readonly MissingCell[];
  values: NewCellSource["values"];
  listedNetworks: NewCellSource["listedNetworks"];
  stations: ReadonlyMap<number, NewCellStation>;
  context: NewCellContext;
};

export function siteStationKey(observedSiteId: number | null, stationId: number): string {
  return `${observedSiteId}:${stationId}`;
}

export function findMissingCells(siteCells: readonly SiteCell[], ownMatchedSites: ReadonlySet<string>, seenSince: string): MissingCell[] {
  return siteCells.flatMap((cell) => {
    const { stationId, samples, people, lastSeenOn } = cell;
    if (stationId === null || samples === null || people === null || lastSeenOn === null || lastSeenOn < seenSince) return [];

    const isLteOrNr = cell.rat === "LTE" || cell.rat === "NR";
    const isUnmatchedPrimary = cell.isConfirmed && !cell.isCopy && cell.matchedCellId === null && cell.networkMatch !== "partner";
    const isOnOwnSite = ownMatchedSites.has(siteStationKey(cell.observedSiteId, stationId));
    return isLteOrNr && isUnmatchedPrimary && isOnOwnSite ? [{ ...cell, stationId, samples, people, lastSeenOn }] : [];
  });
}

export function raiseMissingCellFlags({ cells: missing, values, listedNetworks, stations, context }: MissingCellInput): RaisedFlag<"cellMissing">[] {
  const valuesByCell = Map.groupBy(values, (value) => value.observedCellId);
  const listedByCell = Map.groupBy(listedNetworks, (row) => row.observedCellId);
  return missing.flatMap((cell): RaisedFlag<"cellMissing">[] => {
    const station = stations.get(cell.stationId);
    const source = { ...cell, values: valuesByCell.get(cell.id) ?? [], listedNetworks: listedByCell.get(cell.id) ?? [] };
    const newCell = station === undefined ? null : buildNewCell(source, station, context);
    if (newCell === null) return [];
    return [
      {
        kind: "cellMissing",
        subjectKey: observedCellSubject(cell),
        refs: { observedCellId: cell.id, observedSiteId: cell.observedSiteId, stationId: cell.stationId },
        evidence: { samples: cell.samples, people: cell.people, lastSeenOn: cell.lastSeenOn },
        suggestion: { cells: [{ action: "create", ...newCell }] },
        measure: { people: cell.people },
      },
    ];
  });
}

async function loadSiteCells(tx: DbTx, observedSiteIds: readonly number[]): Promise<SiteCell[]> {
  const rows = await tx
    .select({
      id: observedCells.id,
      plmn: observedCells.plmn,
      rat: observedCells.rat,
      cellKey: observedCells.cellKey,
      observedSiteId: observedCells.observedSiteId,
      stationId: siteLinks.stationId,
      countryCode: stationCountries.countryCode,
      confirmedAt: cellConfirmations.confirmedAt,
      primaryCellId: cellCopies.primaryCellId,
      matchedCellId: cellMatches.cellId,
      networkMatch: cellMatches.networkMatch,
      samples: observedCellSummaries.sampleCount,
      people: observedCellSummaries.personCount,
      lastSeenOn: observedCellSummaries.lastSeenOn,
    })
    .from(observedCells)
    .leftJoin(siteLinks, and(eq(siteLinks.observedSiteId, observedCells.observedSiteId), eq(siteLinks.kind, "matched")))
    .leftJoin(stationCountries.table, eq(stationCountries.stationId, siteLinks.stationId))
    .leftJoin(cellConfirmations, eq(cellConfirmations.observedCellId, observedCells.id))
    .leftJoin(cellCopies, eq(cellCopies.observedCellId, observedCells.id))
    .leftJoin(cellMatches, eq(cellMatches.observedCellId, observedCells.id))
    .leftJoin(observedCellSummaries, eq(observedCellSummaries.observedCellId, observedCells.id))
    .where(and(inArray(observedCells.observedSiteId, [...observedSiteIds]), inArray(observedCells.rat, ["LTE", "NR"])));
  return rows.map(({ confirmedAt, primaryCellId, ...row }) => ({ ...row, isConfirmed: confirmedAt !== null, isCopy: primaryCellId !== null }));
}

async function loadOwnMatchedSites(tx: DbTx, observedSiteIds: readonly number[]): Promise<Set<string>> {
  const rows = await tx
    .selectDistinct({ observedSiteId: observedCells.observedSiteId, matchedStationId: cellMatches.stationId, cellStationId: cells.station_id })
    .from(cellMatches)
    .innerJoin(observedCells, eq(observedCells.id, cellMatches.observedCellId))
    .leftJoin(cells, eq(cells.id, cellMatches.cellId))
    .where(and(inArray(observedCells.observedSiteId, [...observedSiteIds]), inArray(cellMatches.networkMatch, ["own", "extraCode"])));
  return new Set(
    rows.flatMap(({ observedSiteId, matchedStationId, cellStationId }) => {
      const stationId = matchedStationId ?? cellStationId;
      return stationId === null ? [] : [siteStationKey(observedSiteId, stationId)];
    }),
  );
}

async function loadMissingCellInput(tx: DbTx, missing: readonly MissingCell[]): Promise<MissingCellInput> {
  const observedCellIds = missing.map((cell) => cell.id);
  const stationIds = unique(missing.map((cell) => cell.stationId));
  const nrCodes = unique(missing.filter((cell) => cell.rat === "NR").map((cell) => cell.plmn));
  const [values, listedNetworks, ownerCodes, plans, gnbidLengths] = await Promise.all([
    loadObservedCellValues(tx, observedCellIds),
    loadListedNetworksByObservedCellId(tx, observedCellIds),
    loadOwnerCodes(stationIds),
    loadBandPlans(unique(missing.map((cell) => cell.countryCode))),
    nrCodes.length > 0 ? findGnbidLengths(nrCodes) : new Map<string, number>(),
  ]);
  const known = await loadKnownPlmns(tx, withCodeVariants([...missing.map((cell) => cell.plmn), ...listedNetworks.map((row) => row.plmn)]));

  const stations = new Map(
    missing.map(({ stationId, countryCode }): [number, NewCellStation] => [
      stationId,
      { ownerCode: ownerCodes.get(stationId), countryCode, planBands: countryCode === null ? [] : (plans.get(countryCode) ?? []) },
    ]),
  );
  return { cells: missing, values, listedNetworks, stations, context: { known, gnbidLengths } };
}

export async function syncMissingCells(tx: DbTx, observedSiteIds: readonly number[], seenSince: string): Promise<FlagSyncCounts> {
  if (observedSiteIds.length === 0) return NOTHING_SYNCED;

  const [siteCells, ownMatchedSites] = await Promise.all([loadSiteCells(tx, observedSiteIds), loadOwnMatchedSites(tx, observedSiteIds)]);
  if (siteCells.length === 0) return NOTHING_SYNCED;

  const missing = findMissingCells(siteCells, ownMatchedSites, seenSince);
  const raised = missing.length === 0 ? [] : raiseMissingCellFlags(await loadMissingCellInput(tx, missing));
  const matched = siteCells.filter((cell) => cell.matchedCellId !== null);
  return syncFlags(tx, {
    kinds: ["cellMissing"],
    lookedAt: inArray(observationFlags.subjectKey, siteCells.map(observedCellSubject)),
    raised,
    fixed: flagsIn(matched.map((cell) => ({ kind: "cellMissing", subjectKey: observedCellSubject(cell) }))),
  });
}
