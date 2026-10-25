import { cellConfirmations, cellCopies, cellShapes, observedCells, plmns } from "@openbts/drizzle";
import type { CellApplyNewCell, StationCreate } from "@openbts/shared/contract";
import { and, desc, eq, inArray } from "drizzle-orm";

import { unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import { findGnbidLengths } from "../../../analyzer/match.js";
import { loadKnownPlmns } from "../../../cells/networkWrites.js";
import { withCodeVariants } from "../../networks.js";
import type { ObservedSiteRecord } from "../../sites/read.js";
import {
  type NewCellContext,
  type NewCellSource,
  type NewCellStation,
  buildNewCell,
  loadListedNetworksByObservedCellId,
  loadObservedCellValues,
} from "../cells/newCell.js";
import { toMillionths } from "./flaggedSite.js";

export type SiteCellSource = NewCellSource & { id: number; observedSiteId: number; bearingDeg: number | null };
export type MeasuredCell = { cell: CellApplyNewCell; bearingDeg: number | null };

type SiteCellInputs = { cells: SiteCellSource[]; context: NewCellContext };

const MOST_SECTORS = 15;
const FULL_CIRCLE_DEGREES = 360;

export function buildSiteCells(
  cells: readonly SiteCellSource[],
  siteIds: readonly number[],
  station: NewCellStation,
  context: NewCellContext,
): MeasuredCell[] {
  return cells
    .filter((source) => siteIds.includes(source.observedSiteId))
    .toSorted((a, b) => a.id - b.id)
    .flatMap((source) => {
      const cell = buildNewCell(source, station, context);
      return cell === null ? [] : [{ cell, bearingDeg: source.bearingDeg }];
    });
}

function azimuthOf({ bearingDeg }: MeasuredCell): number | null {
  return bearingDeg === null ? null : Math.round(bearingDeg) % FULL_CIRCLE_DEGREES;
}

function sectorKeyOf(azimuth: number): string {
  return `azimuth-${azimuth}`;
}

function withMeasuredSectors(cells: readonly MeasuredCell[]): Pick<StationCreate, "sectors" | "cells"> {
  const measured = cells.map((cell) => ({ cell: cell.cell, azimuth: azimuthOf(cell) }));
  const cellsByAzimuth = Map.groupBy(
    measured.flatMap(({ azimuth }) => (azimuth === null ? [] : [azimuth])),
    (azimuth) => azimuth,
  );
  const azimuths = [...cellsByAzimuth]
    .toSorted(([a, atA], [b, atB]) => atB.length - atA.length || a - b)
    .slice(0, MOST_SECTORS)
    .map(([azimuth]) => azimuth)
    .toSorted((a, b) => a - b);
  const placed = measured.map(({ cell, azimuth }) =>
    azimuth !== null && azimuths.includes(azimuth) ? { ...cell, sectorKey: sectorKeyOf(azimuth) } : cell,
  );
  return azimuths.length === 0 ? { cells: placed } : { sectors: azimuths.map((azimuth) => ({ key: sectorKeyOf(azimuth), azimuth })), cells: placed };
}

function locationOf({ snap, estimate }: ObservedSiteRecord): StationCreate["location"] {
  if (snap?.target.kind === "location") return { latitude: snap.latitude, longitude: snap.longitude };
  const point = snap ?? estimate;
  return point === null ? undefined : { latitude: toMillionths(point.latitude), longitude: toMillionths(point.longitude) };
}

export function suggestStation(site: ObservedSiteRecord, cells: readonly MeasuredCell[], registerSiteId: string | null): StationCreate | null {
  const location = locationOf(site);
  if (site.operatorId === null || location === undefined || (cells.length === 0 && registerSiteId === null)) return null;

  const station = registerSiteId === null ? { operatorId: site.operatorId } : { operatorId: site.operatorId, siteId: registerSiteId };
  return cells.length === 0 ? { station, location } : { station, location, ...withMeasuredSectors(cells) };
}

async function loadBearings(tx: DbTx, observedCellIds: readonly number[]): Promise<Map<number, number>> {
  const shapes = await tx
    .selectDistinctOn([cellShapes.observedCellId], { observedCellId: cellShapes.observedCellId, bearingDeg: cellShapes.bearingDeg })
    .from(cellShapes)
    .where(inArray(cellShapes.observedCellId, [...observedCellIds]))
    .orderBy(cellShapes.observedCellId, desc(cellShapes.shapeVersion));
  return new Map(shapes.map((shape) => [shape.observedCellId, shape.bearingDeg]));
}

export async function loadSiteCellInputs(tx: DbTx, siteIds: readonly number[]): Promise<SiteCellInputs> {
  const empty = { cells: [], context: { known: new Map(), gnbidLengths: new Map() } };
  if (siteIds.length === 0) return empty;

  const rows = await tx
    .select({
      id: observedCells.id,
      plmn: observedCells.plmn,
      rat: observedCells.rat,
      cellKey: observedCells.cellKey,
      observedSiteId: observedCells.observedSiteId,
      confirmedAt: cellConfirmations.confirmedAt,
      primaryCellId: cellCopies.primaryCellId,
    })
    .from(observedCells)
    .leftJoin(cellConfirmations, eq(cellConfirmations.observedCellId, observedCells.id))
    .leftJoin(cellCopies, eq(cellCopies.observedCellId, observedCells.id))
    .where(inArray(observedCells.observedSiteId, [...siteIds]));
  const confirmed = rows.flatMap(({ observedSiteId, confirmedAt, primaryCellId, ...cell }) =>
    observedSiteId === null || confirmedAt === null || primaryCellId !== null ? [] : [{ ...cell, observedSiteId }],
  );
  if (confirmed.length === 0) return empty;

  const confirmedIds = confirmed.map((cell) => cell.id);
  const nrCodes = unique(confirmed.filter((cell) => cell.rat === "NR").map((cell) => cell.plmn));
  const [values, listedNetworks, gnbidLengths, bearings] = await Promise.all([
    loadObservedCellValues(tx, confirmedIds),
    loadListedNetworksByObservedCellId(tx, confirmedIds),
    nrCodes.length > 0 ? findGnbidLengths(nrCodes) : new Map<string, number>(),
    loadBearings(tx, confirmedIds),
  ]);
  const known = await loadKnownPlmns(tx, withCodeVariants([...confirmed.map((cell) => cell.plmn), ...listedNetworks.map((row) => row.plmn)]));
  const valuesByCell = Map.groupBy(values, (value) => value.observedCellId);
  const listedByCell = Map.groupBy(listedNetworks, (row) => row.observedCellId);
  return {
    cells: confirmed.map((cell) => ({
      ...cell,
      values: valuesByCell.get(cell.id) ?? [],
      listedNetworks: listedByCell.get(cell.id) ?? [],
      bearingDeg: bearings.get(cell.id) ?? null,
    })),
    context: { known, gnbidLengths },
  };
}

export async function loadMainCodes(tx: DbTx, operatorIds: readonly number[]): Promise<Map<number, string>> {
  if (operatorIds.length === 0) return new Map();

  const rows = await tx
    .select({ operatorId: plmns.operatorId, code: plmns.code })
    .from(plmns)
    .where(and(inArray(plmns.operatorId, [...operatorIds]), eq(plmns.role, "primary")));
  return new Map(rows.map((row) => [row.operatorId, row.code]));
}
