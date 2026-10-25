import {
  cellBins,
  cellCopies,
  cellTaBins,
  locations,
  observedCells,
  officialLocations,
  officialSites,
  regions,
  siteEstimates,
  siteEvidenceGrids,
  snapTests,
  structureOwners,
  taGroups,
} from "@openbts/drizzle";
import { TIMING_ADVANCE_STEP_METERS } from "@openbts/shared/contract";
import type { Location, ObservedSiteEvidence, SnapTarget } from "@openbts/shared/contract";
import { and, asc, desc, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyRequest } from "fastify";

import db from "../../../database/psql.js";
import { unique } from "../../../lib/collections.js";
import { loadPublicSites } from "../../analyzer/officialSites.js";
import type { BandRow } from "../../bands/serialize.js";
import { type TimingAdvanceFit, loadTimingAdvanceFits, timingAdvanceRatOf } from "../../measurements/devices/calibration.js";
import { locationColumns, serializeLocations, stationFilterConditions } from "../../stations/read.js";
import { findObservedCellRecords } from "../cells/read.js";
import { type ObservedSiteRecord, findVisibleSite, loadSitesSeenBy } from "../sites/read.js";
import { fitOf, snapTargetOf } from "../sites/serialize.js";
import { squareCenter } from "../tiles/squares.js";

export const MOST_TIMING_ADVANCE_SQUARES = 5000;

const otherFit = alias(siteEstimates, "other_fit");
const candidateOfficialLocation = alias(officialLocations, "candidate_official_location");

export type TimingAdvanceReading = {
  observedCellId: number;
  bin: number;
  rat: BandRow["rat"];
  taGroupId: number;
  source: string;
  timingAdvance: number;
  sampleCount: number;
  weightMilli: number;
};
export type SquareSighting = { observedCellId: number; bin: number; stationaryCount: number; sampleCount: number };
export type EvidenceSources = { siteId: number; testedSiteId: number; cellSiteIds: number[] };
export type TestedPlace = SnapTarget & { latitude: number; longitude: number; difference: number; probability: number; isSnap: boolean };

type Calibration = { metersPerStep: number; offsetMeters: number };
type TimingAdvanceSquares = Pick<ObservedSiteEvidence, "timingAdvanceSquares" | "timingAdvanceSquaresTruncated">;

export function evidenceSourcesOf({ primarySiteId, group }: ObservedSiteRecord): EvidenceSources {
  return { siteId: primarySiteId, testedSiteId: group?.leadSiteId ?? primarySiteId, cellSiteIds: group?.memberSiteIds ?? [primarySiteId] };
}

function calibrationOf(reading: TimingAdvanceReading, fits: readonly TimingAdvanceFit[]): Calibration | null {
  const rat = timingAdvanceRatOf(reading.rat);
  if (rat === undefined) return null;

  const fit = fits.find((candidate) => candidate.taGroupId === reading.taGroupId && candidate.rat === rat);
  if (fit !== undefined) return fit;
  if (rat === "nr" && reading.source === "api") return null;
  return { metersPerStep: TIMING_ADVANCE_STEP_METERS[rat], offsetMeters: 0 };
}

function weightedMedian(values: readonly { value: number; weight: number }[]): number {
  const sorted = values.toSorted((a, b) => a.value - b.value);
  const half = sorted.reduce((total, entry) => total + entry.weight, 0) / 2;
  let passed = 0;
  for (const entry of sorted) {
    passed += entry.weight;
    if (passed >= half) return entry.value;
  }
  return sorted.at(-1)?.value ?? 0;
}

function squareKey({ observedCellId, bin }: { observedCellId: number; bin: number }): string {
  return `${observedCellId}:${bin}`;
}

function mayShowPublicly(seen: readonly SquareSighting[]): boolean {
  const stationary = seen.reduce((total, row) => total + row.stationaryCount, 0);
  const samples = seen.reduce((total, row) => total + row.sampleCount, 0);
  return 2 * stationary < samples;
}

export function timingAdvanceSquares(
  readings: readonly TimingAdvanceReading[],
  sightings: readonly SquareSighting[],
  fits: readonly TimingAdvanceFit[],
  { seesAll }: { seesAll: boolean },
): TimingAdvanceSquares {
  const sightingsBySquare = Map.groupBy(sightings, squareKey);
  const squares = [...Map.groupBy(readings, squareKey).values()].flatMap((inSquare) => {
    const [first] = inSquare;
    const distances = inSquare.flatMap((reading) => {
      const calibration = calibrationOf(reading, fits);
      if (calibration === null) return [];
      return [
        {
          value: calibration.metersPerStep * reading.timingAdvance + calibration.offsetMeters,
          weight: reading.weightMilli,
          samples: reading.sampleCount,
        },
      ];
    });
    if (first === undefined || distances.length === 0) return [];
    if (!seesAll && !mayShowPublicly(sightingsBySquare.get(squareKey(first)) ?? [])) return [];

    const center = squareCenter(first.bin);
    return [
      {
        latitude: center.latitude,
        longitude: center.longitude,
        observedCellId: first.observedCellId,
        distanceMeters: Math.max(0, Math.round(weightedMedian(distances))),
        samples: distances.reduce((total, distance) => total + distance.samples, 0),
      },
    ];
  });
  return {
    timingAdvanceSquares: squares
      .toSorted((a, b) => b.samples - a.samples || a.observedCellId - b.observedCellId)
      .slice(0, MOST_TIMING_ADVANCE_SQUARES),
    timingAdvanceSquaresTruncated: squares.length > MOST_TIMING_ADVANCE_SQUARES,
  };
}

