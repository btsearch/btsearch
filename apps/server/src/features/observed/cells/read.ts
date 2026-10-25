import {
  bands,
  cellCopies,
  cellEdges,
  cellLevelProfiles,
  cellMatches,
  cellShapes,
  cells,
  observedCellSummaries,
  observedCellValues,
  observedCells,
  observedSites,
} from "@openbts/drizzle";
import type { ObservedCellInclude, ObservedCellListQuery, ObservedCellRecord } from "@openbts/shared/contract";
import { type SQL, and, asc, desc, eq, exists, inArray, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../../database/psql.js";
import { ErrorResponse } from "../../../errors.js";
import { unique } from "../../../lib/collections.js";
import { findGnbidLengths } from "../../analyzer/match.js";
import type { BandRow } from "../../bands/serialize.js";
import { bboxCondition } from "../../stations/read.js";
import { loadBandPlans } from "../bandPlans.js";
import { type ObservedCellFilters, namesNetwork, observedCellConditions } from "../filters.js";
import { type Network, loadConfirmedNetworks, loadNetworks, withCodeVariants } from "../networks.js";
import { withObservedSites } from "../sites/read.js";
import { namedByTwoPeople } from "./confirmation.js";
import { toObservedCellRecord } from "./serialize.js";
import { observedCellsVisibleTo } from "./visibility.js";

function selectObservedCells(observedCellIds: readonly number[]) {
  return db
    .select({
      cell: {
        id: observedCells.id,
        plmn: observedCells.plmn,
        rat: observedCells.rat,
        cellKey: observedCells.cellKey,
        observedSiteId: observedCells.observedSiteId,
      },
      site: { rat: observedSites.rat, nodeId: observedSites.nodeId },
      match: { kind: cellMatches.kind, networkMatch: cellMatches.networkMatch, cellId: cellMatches.cellId, stationId: cellMatches.stationId },
      matchedCell: { stationId: cells.station_id, bandId: cells.band_id },
      matchedBandValue: bands.value,
      summary: {
        samples: observedCellSummaries.sampleCount,
        people: observedCellSummaries.personCount,
        squares: observedCellSummaries.squareCount,
        firstSeenOn: observedCellSummaries.firstSeenOn,
        lastSeenOn: observedCellSummaries.lastSeenOn,
      },
      copyOfObservedCellId: cellCopies.primaryCellId,
    })
    .from(observedCells)
    .innerJoin(observedCellSummaries, eq(observedCellSummaries.observedCellId, observedCells.id))
    .leftJoin(observedSites, eq(observedSites.id, observedCells.observedSiteId))
    .leftJoin(cellMatches, eq(cellMatches.observedCellId, observedCells.id))
    .leftJoin(cells, eq(cells.id, cellMatches.cellId))
    .leftJoin(bands, eq(bands.id, cells.band_id))
    .leftJoin(cellCopies, eq(cellCopies.observedCellId, observedCells.id))
    .where(inArray(observedCells.id, [...observedCellIds]));
}

function selectConfirmedValues(observedCellIds: readonly number[]) {
  return db
    .select({
      observedCellId: observedCellValues.observedCellId,
      field: observedCellValues.field,
      value: observedCellValues.value,
      sampleCount: observedCellValues.sampleCount,
      lastSeenOn: observedCellValues.lastSeenOn,
    })
    .from(observedCellValues)
    .where(and(inArray(observedCellValues.observedCellId, [...observedCellIds]), namedByTwoPeople(observedCellValues.contributorBits)));
}

function selectShapes(observedCellIds: readonly number[], withFootprint: boolean) {
  return db
    .selectDistinctOn([cellShapes.observedCellId], {
      observedCellId: cellShapes.observedCellId,
      shapeVersion: cellShapes.shapeVersion,
      bearingDeg: cellShapes.bearingDeg,
      spreadDeg: cellShapes.spreadDeg,
      reachM: cellShapes.reachM,
      reachTaM: cellShapes.reachTaM,
      meanQualityCentiDb: cellShapes.meanQualityCentiDb,
      meanSinrCentiDb: cellShapes.meanSinrCentiDb,
      footprint: withFootprint ? sql<string | null>`ST_AsGeoJSON(${cellShapes.footprint}, 6)` : sql<string | null>`NULL`,
    })
    .from(cellShapes)
    .where(inArray(cellShapes.observedCellId, [...observedCellIds]))
    .orderBy(cellShapes.observedCellId, desc(cellShapes.shapeVersion));
}

function selectLevels(observedCellIds: readonly number[]) {
  return db
    .select({
      observedCellId: cellLevelProfiles.observedCellId,
      shapeVersion: cellLevelProfiles.shapeVersion,
      distanceBand: cellLevelProfiles.distanceBand,
      meanLevelCentiDb: cellLevelProfiles.meanLevelCentiDb,
      meanSinrCentiDb: cellLevelProfiles.meanSinrCentiDb,
    })
    .from(cellLevelProfiles)
    .where(inArray(cellLevelProfiles.observedCellId, [...observedCellIds]))
    .orderBy(cellLevelProfiles.observedCellId, cellLevelProfiles.distanceBand);
}

function selectEdges(observedCellIds: readonly number[]) {
  return db
    .select({
      observedCellId: cellEdges.observedCellId,
      shapeVersion: cellEdges.shapeVersion,
      kind: cellEdges.kind,
      lengthM: cellEdges.lengthM,
      edge: sql<string>`ST_AsGeoJSON(${cellEdges.edge}, 6)`,
    })
    .from(cellEdges)
    .where(inArray(cellEdges.observedCellId, [...observedCellIds]))
    .orderBy(cellEdges.observedCellId, cellEdges.kind);
}

type ObservedCellRow = Awaited<ReturnType<typeof selectObservedCells>>[number];
type ShapeRow = Awaited<ReturnType<typeof selectShapes>>[number];
type LevelRow = Awaited<ReturnType<typeof selectLevels>>[number];
type EdgeRow = Awaited<ReturnType<typeof selectEdges>>[number];
export type ConfirmedValueRow = Awaited<ReturnType<typeof selectConfirmedValues>>[number];

export type ObservedCellRecordRows = ObservedCellRow & {
  values: ConfirmedValueRow[];
  listedNetworks: string[];
  operatorId: number | null;
  planBands: BandRow[];
  gnbidLength: number | null;
  shape: ShapeRow | null;
  levels: LevelRow[];
  footprint?: string | null;
  edges?: EdgeRow[];
};

function isNrSite(site: ObservedCellRow["site"]): boolean {
  return site?.rat === "NR" && site.nodeId !== null;
}

async function loadNetworksAndPlans(codes: readonly string[]): Promise<{ networks: Map<string, Network>; plans: Map<string, BandRow[]> }> {
  const networks = await loadNetworks(codes);
  const plans = await loadBandPlans(unique([...networks.values()].map((network) => network.countryCode)));
  return { networks, plans };
}

export async function loadObservedCellRecords(
  observedCellIds: readonly number[],
  include: readonly ObservedCellInclude[] = [],
): Promise<ObservedCellRecordRows[]> {
  if (observedCellIds.length === 0) return [];

  const rows = await selectObservedCells(observedCellIds);
  const nrCodesWithoutSite = unique(rows.filter((row) => row.cell.rat === "NR" && !isNrSite(row.site)).map((row) => row.cell.plmn));
  const [values, listedNetworks, shapes, levels, edges, { networks, plans }, gnbidLengths] = await Promise.all([
    selectConfirmedValues(observedCellIds),
    loadConfirmedNetworks(observedCellIds),
    selectShapes(observedCellIds, include.includes("footprint")),
    selectLevels(observedCellIds),
    include.includes("edges") ? selectEdges(observedCellIds) : null,
    loadNetworksAndPlans(unique(rows.map((row) => row.cell.plmn))),
    nrCodesWithoutSite.length > 0 ? findGnbidLengths(nrCodesWithoutSite) : new Map<string, number>(),
  ]);

  const rowsById = new Map(rows.map((row) => [row.cell.id, row]));
  const valuesById = Map.groupBy(values, (value) => value.observedCellId);
  const shapesById = new Map(shapes.map((shape) => [shape.observedCellId, shape]));
  const levelsById = Map.groupBy(levels, (level) => level.observedCellId);
  const edgesById = edges ? Map.groupBy(edges, (edge) => edge.observedCellId) : null;

  return observedCellIds.flatMap((observedCellId): ObservedCellRecordRows[] => {
    const row = rowsById.get(observedCellId);
    if (!row) return [];

    const shape = shapesById.get(observedCellId) ?? null;
    const network = networks.get(row.cell.plmn);
    return [
      {
        ...row,
        values: valuesById.get(observedCellId) ?? [],
        listedNetworks: listedNetworks.get(observedCellId) ?? [],
        operatorId: network?.operatorId ?? null,
        planBands: network ? (plans.get(network.countryCode) ?? []) : [],
        gnbidLength: gnbidLengths.get(row.cell.plmn) ?? null,
        shape,
        levels: (levelsById.get(observedCellId) ?? []).filter((level) => level.shapeVersion === shape?.shapeVersion),
        ...(include.includes("footprint") ? { footprint: shape?.footprint ?? null } : {}),
        ...(edgesById ? { edges: (edgesById.get(observedCellId) ?? []).filter((edge) => edge.shapeVersion === shape?.shapeVersion) } : {}),
      },
    ];
  });
}

export async function findObservedCellRecords(
  observedCellIds: readonly number[],
  include?: readonly ObservedCellInclude[],
): Promise<ObservedCellRecord[]> {
  const rows = await loadObservedCellRecords(observedCellIds, include);
  return rows.flatMap((row) => toObservedCellRecord(row) ?? []);
}

function matchedToStations(stationIds: readonly number[]): SQL {
  const byStation = db
    .select({ id: cellMatches.observedCellId })
    .from(cellMatches)
    .where(inArray(cellMatches.stationId, [...stationIds]));
  const byCell = db
    .select({ id: cellMatches.observedCellId })
    .from(cellMatches)
    .innerJoin(cells, eq(cells.id, cellMatches.cellId))
    .where(inArray(cells.station_id, [...stationIds]));
  return sql`(${inArray(observedCells.id, byStation)} OR ${inArray(observedCells.id, byCell)})`;
}

export function observedCellListConditions(query: ObservedCellListQuery, filters: ObservedCellFilters): SQL[] {
  const summary = db
    .select({ id: observedCellSummaries.observedCellId })
    .from(observedCellSummaries)
    .where(eq(observedCellSummaries.observedCellId, observedCells.id));
  const conditions = [...observedCellConditions(filters), exists(summary)];

  if (query.ids) conditions.push(inArray(observedCells.id, query.ids));
  if (query.observedSiteIds) conditions.push(inArray(observedCells.observedSiteId, query.observedSiteIds));
  if (query.matchedStationIds) conditions.push(matchedToStations(query.matchedStationIds));
  if (query.matchedCellIds) {
    const matched = db.select({ id: cellMatches.observedCellId }).from(cellMatches).where(inArray(cellMatches.cellId, query.matchedCellIds));
    conditions.push(inArray(observedCells.id, matched));
  }
  if (query.plmns) conditions.push(namesNetwork(withCodeVariants(query.plmns)));
  if (query.bbox) {
    const touching = db.select({ id: cellShapes.observedCellId }).from(cellShapes).where(bboxCondition(cellShapes.footprint, query.bbox));
    conditions.push(inArray(observedCells.id, touching));
  }
  return conditions;
}

export async function readObservedCell(
  req: FastifyRequest,
  observedCellId: number,
  include?: readonly ObservedCellInclude[],
): Promise<ObservedCellRecord> {
  const [found] = await db
    .select({ id: observedCells.id })
    .from(observedCells)
    .where(and(eq(observedCells.id, observedCellId), await observedCellsVisibleTo(req)))
    .limit(1);
  const records = found ? await findObservedCellRecords([found.id], include) : [];
  const [record] = include?.includes("observedSite") ? await withObservedSites(req, records) : records;
  if (!record) throw new ErrorResponse("NOT_FOUND");
  return record;
}

export async function loadCellsOfSites(observedSiteIds: readonly number[]): Promise<Map<number, ObservedCellRecord[]>> {
  if (observedSiteIds.length === 0) return new Map();

  const siteCells = await db
    .select({ id: observedCells.id })
    .from(observedCells)
    .where(inArray(observedCells.observedSiteId, [...observedSiteIds]))
    .orderBy(asc(observedCells.id));
  const records = await findObservedCellRecords(siteCells.map((cell) => cell.id));
  const bySite = Map.groupBy(records, (record) => record.observedSiteId);
  return new Map(observedSiteIds.map((siteId) => [siteId, bySite.get(siteId) ?? []]));
}
