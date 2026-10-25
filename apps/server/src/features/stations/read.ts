import {
  bands,
  cells,
  extraIdentificators,
  gsmCells,
  locations,
  lteCells,
  nrCells,
  regions,
  stationBackhauls,
  stationSectors,
  stations,
  structureOwners,
  umtsCells,
} from "@openbts/drizzle";
import { DEFAULT_STATION_STATUSES, UNKNOWN_STRUCTURE_TYPE } from "@openbts/shared/contract";
import type {
  Bbox,
  Location,
  LocationInclude,
  LocationListQuery,
  Station,
  StationInclude,
  StationListQuery,
  StationLocation,
  StructureTypeFilter,
  areaFilterShape,
  stationFilterShape,
} from "@openbts/shared/contract";
import { type AnyColumn, type SQL, type SQLWrapper, and, asc, eq, exists, gte, inArray, isNull, not, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { unique } from "../../lib/collections.js";
import { flagCondition } from "../../lib/conditions.js";
import { actorIdFromRequest } from "../access/access.js";
import { bandCondition, splitBandFilter } from "../bands/unknown.js";
import { cellNetworkCodes, extraCodesByCell, guestOperatorIdsByStation, loadCellExtras, loadOwnerCodes } from "../cells/networks.js";
import { loadStationCellSightings, loadStationSightings } from "../cells/sightings.js";
import { loadHiddenCountryCodes } from "../countries/visibility.js";
import { assertListsEnabled, findListForViewer, getUserListMembership } from "../lists/visibility.js";
import type { LocationRow } from "../locations/write.js";
import { loadOperators } from "../operators/details.js";
import { broadcastsFor, operatedBy, outsideCountriesOf } from "../operators/sharing.js";
import { type RegionRow, toRegion } from "../regions/serialize.js";
import { DATABASE_STRUCTURE_TYPES, type StructureOwnerRow } from "../structures/serialize.js";
import { stationCountries, stationCountryCode, stationPlacementMatches } from "./country.js";
import { disabledCountryFeatures, getStationCountryFeatures } from "./countryFeatures.js";
import {
  IOT_CAPABLE_CELL,
  type SectorFilter,
  type StationFilter,
  buildHasPhotosCondition,
  buildHasSectorsCondition,
  buildSectorFilterCondition,
  buildStationFilterConditions,
} from "./filter.js";
import { findHostStationIds } from "./physicalStations.js";
import { DATABASE_RATS, DATABASE_STATUSES, type StationRow, toBackhaul, toSector, toStation, toStationCell, toStationLocation } from "./serialize.js";
import { isPlaceholderSiteId, loadNodeNames } from "./siteIds.js";

type ListedStationFilter = "keepOtherCountries" | "hasPhotos" | "hasSectors" | "isConfirmed";
type VisibleStation = { station: StationRow; countryCode: string | null };

export type StationFilterQuery = Pick<StationListQuery, keyof typeof stationFilterShape | ListedStationFilter>;
export type AreaFilterQuery = Pick<StationListQuery, keyof typeof areaFilterShape>;
export type StructureFilterQuery = Pick<LocationListQuery, "structureTypes" | "structureOwnerIds">;
export type CountrySource = "location" | "placement";

export type LocationRows = {
  location: Omit<LocationRow, "point">;
  region: RegionRow;
  owner: StructureOwnerRow | null;
};

const LOCATION_STATION_INCLUDES: Partial<Record<LocationInclude, StationInclude>> = {
  "stations.operator": "operator",
  "stations.cells": "cells",
  "stations.cells.band": "cells.band",
  "stations.cells.sightings": "cells.sightings",
  "stations.sectors": "sectors",
  "stations.backhaul": "backhaul",
  "stations.sightings": "sightings",
};

export const locationColumns = {
  id: locations.id,
  region_id: locations.region_id,
  city: locations.city,
  address: locations.address,
  structure_type: locations.structure_type,
  structure_owner_id: locations.structure_owner_id,
  structure_note: locations.structure_note,
  longitude: locations.longitude,
  latitude: locations.latitude,
  updatedAt: locations.updatedAt,
  createdAt: locations.createdAt,
};

function iotCondition(supportsIot: boolean): SQL {
  const capable = sql`EXISTS (
    SELECT 1 FROM ${cells}
    WHERE ${cells.station_id} = ${stations.id}
    AND (
      EXISTS (SELECT 1 FROM ${lteCells} WHERE ${lteCells.cell_id} = ${cells.id} AND ${lteCells.supports_iot} = true)
      OR EXISTS (SELECT 1 FROM ${nrCells} WHERE ${nrCells.cell_id} = ${cells.id} AND ${nrCells.supports_nr_redcap} = true)
    )
  )`;
  return supportsIot ? capable : sql`NOT ${capable}`;
}

export async function findVisibleLocation(req: FastifyRequest, locationId: number): Promise<LocationRows> {
  const [row] = await db
    .select({ location: locationColumns, region: regions, owner: structureOwners })
    .from(locations)
    .innerJoin(regions, eq(regions.id, locations.region_id))
    .leftJoin(structureOwners, eq(structureOwners.id, locations.structure_owner_id))
    .where(eq(locations.id, locationId))
    .limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  if ((await loadHiddenCountryCodes(req)).includes(row.region.countryCode)) throw new ErrorResponse("NOT_FOUND");
  return row;
}

export async function findVisibleStationWithCountry(req: FastifyRequest, stationId: number): Promise<VisibleStation> {
  const [row] = await db
    .select({ station: stations, countryCode: stationCountries.countryCode })
    .from(stations)
    .innerJoin(stationCountries.table, eq(stations.id, stationCountries.stationId))
    .where(eq(stations.id, stationId))
    .limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  if (row.countryCode !== null && (await loadHiddenCountryCodes(req)).includes(row.countryCode)) throw new ErrorResponse("NOT_FOUND");
  return row;
}

export async function findVisibleStation(req: FastifyRequest, stationId: number): Promise<StationRow> {
  return (await findVisibleStationWithCountry(req, stationId)).station;
}

export async function listStationIds(req: FastifyRequest, listId: string | undefined): Promise<number[] | null> {
  if (listId === undefined) return null;

  assertListsEnabled();
  return getUserListMembership(await findListForViewer(req, listId, actorIdFromRequest(req))).internal;
}

export function guestStationCondition(stationId: AnyColumn, operatorIds: readonly number[], cellMatch?: SQL): SQL {
  const guestStations = db
    .select({ id: cells.station_id })
    .from(cells)
    .where(and(broadcastsFor(cells.id, operatorIds), cellMatch));
  return inArray(stationId, guestStations);
}

function guestOnlyStation(stationId: AnyColumn, operatorIds: readonly number[]): SQL {
  const owner = alias(stations, "sector_owner");
  const ownerMatches = db
    .select({ id: owner.id })
    .from(owner)
    .where(and(eq(owner.id, stationId), operatedBy(owner.operator_id, operatorIds)));
  return sql`(${guestStationCondition(stationId, operatorIds)} AND ${not(exists(ownerMatches))})`;
}

export function operatorCondition(operatorIds: readonly number[], keepsOtherCountries: boolean, countryFrom: CountrySource, guestMatch?: SQL): SQL {
  const ownerMatch = operatedBy(stations.operator_id, operatorIds);
  const operated = guestMatch ? sql`(${ownerMatch} OR ${guestMatch})` : ownerMatch;
  if (!keepsOtherCountries) return operated;
  if (countryFrom === "location") return sql`(${operated} OR ${outsideCountriesOf(regions.countryCode, operatorIds)})`;

  return sql`(${operated} OR ${stationPlacementMatches(outsideCountriesOf(stationCountryCode, operatorIds))})`;
}

export function stationFilterConditions(
  query: StationFilterQuery,
  stationIds: readonly number[] | null,
  countryFrom: CountrySource = "location",
): SQL[] {
  const filter: StationFilter = {
    statuses: (query.statuses ?? DEFAULT_STATION_STATUSES).map((status) => DATABASE_STATUSES[status]),
    operatorIds: [],
    ...splitBandFilter(query.bandIds),
    nonIotRats: (query.rats ?? []).map((rat) => DATABASE_RATS[rat]),
    iotRequested: false,
    since: null,
    backhaulMediums: query.backhaulMediums ?? [],
  };
  const conditions = buildStationFilterConditions(stations, filter);

  if (query.operatorIds?.length) {
    const cellMatch = and(bandCondition(cells.band_id, filter), filter.nonIotRats.length ? inArray(cells.rat, filter.nonIotRats) : undefined);
    const guestMatch = guestStationCondition(stations.id, query.operatorIds, cellMatch);
    conditions.push(operatorCondition(query.operatorIds, query.keepOtherCountries === true, countryFrom, guestMatch));
  }
  if (query.supportsIot !== undefined) conditions.push(iotCondition(query.supportsIot));
  if (query.hasPhotos !== undefined) conditions.push(buildHasPhotosCondition(stations.id, query.hasPhotos));
  if (query.hasSectors !== undefined) conditions.push(buildHasSectorsCondition(stationSectors, stations.id, query.hasSectors));
  if (query.isConfirmed !== undefined) conditions.push(flagCondition(stations.is_confirmed, query.isConfirmed));
  if (query.createdAfter) conditions.push(gte(stations.createdAt, new Date(query.createdAfter)));
  if (query.updatedAfter) conditions.push(gte(stations.updatedAt, new Date(query.updatedAfter)));
  if (stationIds) conditions.push(inArray(stations.id, [...stationIds]));
  return conditions;
}

export function sectorFilterCondition(query: StationFilterQuery, keywordCellMatch: SQL | undefined): SQL | undefined {
  const filter: SectorFilter = {
    ...splitBandFilter(query.bandIds),
    nonIotRats: (query.rats ?? []).map((rat) => DATABASE_RATS[rat]),
    iotRequested: false,
  };
  const otherCellMatches = [keywordCellMatch, query.supportsIot === true ? IOT_CAPABLE_CELL : undefined];
  const condition = buildSectorFilterCondition(stationSectors, filter, otherCellMatches);
  if (!query.operatorIds?.length) return condition;

  const guestCondition = buildSectorFilterCondition(stationSectors, filter, otherCellMatches, broadcastsFor(cells.id, query.operatorIds));
  return sql`CASE WHEN ${guestOnlyStation(stationSectors.station_id, query.operatorIds)} THEN ${guestCondition} ELSE ${condition ?? sql`true`} END`;
}

export function bboxCondition(point: SQLWrapper, [west, south, east, north]: Bbox): SQL {
  const between = (from: number, to: number) => sql`ST_Intersects(${point}, ST_MakeEnvelope(${from}, ${south}, ${to}, ${north}, 4326))`;
  return west < east ? between(west, east) : sql`(${between(west, 180)} OR ${between(-180, east)})`;
}

export function stationPlacementConditions(query: AreaFilterQuery, hiddenCountryCodes: readonly string[]): SQL[] {
  const conditions: SQL[] = [];

  if (query.bbox) conditions.push(bboxCondition(locations.point, query.bbox));
  if (query.regionIds) conditions.push(inArray(locations.region_id, query.regionIds));
  if (query.countryCodes) conditions.push(inArray(stationCountryCode, query.countryCodes));
  if (hiddenCountryCodes.length > 0) {
    conditions.push(sql`(${stationCountryCode} IS NULL OR ${notInArray(stationCountryCode, [...hiddenCountryCodes])})`);
  }
  return conditions;
}

export function stationAreaConditions(query: AreaFilterQuery, hiddenCountryCodes: readonly string[]): SQL[] {
  const conditions = stationPlacementConditions(query, hiddenCountryCodes);
  return conditions.length === 0 ? [] : [stationPlacementMatches(sql.join(conditions, sql` AND `))];
}

export function locationAreaConditions(query: AreaFilterQuery, hiddenCountryCodes: readonly string[]): SQL[] {
  const conditions: SQL[] = [];

  if (query.bbox) conditions.push(bboxCondition(locations.point, query.bbox));
  if (query.regionIds) conditions.push(inArray(locations.region_id, query.regionIds));
  if (query.countryCodes) conditions.push(inArray(regions.countryCode, query.countryCodes));
  if (hiddenCountryCodes.length > 0) conditions.push(notInArray(regions.countryCode, [...hiddenCountryCodes]));
  return conditions;
}

function structureTypeCondition(types: StructureTypeFilter | undefined): SQL | undefined {
  if (!types) return undefined;

  const storedTypes = types.flatMap((type) => (type === UNKNOWN_STRUCTURE_TYPE ? [] : [DATABASE_STRUCTURE_TYPES[type]]));
  return or(
    storedTypes.length > 0 ? inArray(locations.structure_type, storedTypes) : undefined,
    types.includes(UNKNOWN_STRUCTURE_TYPE) ? isNull(locations.structure_type) : undefined,
  );
}

export function locationStructureConditions(query: StructureFilterQuery): SQL[] {
  const conditions: SQL[] = [];
  const typeMatch = structureTypeCondition(query.structureTypes);

  if (typeMatch) conditions.push(typeMatch);
  if (query.structureOwnerIds) conditions.push(inArray(locations.structure_owner_id, query.structureOwnerIds));
  return conditions;
}

export function stationStructureConditions(query: Pick<StationListQuery, "structureTypes">): SQL[] {
  const typeMatch = structureTypeCondition(query.structureTypes);
  return typeMatch ? [sql`${stations.location_id} IN (SELECT ${locations.id} FROM ${locations} WHERE ${typeMatch})`] : [];
}

function toLocation({ location, region, owner }: LocationRows, embedRegion: boolean): StationLocation {
  const listed = toStationLocation(location, region.countryCode, owner);
  if (embedRegion) listed.region = toRegion(region);
  return listed;
}

export async function serializeLocations(
  rows: readonly LocationRows[],
  include: readonly LocationInclude[],
  stationFilter: SQL | undefined,
  sectorCondition: SQL | undefined,
): Promise<Location[]> {
  const wantsStations = include.some((name) => name.startsWith("stations"));
  const locationIds = rows.map((row) => row.location.id);
  const stationRows =
    wantsStations && locationIds.length > 0
      ? await db
          .select({ station: stations })
          .from(stations)
          .leftJoin(locations, eq(locations.id, stations.location_id))
          .leftJoin(regions, eq(regions.id, locations.region_id))
          .where(and(inArray(stations.location_id, locationIds), stationFilter))
          .orderBy(asc(stations.id))
      : [];
  const stationsByLocation = Map.groupBy(
    await serializeStations(
      stationRows.map((row) => row.station),
      include.flatMap((name) => LOCATION_STATION_INCLUDES[name] ?? []),
      sectorCondition,
    ),
    (station) => station.locationId,
  );

  return rows.map((row) => {
    const location: Location = toLocation(row, include.includes("region"));
    if (wantsStations) location.stations = stationsByLocation.get(row.location.id) ?? [];
    return location;
  });
}

export async function serializeLocation(
  row: LocationRows,
  include: readonly LocationInclude[],
  stationFilter: SQL | undefined,
  sectorCondition: SQL | undefined,
): Promise<Location> {
  const [location] = await serializeLocations([row], include, stationFilter, sectorCondition);
  return location!;
}

export async function serializeStations(
  rows: readonly StationRow[],
  include: readonly StationInclude[] = [],
  sectorCondition?: SQL,
): Promise<Station[]> {
  if (rows.length === 0) return [];

  const wants = (name: StationInclude) => include.includes(name);
  const wantsLocation = wants("location") || wants("location.region");
  const wantsCells = wants("cells") || wants("cells.band") || wants("cells.sightings");

  const stationIds = rows.map((row) => row.id);
  const locationIds = unique(rows.map((row) => row.location_id));
  const operatorIds = unique(rows.map((row) => row.operator_id));

  const [
    identifierRows,
    hostStationIds,
    operatorsById,
    locationRows,
    cellRows,
    bandRows,
    sectorRows,
    backhaulRows,
    featuresByStation,
    cellExtras,
    ownerCodes,
    nodeNames,
    stationSightings,
    cellSightings,
  ] = await Promise.all([
    db.select().from(extraIdentificators).where(inArray(extraIdentificators.station_id, stationIds)).orderBy(asc(extraIdentificators.id)),
    findHostStationIds(locationIds),
    loadOperators(db, wants("operator") ? operatorIds : []),
    wantsLocation && locationIds.length > 0
      ? db
          .select({ location: locationColumns, region: regions, owner: structureOwners })
          .from(locations)
          .innerJoin(regions, eq(regions.id, locations.region_id))
          .leftJoin(structureOwners, eq(structureOwners.id, locations.structure_owner_id))
          .where(inArray(locations.id, locationIds))
      : [],
    wantsCells
      ? db
          .select({ cell: cells, gsm: gsmCells, umts: umtsCells, lte: lteCells, nr: nrCells })
          .from(cells)
          .leftJoin(gsmCells, eq(gsmCells.cell_id, cells.id))
          .leftJoin(umtsCells, eq(umtsCells.cell_id, cells.id))
          .leftJoin(lteCells, eq(lteCells.cell_id, cells.id))
          .leftJoin(nrCells, eq(nrCells.cell_id, cells.id))
          .where(inArray(cells.station_id, stationIds))
          .orderBy(asc(cells.id))
      : [],
    wantsCells ? db.select().from(bands) : [],
    wants("sectors")
      ? db
          .select()
          .from(stationSectors)
          .where(and(inArray(stationSectors.station_id, stationIds), sectorCondition))
          .orderBy(asc(stationSectors.id))
      : [],
    wants("backhaul") ? db.select().from(stationBackhauls).where(inArray(stationBackhauls.station_id, stationIds)) : [],
    getStationCountryFeatures(wantsCells ? stationIds : []),
    loadCellExtras(stationIds),
    loadOwnerCodes(wantsCells ? stationIds : []),
    loadNodeNames(rows.filter((row) => isPlaceholderSiteId(row.station_id)).map((row) => row.id)),
    wants("sightings") ? loadStationSightings(stationIds) : null,
    wants("cells.sightings") ? loadStationCellSightings(stationIds) : null,
  ]);

  const identifiersByStation = Map.groupBy(identifierRows, (row) => row.station_id);
  const locationsById = new Map(locationRows.map((row) => [row.location.id, row]));
  const bandsById = new Map(bandRows.map((row) => [row.id, row]));
  const sectorsByStation = Map.groupBy(sectorRows, (row) => row.station_id);
  const backhaulByStation = new Map(backhaulRows.map((row) => [row.station_id, row]));
  const extraCodes = extraCodesByCell(cellExtras);
  const guestOperatorIds = guestOperatorIdsByStation(cellExtras, new Map(rows.map((row) => [row.id, row.operator_id])));
  const cellRowsByStation = Map.groupBy(cellRows, (row) => row.cell.station_id);
  const toNestedCell = (row: (typeof cellRows)[number]) => {
    const cell = toStationCell(
      row,
      bandsById.get(row.cell.band_id),
      wants("cells.band"),
      featuresByStation.get(row.cell.station_id) ?? disabledCountryFeatures,
      cellNetworkCodes(ownerCodes.get(row.cell.station_id), extraCodes.get(row.cell.id)),
    );
    if (cell === null) return [];
    if (cellSightings) cell.sightings = cellSightings.get(row.cell.id) ?? null;
    return [cell];
  };

  return rows.map((row) => {
    const station = toStation(
      row,
      identifiersByStation.get(row.id) ?? [],
      hostStationIds.get(row.id) ?? null,
      guestOperatorIds.get(row.id) ?? [],
      nodeNames.get(row.id) ?? null,
    );
    const operator = row.operator_id === null ? undefined : operatorsById.get(row.operator_id);
    const placement = row.location_id === null ? undefined : locationsById.get(row.location_id);
    const backhaul = backhaulByStation.get(row.id);

    if (wants("operator")) station.operator = operator ?? null;
    if (wantsLocation) station.location = placement ? toLocation(placement, wants("location.region")) : null;
    if (wantsCells) station.cells = cellRowsByStation.get(row.id)?.flatMap(toNestedCell) ?? [];
    if (wants("sectors")) station.sectors = (sectorsByStation.get(row.id) ?? []).map(toSector);
    if (wants("backhaul")) station.backhaul = backhaul ? toBackhaul(backhaul) : null;
    if (stationSightings) station.sightings = stationSightings.get(row.id) ?? null;
    return station;
  });
}

export async function readStation(req: FastifyRequest, stationId: number, include: readonly StationInclude[] | undefined): Promise<Station> {
  const row = await findVisibleStation(req, stationId);
  const [station] = await serializeStations([row], include);
  return station!;
}