async function loadGrid(siteId: number, algorithmVersion: number): Promise<ObservedSiteEvidence["grid"]> {
  const [grid] = await db
    .select({
      latitude: sql<number>`ST_Y(${siteEvidenceGrids.origin})`,
      longitude: sql<number>`ST_X(${siteEvidenceGrids.origin})`,
      cellMeters: siteEvidenceGrids.cellM,
      columns: siteEvidenceGrids.columns,
      rows: siteEvidenceGrids.rows,
      cost: siteEvidenceGrids.cost,
    })
    .from(siteEvidenceGrids)
    .where(and(eq(siteEvidenceGrids.observedSiteId, siteId), eq(siteEvidenceGrids.algorithmVersion, algorithmVersion)))
    .limit(1);
  if (grid === undefined) return null;

  const { latitude, longitude, cost, ...size } = grid;
  return { origin: { latitude, longitude }, ...size, cost: Buffer.from(cost).toString("base64") };
}

export async function loadCandidates(siteId: number, algorithmVersion: number): Promise<TestedPlace[]> {
  const rows = await db
    .select({
      locationId: snapTests.locationId,
      officialSiteId: snapTests.officialSiteId,
      observedSiteId: snapTests.otherSiteId,
      difference: snapTests.difference,
      probability: snapTests.probability,
      isSnap: snapTests.isSnap,
      latitude: sql<number | null>`coalesce(${locations.latitude}, ${candidateOfficialLocation.latitude}, ST_Y(${otherFit.point}))`,
      longitude: sql<number | null>`coalesce(${locations.longitude}, ${candidateOfficialLocation.longitude}, ST_X(${otherFit.point}))`,
    })
    .from(snapTests)
    .leftJoin(locations, eq(locations.id, snapTests.locationId))
    .leftJoin(officialSites, eq(officialSites.id, snapTests.officialSiteId))
    .leftJoin(candidateOfficialLocation, eq(candidateOfficialLocation.id, officialSites.location_id))
    .leftJoin(otherFit, and(eq(otherFit.observedSiteId, snapTests.otherSiteId), eq(otherFit.algorithmVersion, snapTests.algorithmVersion)))
    .where(and(eq(snapTests.observedSiteId, siteId), eq(snapTests.algorithmVersion, algorithmVersion), isNull(snapTests.candidateId)))
    .orderBy(desc(snapTests.probability), asc(snapTests.id));

  return rows.flatMap(({ difference, probability, isSnap, latitude, longitude, ...ids }) => {
    const target = snapTargetOf(ids);
    if (target === null || latitude === null || longitude === null) return [];
    return [{ ...target, latitude, longitude, difference, probability, isSnap }];
  });
}

async function loadCandidateLocations(locationIds: readonly number[]): Promise<Map<number, Location>> {
  if (locationIds.length === 0) return new Map();

  const rows = await db
    .select({ location: locationColumns, region: regions, owner: structureOwners })
    .from(locations)
    .innerJoin(regions, eq(regions.id, locations.region_id))
    .leftJoin(structureOwners, eq(structureOwners.id, locations.structure_owner_id))
    .where(inArray(locations.id, [...locationIds]));
  const listed = await serializeLocations(rows, ["stations"], and(...stationFilterConditions({}, null)), undefined);
  return new Map(listed.map((location) => [location.id, location]));
}

async function nameCandidates(req: FastifyRequest, places: readonly TestedPlace[]): Promise<ObservedSiteEvidence["candidates"]> {
  const [locationsById, officialSiteRefs, shownSites] = await Promise.all([
    loadCandidateLocations(places.flatMap((place) => (place.kind === "location" ? [place.locationId] : []))),
    loadPublicSites(
      req,
      places.flatMap((place) => (place.kind === "officialSite" ? [place.officialSiteId] : [])),
    ),
    loadSitesSeenBy(
      req,
      places.flatMap((place) => (place.kind === "observedSite" ? [place.observedSiteId] : [])),
    ),
  ]);
  const officialSitesById = new Map(officialSiteRefs.map((site) => [site.id, site]));

  return places.flatMap((place): ObservedSiteEvidence["candidates"] => {
    switch (place.kind) {
      case "location": {
        const location = locationsById.get(place.locationId);
        return location === undefined ? [] : [{ ...place, location }];
      }
      case "officialSite": {
        const officialSite = officialSitesById.get(place.officialSiteId);
        return [officialSite === undefined ? place : { ...place, officialSite }];
      }
      case "observedSite": {
        const observedSite = shownSites.get(place.observedSiteId);
        return [observedSite === undefined ? place : { ...place, observedSite }];
      }
    }
  });
}

