import {
  cells,
  locationPhotos,
  locations,
  operators,
  proposedCells,
  proposedLocations,
  proposedSectors,
  proposedStations,
  regions,
  stationSectors,
  stations,
  submissionLocationPhotoSelections,
  submissions,
} from "@openbts/drizzle";
import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import type { FastifyRequest, RouteGenericInterface } from "fastify";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { unique } from "../../lib/collections.js";
import type { RoutePermission } from "../../plugins/auth/permissions.js";
import { isLegacyRequest, isOutsideLegacyCountry } from "../countries/legacy.js";
import { type RegionPoint, findRegionIdsAt } from "../regions/lookup.js";
import { stationCountryCode } from "../stations/country.js";
import { type ScopeTarget, accessFromRequest, coversTarget } from "./access.js";

export type StationPlacement = { locationId: number | null; operatorId: number | null };
export type OperatorChange = { stationId: number; operatorId?: number | null; location: "kept" | "removed" };

export type ScopeRefs = {
  regionIds?: readonly number[];
  points?: readonly RegionPoint[];
  locationIds?: readonly number[];
  stationIds?: readonly number[];
  detachedStationIds?: readonly number[];
  operatorChanges?: readonly OperatorChange[];
  cellIds?: readonly number[];
  locationPhotoIds?: readonly number[];
  submissionIds?: readonly string[];
  placements?: readonly StationPlacement[];
  targets?: readonly ScopeTarget[];
};

export type ScopeResolver = (req: FastifyRequest) => ScopeRefs | Promise<ScopeRefs>;

const SCOPED_PERMISSIONS: ReadonlySet<RoutePermission> = new Set<RoutePermission>([
  "create:stations",
  "update:stations",
  "delete:stations",
  "create:cells",
  "update:cells",
  "delete:cells",
  "create:locations",
  "update:locations",
  "delete:locations",
  "moderate:submissions",
]);

const OUT_OF_SCOPE_MESSAGE = "Your editor access does not cover this region";

export function requiresScope(permissions: readonly RoutePermission[] | undefined): boolean {
  return permissions?.some((permission) => SCOPED_PERMISSIONS.has(permission)) === true;
}

export function defineScope<T extends RouteGenericInterface>(resolve: (req: FastifyRequest<T>) => ScopeRefs | Promise<ScopeRefs>): ScopeResolver {
  return (req) => resolve(req as unknown as FastifyRequest<T>);
}

export const stationParamScope = defineScope<{ Params: { station_id: number } }>((req) => ({ stationIds: [req.params.station_id] }));
export const locationParamScope = defineScope<{ Params: { location_id: number } }>((req) => ({ locationIds: [req.params.location_id] }));

export type PlacedLocation = { region_id?: number | null; longitude?: number | null; latitude?: number | null };

export function locationRefs(location: PlacedLocation | undefined, current?: PlacedLocation | null): Pick<ScopeRefs, "regionIds" | "points"> {
  if (!location) return {};

  const movesOrRefiles = [location.region_id, location.longitude, location.latitude].some((value) => typeof value === "number");
  if (!movesOrRefiles) return {};

  const regionId = location.region_id ?? current?.region_id;
  const longitude = location.longitude ?? current?.longitude;
  const latitude = location.latitude ?? current?.latitude;
  if (typeof longitude === "number" && typeof latitude === "number") return { points: [{ longitude, latitude, regionId }] };
  return typeof regionId === "number" ? { regionIds: [regionId] } : {};
}

async function regionTargets(regionIds: number[]): Promise<ScopeTarget[]> {
  if (regionIds.length === 0) return [];
  return db.select({ countryCode: regions.countryCode, regionId: regions.id }).from(regions).where(inArray(regions.id, regionIds));
}

async function locationTargets(locationIds: number[]): Promise<ScopeTarget[]> {
  if (locationIds.length === 0) return [];
  return db
    .selectDistinct({ countryCode: regions.countryCode, regionId: regions.id })
    .from(locations)
    .innerJoin(regions, eq(regions.id, locations.region_id))
    .where(inArray(locations.id, locationIds));
}

async function stationTargets(stationIds: number[]): Promise<ScopeTarget[]> {
  if (stationIds.length === 0) return [];
  return db
    .select({ countryCode: stationCountryCode, regionId: locations.region_id })
    .from(stations)
    .leftJoin(locations, eq(locations.id, stations.location_id))
    .leftJoin(regions, eq(regions.id, locations.region_id))
    .leftJoin(operators, eq(operators.id, stations.operator_id))
    .where(inArray(stations.id, stationIds));
}

