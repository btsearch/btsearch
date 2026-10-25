import { bands, cellMatches, cellShapes, cells, curatedCellSummaries, observationFlags, stations, trailSquares } from "@openbts/drizzle";
import { type ChannelRange, channelRanges, resolveCatalogBand } from "@openbts/shared/bandCatalog";
import { type SQL, and, asc, between, desc, eq, exists, gt, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import db from "../../../../database/psql.js";
import { unique } from "../../../../lib/collections.js";
import type { BandRow } from "../../../bands/serialize.js";
import { cellNetworkCodes, loadOwnerCodes } from "../../../cells/networks.js";
import { loadExtraCodes } from "../../../cells/networkWrites.js";
import { CONFIRMING_PEOPLE, countPeople } from "../../cells/confirmation.js";
import { withCodeVariants } from "../../networks.js";
import { type Polygon, type QuadkeyRange, isInside, rangesCovering, squareCenter } from "../../tiles/squares.js";
import { daysAgo } from "../dates.js";
import type { RaisedFlag } from "../kinds.js";
import { cellSubject } from "../subjects.js";
import { type FlagSyncCounts, syncFlags } from "../sync.js";

const UNSEEN_FOR_DAYS = 90;
const MEASURED_WITHIN_DAYS = 30;
const MEASURED_ZOOM = 18;
const LEAST_SQUARES = 10;
const CELLS_PER_PAGE = 1000;

const sameBandCell = alias(cells, "same_band_cell");

export type QuietCell = { cellId: number; stationId: number; observedCellId: number | null; lastSeenOn: string | null };
export type MeasuredSquare = { bin: number; contributorBits: bigint; lastSeenOn: string };

type Candidate = Omit<QuietCell, "observedCellId"> & { rat: BandRow["rat"]; bandId: number };
export type Footprint = { cellId: number; stationId: number; rat: string; bandId: number; observedCellId: number; footprint: Polygon };
type SquareLookup = {
  cell_id: number;
  plmn: string;
  rat: BandRow["rat"];
  first_channel: number;
  last_channel: number;
  first_bin: number;
  last_bin: number;
};

export function raiseDecommissionedFlag(
  cell: QuietCell,
  footprints: readonly Polygon[],
  squares: readonly MeasuredSquare[],
  { measuredSince }: { measuredSince: string },
): RaisedFlag<"possiblyDecommissioned"> | null {
  if (footprints.length === 0) return null;

  const inside = squares.filter((square) => square.lastSeenOn >= measuredSince && isInside(squareCenter(square.bin, MEASURED_ZOOM), footprints));
  const measuredSquareCount = new Set(inside.map((square) => square.bin)).size;
  const people = countPeople(inside.reduce((bits, square) => bits | square.contributorBits, 0n));
  if (measuredSquareCount < LEAST_SQUARES || people < CONFIRMING_PEOPLE) return null;

  const networkMeasuredOn = inside.reduce((latest, square) => (square.lastSeenOn > latest ? square.lastSeenOn : latest), "");
  return {
    kind: "possiblyDecommissioned",
    subjectKey: cellSubject(cell.cellId),
    refs: { cellId: cell.cellId, stationId: cell.stationId, observedCellId: cell.observedCellId },
    evidence: { lastSeenOn: cell.lastSeenOn, networkMeasuredOn, measuredSquareCount },
    suggestion: null,
    measure: { lastSeenOn: cell.lastSeenOn, people },
  };
}

function hasShapeOfItsBand(): SQL {
  const shaped = db
    .select({ id: sameBandCell.id })
    .from(sameBandCell)
    .innerJoin(cellMatches, eq(cellMatches.cellId, sameBandCell.id))
    .innerJoin(cellShapes, eq(cellShapes.observedCellId, cellMatches.observedCellId))
    .where(and(eq(sameBandCell.station_id, cells.station_id), eq(sameBandCell.rat, cells.rat), eq(sameBandCell.band_id, cells.band_id)));
  return exists(shaped);
}

async function loadQuietCells(afterId: number, unseenSince: string): Promise<Candidate[]> {
  return db
    .select({ cellId: cells.id, stationId: cells.station_id, rat: cells.rat, bandId: cells.band_id, lastSeenOn: curatedCellSummaries.lastSeenOn })
    .from(cells)
    .innerJoin(stations, and(eq(stations.id, cells.station_id), eq(stations.status, "published")))
    .leftJoin(curatedCellSummaries, eq(curatedCellSummaries.cellId, cells.id))
    .where(and(gt(cells.id, afterId), or(isNull(curatedCellSummaries.cellId), lt(curatedCellSummaries.lastSeenOn, unseenSince)), hasShapeOfItsBand()))
    .orderBy(asc(cells.id))
    .limit(CELLS_PER_PAGE);
}

async function loadFootprints(candidates: readonly Candidate[]): Promise<Footprint[]> {
  const rows = await db
    .selectDistinctOn([cellShapes.observedCellId], {
      cellId: cells.id,
      stationId: cells.station_id,
      rat: cells.rat,
      bandId: cells.band_id,
      observedCellId: cellShapes.observedCellId,
      footprint: sql<string>`ST_AsGeoJSON(${cellShapes.footprint})`,
    })
    .from(cells)
    .innerJoin(cellMatches, eq(cellMatches.cellId, cells.id))
    .innerJoin(cellShapes, eq(cellShapes.observedCellId, cellMatches.observedCellId))
    .where(inArray(cells.station_id, unique(candidates.map((candidate) => candidate.stationId))))
    .orderBy(cellShapes.observedCellId, desc(cellShapes.shapeVersion));
  return rows.map(({ footprint, ...row }) => ({ ...row, footprint: (JSON.parse(footprint) as { coordinates: Polygon }).coordinates }));
}

export function footprintsOf(cell: Pick<Candidate, "cellId" | "stationId" | "rat" | "bandId">, footprints: readonly Footprint[]): Polygon[] {
  const own = footprints.filter((footprint) => footprint.cellId === cell.cellId);
  if (own.length > 0) return own.map((footprint) => footprint.footprint);
  return footprints
    .filter((footprint) => footprint.stationId === cell.stationId && footprint.rat === cell.rat && footprint.bandId === cell.bandId)
    .map((footprint) => footprint.footprint);
}

async function loadMatchedObservedCells(cellIds: readonly number[]): Promise<Map<number, number>> {
  const rows = await db
    .selectDistinctOn([cellMatches.cellId], { cellId: cellMatches.cellId, observedCellId: cellMatches.observedCellId })
    .from(cellMatches)
    .where(inArray(cellMatches.cellId, [...cellIds]))
    .orderBy(cellMatches.cellId, asc(cellMatches.observedCellId));
  return new Map(rows.flatMap(({ cellId, observedCellId }) => (cellId === null ? [] : [[cellId, observedCellId] as const])));
}

function squareLookups(
  candidate: Candidate,
  networks: readonly string[],
  channels: readonly ChannelRange[],
  bins: readonly QuadkeyRange[],
): SquareLookup[] {
  return withCodeVariants(networks).flatMap((plmn) =>
    channels.flatMap(([firstChannel, lastChannel]) =>
      bins.map(([firstBin, lastBin]) => ({
        cell_id: candidate.cellId,
        plmn,
        rat: candidate.rat,
        first_channel: firstChannel,
        last_channel: lastChannel,
        first_bin: firstBin,
        last_bin: lastBin,
      })),
    ),
  );
}

async function loadMeasuredSquares(lookups: readonly SquareLookup[], measuredSince: string): Promise<Map<number, MeasuredSquare[]>> {
  if (lookups.length === 0) return new Map();

  const lookup = sql`jsonb_to_recordset(${JSON.stringify(lookups)}::jsonb) AS lookup (
    cell_id integer, plmn varchar(6), rat ${sql.raw(trailSquares.rat.getSQLType())},
    first_channel integer, last_channel integer, first_bin bigint, last_bin bigint
  )`;
  const rows = await db
    .select({
      cellId: sql<number>`lookup.cell_id`,
      bin: trailSquares.bin,
      contributorBits: trailSquares.contributorBits,
      lastSeenOn: trailSquares.lastSeenOn,
    })
    .from(lookup)
    .innerJoin(
      trailSquares,
      and(
        eq(trailSquares.plmn, sql`lookup.plmn`),
        eq(trailSquares.rat, sql`lookup.rat`),
        between(trailSquares.channel, sql`lookup.first_channel`, sql`lookup.last_channel`),
        between(trailSquares.bin, sql`lookup.first_bin`, sql`lookup.last_bin`),
      ),
    )
    .where(and(eq(trailSquares.zoom, MEASURED_ZOOM), eq(trailSquares.held, false), gte(trailSquares.lastSeenOn, measuredSince)));
  return Map.groupBy(rows, (row) => row.cellId);
}

async function raisePage(candidates: readonly Candidate[], measuredSince: string): Promise<RaisedFlag<"possiblyDecommissioned">[]> {
  const cellIds = candidates.map((candidate) => candidate.cellId);
  const [footprints, matched, ownerCodes, extraCodes, bandRows] = await Promise.all([
    loadFootprints(candidates),
    loadMatchedObservedCells(cellIds),
    loadOwnerCodes(unique(candidates.map((candidate) => candidate.stationId))),
    loadExtraCodes(db, cellIds),
    db
      .select()
      .from(bands)
      .where(inArray(bands.id, unique(candidates.map((candidate) => candidate.bandId)))),
  ]);
  const channelsOfBand = new Map(
    bandRows.map((band) => {
      const catalog = resolveCatalogBand(band);
      return [band.id, catalog === null ? [] : channelRanges(catalog)];
    }),
  );

  const shaped = candidates.map((candidate) => ({ candidate, shapes: footprintsOf(candidate, footprints) }));
  const lookups = shaped.flatMap(({ candidate, shapes }) => {
    const networks = cellNetworkCodes(ownerCodes.get(candidate.stationId), extraCodes.get(candidate.cellId));
    return squareLookups(candidate, networks, channelsOfBand.get(candidate.bandId) ?? [], rangesCovering(shapes, MEASURED_ZOOM));
  });
  const squaresByCell = await loadMeasuredSquares(lookups, measuredSince);

  return shaped.flatMap(({ candidate, shapes }) => {
    const cell = { ...candidate, observedCellId: matched.get(candidate.cellId) ?? null };
    return raiseDecommissionedFlag(cell, shapes, squaresByCell.get(candidate.cellId) ?? [], { measuredSince }) ?? [];
  });
}

export async function syncDecommissionedFlags(): Promise<FlagSyncCounts> {
  const unseenSince = daysAgo(UNSEEN_FOR_DAYS);
  const measuredSince = daysAgo(MEASURED_WITHIN_DAYS);
  const raised: RaisedFlag<"possiblyDecommissioned">[] = [];
  let afterId = 0;
  let page: Candidate[];
  do {
    // oxlint-disable-next-line no-await-in-loop
    page = await loadQuietCells(afterId, unseenSince);
    // oxlint-disable-next-line no-await-in-loop
    if (page.length > 0) raised.push(...(await raisePage(page, measuredSince)));
    afterId = page.at(-1)?.cellId ?? afterId;
  } while (page.length === CELLS_PER_PAGE);

  const seenOrInactive = db
    .select({ id: cells.id })
    .from(cells)
    .innerJoin(stations, eq(stations.id, cells.station_id))
    .leftJoin(curatedCellSummaries, eq(curatedCellSummaries.cellId, cells.id))
    .where(and(eq(cells.id, observationFlags.cellId), or(gte(curatedCellSummaries.lastSeenOn, unseenSince), ne(stations.status, "published"))));
  const inactive = db
    .select({ id: cells.id })
    .from(cells)
    .innerJoin(stations, eq(stations.id, cells.station_id))
    .where(and(eq(cells.id, observationFlags.cellId), ne(stations.status, "published")));
  return db.transaction((tx) =>
    syncFlags(tx, { kinds: ["possiblyDecommissioned"], lookedAt: exists(seenOrInactive), raised, fixed: exists(inactive) }),
  );
}