async function loadCellsBehind(siteIds: readonly number[]): Promise<Map<number, number>> {
  const own = await db
    .select({ id: observedCells.id })
    .from(observedCells)
    .leftJoin(cellCopies, eq(cellCopies.observedCellId, observedCells.id))
    .where(and(inArray(observedCells.observedSiteId, [...siteIds]), isNull(cellCopies.observedCellId)));
  const primaryIds = own.map((cell) => cell.id);
  if (primaryIds.length === 0) return new Map();

  const copies = await db
    .select({ id: cellCopies.observedCellId, primaryCellId: cellCopies.primaryCellId })
    .from(cellCopies)
    .where(inArray(cellCopies.primaryCellId, primaryIds));
  return new Map([...primaryIds.map((id) => [id, id] as const), ...copies.map((copy) => [copy.id, copy.primaryCellId] as const)]);
}

async function loadTimingAdvanceReadings(primaryOf: ReadonlyMap<number, number>): Promise<TimingAdvanceReading[]> {
  const rows = await db
    .select({
      observedCellId: cellTaBins.observedCellId,
      bin: cellTaBins.bin,
      rat: observedCells.rat,
      taGroupId: cellTaBins.taGroupId,
      source: taGroups.source,
      timingAdvance: cellTaBins.timingAdvance,
      sampleCount: cellTaBins.sampleCount,
      weightMilli: cellTaBins.weightMilli,
    })
    .from(cellTaBins)
    .innerJoin(observedCells, eq(observedCells.id, cellTaBins.observedCellId))
    .innerJoin(taGroups, eq(taGroups.id, cellTaBins.taGroupId))
    .where(inArray(cellTaBins.observedCellId, [...primaryOf.keys()]));
  return rows.map(({ observedCellId, weightMilli, ...row }) => ({
    ...row,
    observedCellId: primaryOf.get(observedCellId) ?? observedCellId,
    weightMilli: Number(weightMilli),
  }));
}

async function loadSquareSightings(primaryOf: ReadonlyMap<number, number>): Promise<SquareSighting[]> {
  const withTimingAdvance = db
    .select({ bin: cellTaBins.bin })
    .from(cellTaBins)
    .where(and(eq(cellTaBins.observedCellId, cellBins.observedCellId), eq(cellTaBins.bin, cellBins.bin)));
  const rows = await db
    .select({
      observedCellId: cellBins.observedCellId,
      bin: cellBins.bin,
      stationaryCount: cellBins.stationaryCount,
      sampleCount: cellBins.sampleCount,
    })
    .from(cellBins)
    .where(and(inArray(cellBins.observedCellId, [...primaryOf.keys()]), exists(withTimingAdvance)));
  return rows.map((row) => ({ ...row, observedCellId: primaryOf.get(row.observedCellId) ?? row.observedCellId }));
}

const NO_TIMING_ADVANCE: TimingAdvanceSquares = { timingAdvanceSquares: [], timingAdvanceSquaresTruncated: false };

async function loadTimingAdvance(site: ObservedSiteRecord, primaryOf: ReadonlyMap<number, number>, seesAll: boolean): Promise<TimingAdvanceSquares> {
  if (primaryOf.size === 0) return NO_TIMING_ADVANCE;

  const [readings, sightings] = await Promise.all([loadTimingAdvanceReadings(primaryOf), seesAll ? [] : loadSquareSightings(primaryOf)]);
  const fits = await loadTimingAdvanceFits(site.estimate?.calibrationRunId ?? null, unique(readings.map((reading) => reading.taGroupId)));
  return timingAdvanceSquares(readings, sightings, fits, { seesAll });
}

export async function readSiteEvidence(req: FastifyRequest, id: number): Promise<ObservedSiteEvidence> {
  const { site, access } = await findVisibleSite(req, id);

  const sources = evidenceSourcesOf(site);
  if (site.retiredAt !== null) return { observedSiteId: sources.siteId, fit: null, grid: null, ...NO_TIMING_ADVANCE, cells: [], candidates: [] };

  const cellsBehind = loadCellsBehind(sources.cellSiteIds);
  const [grid, candidates, timingAdvance, cells] = await Promise.all([
    loadGrid(sources.siteId, site.algorithmVersion),
    loadCandidates(sources.testedSiteId, site.algorithmVersion).then((places) => nameCandidates(req, places)),
    cellsBehind.then((primaryOf) => loadTimingAdvance(site, primaryOf, access.role === "admin")),
    cellsBehind.then((primaryOf) => findObservedCellRecords(unique([...primaryOf.values()]).toSorted((a, b) => a - b))),
  ]);
  const { estimate } = site;
  const fit = estimate === null ? null : { latitude: estimate.latitude, longitude: estimate.longitude, ...fitOf(estimate) };
  return { observedSiteId: sources.siteId, fit, grid, ...timingAdvance, cells, candidates };
}