async function placementTargets(placements: readonly StationPlacement[]): Promise<ScopeTarget[]> {
  const unplaced = placements.filter((placement) => placement.locationId === null);
  const operatorIds = unique(unplaced.map((placement) => placement.operatorId));
  const operatorRows =
    operatorIds.length === 0
      ? []
      : await db.select({ id: operators.id, countryCode: operators.countryCode }).from(operators).where(inArray(operators.id, operatorIds));
  const countryByOperator = new Map(operatorRows.map((row) => [row.id, row.countryCode]));

  const placed = await locationTargets(unique(placements.map((placement) => placement.locationId)));
  return [
    ...placed,
    ...unplaced.map((placement) => ({
      countryCode: placement.operatorId === null ? null : (countryByOperator.get(placement.operatorId) ?? null),
      regionId: null,
    })),
  ];
}

async function operatorChangeTargets(changes: readonly OperatorChange[]): Promise<ScopeTarget[]> {
  if (changes.length === 0) return [];

  const rows = await db
    .select({ id: stations.id, locationId: stations.location_id, operatorId: stations.operator_id })
    .from(stations)
    .where(inArray(stations.id, unique(changes.map((change) => change.stationId))));
  const stationById = new Map(rows.map((row) => [row.id, row]));
  return placementTargets(
    changes.flatMap((change) => {
      const station = stationById.get(change.stationId);
      if (!station || (station.locationId !== null && change.location === "kept")) return [];
      return [{ locationId: null, operatorId: change.operatorId === undefined ? station.operatorId : change.operatorId }];
    }),
  );
}

async function stationIdsOfCells(cellIds: number[]): Promise<number[]> {
  if (cellIds.length === 0) return [];
  const rows = await db.selectDistinct({ stationId: cells.station_id }).from(cells).where(inArray(cells.id, cellIds));
  return rows.map((row) => row.stationId);
}

async function stationIdsOfSectors(sectorIds: number[]): Promise<number[]> {
  if (sectorIds.length === 0) return [];
  const rows = await db.selectDistinct({ stationId: stationSectors.station_id }).from(stationSectors).where(inArray(stationSectors.id, sectorIds));
  return rows.map((row) => row.stationId);
}

async function locationIdsSharingPhotos(locationPhotoIds: number[]): Promise<number[]> {
  if (locationPhotoIds.length === 0) return [];
  const attachmentIds = db.select({ id: locationPhotos.attachment_id }).from(locationPhotos).where(inArray(locationPhotos.id, locationPhotoIds));
  const rows = await db
    .selectDistinct({ locationId: locationPhotos.location_id })
    .from(locationPhotos)
    .where(inArray(locationPhotos.attachment_id, attachmentIds));
  return rows.map((row) => row.locationId);
}

export async function findLocationIdsAt(points: readonly { longitude: number; latitude: number }[]): Promise<number[]> {
  if (points.length === 0) return [];
  const rows = await db
    .select({ id: locations.id })
    .from(locations)
    .where(or(...points.map((point) => and(eq(locations.longitude, point.longitude), eq(locations.latitude, point.latitude)))));
  return rows.map((row) => row.id);
}

async function submissionRefs(submissionIds: string[]): Promise<ScopeRefs> {
  if (submissionIds.length === 0) return {};

  const [submissionRows, stationRows, unplacedStationRows, locationRows, cellRows, sectorRows, photoRows] = await Promise.all([
    db.select({ stationId: submissions.station_id }).from(submissions).where(inArray(submissions.id, submissionIds)),
    db.select({ stationId: proposedStations.target_station_id }).from(proposedStations).where(inArray(proposedStations.submission_id, submissionIds)),
    db
      .select({ type: submissions.type, stationId: submissions.station_id, operatorId: proposedStations.operator_id })
      .from(proposedStations)
      .innerJoin(submissions, eq(submissions.id, proposedStations.submission_id))
      .leftJoin(proposedLocations, eq(proposedLocations.submission_id, proposedStations.submission_id))
      .where(
        and(
          inArray(proposedStations.submission_id, submissionIds),
          inArray(submissions.type, ["new", "update"]),
          isNotNull(proposedStations.operator_id),
          isNull(proposedLocations.id),
        ),
      ),
    db
      .select({
        region_id: proposedLocations.region_id,
        longitude: proposedLocations.longitude,
        latitude: proposedLocations.latitude,
        current: { region_id: locations.region_id, longitude: locations.longitude, latitude: locations.latitude },
      })
      .from(proposedLocations)
      .leftJoin(submissions, eq(submissions.id, proposedLocations.submission_id))
      .leftJoin(stations, eq(stations.id, submissions.station_id))
      .leftJoin(locations, eq(locations.id, stations.location_id))
      .where(inArray(proposedLocations.submission_id, submissionIds)),
    db
      .select({ cellId: proposedCells.target_cell_id, stationId: proposedCells.station_id, sectorId: proposedCells.target_sector_id })
      .from(proposedCells)
      .where(inArray(proposedCells.submission_id, submissionIds)),
    db.select({ sectorId: proposedSectors.target_sector_id }).from(proposedSectors).where(inArray(proposedSectors.submission_id, submissionIds)),
    db
      .select({ locationPhotoId: submissionLocationPhotoSelections.location_photo_id })
      .from(submissionLocationPhotoSelections)
      .where(inArray(submissionLocationPhotoSelections.submission_id, submissionIds)),
  ]);

  const proposedPoints = locationRows.flatMap(({ longitude, latitude }) =>
    longitude === null || latitude === null ? [] : [{ longitude, latitude }],
  );
  const proposedLocationRefs = locationRows.map(({ current, ...proposed }) => locationRefs(proposed, current));
  const [sectorStationIds, reusedLocationIds] = await Promise.all([
    stationIdsOfSectors(unique([...cellRows.map((row) => row.sectorId), ...sectorRows.map((row) => row.sectorId)])),
    findLocationIdsAt(proposedPoints),
  ]);

  return {
    regionIds: proposedLocationRefs.flatMap((refs) => refs.regionIds ?? []),
    points: proposedLocationRefs.flatMap((refs) => refs.points ?? []),
    locationIds: reusedLocationIds,
    stationIds: unique([
      ...submissionRows.map((row) => row.stationId),
      ...stationRows.map((row) => row.stationId),
      ...cellRows.map((row) => row.stationId),
      ...sectorStationIds,
    ]),
    operatorChanges: unplacedStationRows.flatMap<OperatorChange>(({ type, stationId, operatorId }) =>
      type !== "update" || stationId === null ? [] : [{ stationId, operatorId, location: "kept" }],
    ),
    placements: unplacedStationRows.flatMap<StationPlacement>(({ type, operatorId }) => (type === "new" ? [{ locationId: null, operatorId }] : [])),
    cellIds: unique(cellRows.map((row) => row.cellId)),
    locationPhotoIds: photoRows.map((row) => row.locationPhotoId),
  };
}

