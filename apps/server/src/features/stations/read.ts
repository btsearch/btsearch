import {
  bands,
  cells,
  extraIdentificators,
  gsmCells,
  locations,
  lteCells,
  nrCells,
  regions,
  stationSectors,
  stationUplinks,
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
import { type SQL, and, asc, eq, gte, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { unique } from "../../lib/collections.js";
import { flagCondition } from "../../lib/conditions.js";
import { actorIdFromRequest } from "../access/access.js";
import { splitBandFilter } from "../bands/unknown.js";
import { loadHiddenCountryCodes } from "../countries/visibility.js";
import { assertListsEnabled, findListForViewer, getUserListMembership } from "../lists/visibility.js";
import type { LocationRow } from "../locations/write.js";
import { loadOperators } from "../operators/details.js";
import { operatedBy, outsideCountriesOf } from "../operators/sharing.js";
import { type RegionRow, toRegion } from "../regions/serialize.js";
import { DATABASE_STRUCTURE_TYPES, type StructureOwnerRow } from "../structures/serialize.js";
import { stationCountries, stationCountryCode, stationPlacementMatches } from "./country.js";
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
import { DATABASE_RATS, DATABASE_STATUSES, type StationRow, toBackhaul, toCell, toSector, toStation, toStationLocation } from "./serialize.js";

type ListedStationFilter = "keepOtherCountries" | "hasPhotos" | "hasSectors" | "isConfirmed";

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
  "stations.sectors": "sectors",
  "stations.backhaul": "backhaul",
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

export async function findVisibleStation(req: FastifyRequest, stationId: number): Promise<StationRow> {
  const [row] = await db
    .select({ station: stations, countryCode: stationCountries.countryCode })
    .from(stations)
    .innerJoin(stationCountries.table, eq(stations.id, stationCountries.stationId))
    .where(eq(stations.id, stationId))
    .limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  if (row.countryCode !== null && (await loadHiddenCountryCodes(req)).includes(row.countryCode)) throw new ErrorResponse("NOT_FOUND");
  return row.station;
}

export async function listStationIds(req: FastifyRequest, listId: string | undefined): Promise<number[] | null> {
  if (listId === undefined) return null;

  assertListsEnabled();
  return getUserListMembership(await findListForViewer(req, listId, actorIdFromRequest(req))).internal;
}

export function operatorCondition(operatorIds: readonly number[], keepsOtherCountries: boolean, countryFrom: CountrySource): SQL {
  const operated = operatedBy(stations.operator_id, operatorIds);
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
    uplinkTypes: query.backhaulMediums ?? [],
  };
  const conditions = buildStationFilterConditions(stations, filter);

  if (query.operatorIds?.length) conditions.push(operatorCondition(query.operatorIds, query.keepOtherCountries === true, countryFrom));
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
  return buildSectorFilterCondition(stationSectors, filter, [keywordCellMatch, query.supportsIot === true ? IOT_CAPABLE_CELL : undefined]);
}

function bboxCondition([west, south, east, north]: Bbox): SQL {
  const between = (from: number, to: number) => sql`ST_Intersects(${locations.point}, ST_MakeEnvelope(${from}, ${south}, ${to}, ${north}, 4326))`;
  return west < east ? between(west, east) : sql`(${between(west, 180)} OR ${between(-180, east)})`;
}

export function stationAreaConditions(query: AreaFilterQuery, hiddenCountryCodes: readonly string[]): SQL[] {
  const conditions: SQL[] = [];

  if (query.bbox) conditions.push(bboxCondition(query.bbox));
  if (query.regionIds) conditions.push(inArray(locations.region_id, query.regionIds));
  if (query.countryCodes) conditions.push(inArray(stationCountryCode, query.countryCodes));
  if (hiddenCountryCodes.length > 0) {
    conditions.push(sql`(${stationCountryCode} IS NULL OR ${notInArray(stationCountryCode, [...hiddenCountryCodes])})`);
  }
  return conditions.length === 0 ? [] : [stationPlacementMatches(sql.join(conditions, sql` AND `))];
}

export function locationAreaConditions(query: AreaFilterQuery, hiddenCountryCodes: readonly string[]): SQL[] {
  const conditions: SQL[] = [];

  if (query.bbox) conditions.push(bboxCondition(query.bbox));
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
  const wantsCells = wants("cells") || wants("cells.band");

  const stationIds = rows.map((row) => row.id);
  const locationIds = unique(rows.map((row) => row.location_id));
  const operatorIds = unique(rows.map((row) => row.operator_id));

  const [identifierRows, hostStationIds, operatorsById, locationRows, cellRows, bandRows, sectorRows, backhaulRows] = await Promise.all([
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
    wants("backhaul") ? db.select().from(stationUplinks).where(inArray(stationUplinks.station_id, stationIds)) : [],
  ]);

  const identifiersByStation = Map.groupBy(identifierRows, (row) => row.station_id);
  const locationsById = new Map(locationRows.map((row) => [row.location.id, row]));
  const bandsById = new Map(bandRows.map((row) => [row.id, row]));
  const sectorsByStation = Map.groupBy(sectorRows, (row) => row.station_id);
  const backhaulByStation = new Map(backhaulRows.map((row) => [row.station_id, row]));
  const cellsByStation = Map.groupBy(
    cellRows.flatMap((row) => toCell(row, bandsById.get(row.cell.band_id), wants("cells.band")) ?? []),
    (cell) => cell.stationId,
  );

  return rows.map((row) => {
    const station = toStation(row, identifiersByStation.get(row.id) ?? [], hostStationIds.get(row.id) ?? null);
    const operator = row.operator_id === null ? undefined : operatorsById.get(row.operator_id);
    const placement = row.location_id === null ? undefined : locationsById.get(row.location_id);
    const backhaul = backhaulByStation.get(row.id);

    if (wants("operator")) station.operator = operator ?? null;
    if (wantsLocation) station.location = placement ? toLocation(placement, wants("location.region")) : null;
    if (wantsCells) station.cells = cellsByStation.get(row.id) ?? [];
    if (wants("sectors")) station.sectors = (sectorsByStation.get(row.id) ?? []).map(toSector);
    if (wants("backhaul")) station.backhaul = backhaul ? toBackhaul(backhaul) : null;
    return station;
  });
}

export async function readStation(req: FastifyRequest, stationId: number, include: readonly StationInclude[] | undefined): Promise<Station> {
  const row = await findVisibleStation(req, stationId);
  const [station] = await serializeStations([row], include);
  return station!;
}