export async function resolveScopeTargets(refs: ScopeRefs): Promise<ScopeTarget[]> {
  const fromSubmissions = await submissionRefs(unique(refs.submissionIds ?? []));
  const cellIds = unique([...(refs.cellIds ?? []), ...(fromSubmissions.cellIds ?? [])]);
  const locationPhotoIds = unique([...(refs.locationPhotoIds ?? []), ...(fromSubmissions.locationPhotoIds ?? [])]);

  const [cellStationIds, photoLocationIds, pointRegionIds] = await Promise.all([
    stationIdsOfCells(cellIds),
    locationIdsSharingPhotos(locationPhotoIds),
    findRegionIdsAt([...(refs.points ?? []), ...(fromSubmissions.points ?? [])]),
  ]);
  const regionIds = unique([...(refs.regionIds ?? []), ...(fromSubmissions.regionIds ?? []), ...pointRegionIds]);
  const locationIds = unique([...(refs.locationIds ?? []), ...(fromSubmissions.locationIds ?? []), ...photoLocationIds]);
  const stationIds = unique([...(refs.stationIds ?? []), ...(fromSubmissions.stationIds ?? []), ...cellStationIds]);

  const [detached, ...resolved] = await Promise.all([
    stationTargets(unique(refs.detachedStationIds ?? [])),
    regionTargets(regionIds),
    locationTargets(locationIds),
    stationTargets(stationIds),
    placementTargets([...(refs.placements ?? []), ...(fromSubmissions.placements ?? [])]),
    operatorChangeTargets([...(refs.operatorChanges ?? []), ...(fromSubmissions.operatorChanges ?? [])]),
  ]);
  return [...resolved.flat(), ...detached.map((target) => ({ countryCode: target.countryCode, regionId: null })), ...(refs.targets ?? [])];
}

export async function requestCovers(req: FastifyRequest, refs: ScopeRefs): Promise<boolean> {
  const access = await accessFromRequest(req);
  if (access === null) return false;
  if (access.role === "admin") return true;
  if (access.grants.length === 0) return false;

  const targets = await resolveScopeTargets(refs);
  return targets.length > 0 && targets.every((target) => coversTarget(access, target));
}

export async function requestOverlaps(req: FastifyRequest, refs: ScopeRefs): Promise<boolean> {
  const access = await accessFromRequest(req);
  if (access === null) return false;
  if (access.role === "admin") return true;
  if (access.grants.length === 0) return false;

  const targets = await resolveScopeTargets(refs);
  return targets.some((target) => coversTarget(access, target));
}

export async function assertRouteScope(req: FastifyRequest, resolve: ScopeResolver): Promise<void> {
  const access = await accessFromRequest(req);
  if (access === null) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");

  const isLegacy = isLegacyRequest(req);
  if (access.role === "admin" && !isLegacy) return;

  const targets = await resolveScopeTargets(await resolve(req));
  if (isLegacy && targets.some((target) => isOutsideLegacyCountry(target.countryCode))) throw new ErrorResponse("NOT_FOUND");
  if (access.role === "admin") return;

  const isCovered = access.grants.length > 0 && targets.length > 0 && targets.every((target) => coversTarget(access, target));
  if (!isCovered) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS", { message: OUT_OF_SCOPE_MESSAGE });
}
