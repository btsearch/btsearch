import type { SearchMatch, StationStatus } from "@openbts/shared/contract";

import { type ListRowStructure, toListRowStructure, toShownText } from "./listStructures";
import { findTextMark, listMarkedTexts } from "./listTextMarks";
import type { StationsListHit, StationsListPageData } from "./stationsListRequests";
import type { BrandLook } from "@/components/cellular/brandMark";
import type { MapLookups } from "@/features/map/data/mapLookups";
import { getCellTechnologyBands } from "@/features/map/utils";
import type { RatType } from "@/features/shared/rat";
import type { StationRecord } from "@/features/station-details/station/types";
import { toRatType } from "@/features/station-details/station/utils/bands";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { type CellIdentifierField, findCellIdentifierLabel, getCellIdentifier } from "@/features/station-details/station/utils/cells";
import { getStationCountryCode, toV1StationStatus } from "@/features/station-details/station/utils/stations";
import type { StationStatus as V1StationStatus } from "@/types/station";

type IdentifierMatchField = "networksId" | "networksName" | "operatorName";

export type StationsListMatchLine =
  | { kind: "cells"; field: CellIdentifierField; label: string; value: string; cellCount: number; rat: RatType | null }
  | { kind: "identifier"; field: IdentifierMatchField; value: string };

export type StationsListRow = {
  id: number;
  siteId: string;
  siteIdMark: string;
  brand: BrandLook | null | undefined;
  operatorName: string | null;
  note: string | null;
  isConfirmed: boolean;
  status: StationStatus;
  badgeStatus: V1StationStatus | null;
  statusChangedAt: string;
  countryCode: string | null;
  city: string | null;
  cityMark: string;
  address: string | null;
  addressMark: string;
  regionName: string | null;
  structure: ListRowStructure;
  bands: string[];
  enbIds: number[];
  gnbIds: number[];
  updatedAt: string;
  createdAt: string;
  matchLine: StationsListMatchLine | null;
  locationId: number | null;
  latitude: number | null;
  longitude: number | null;
  station: StationRecord;
  loadedAt: number;
};

type RowMarks = {
  siteId: string;
  city: string;
  address: string;
};

type RowContext = {
  lookups: MapLookups | undefined;
  freeText: string;
  loadedAt: number;
};

const IDENTIFIER_MATCH_FIELDS: readonly IdentifierMatchField[] = ["networksId", "networksName", "operatorName"];
const CELL_MATCH_FIELDS: readonly CellIdentifierField[] = ["cid", "longCid", "enbid", "eci", "gnbid", "nci"];
const NO_MARKS: RowMarks = { siteId: "", city: "", address: "" };
const NO_ROWS: StationsListRow[] = [];
const STALE_PAGE_LOADED_AT = 0;

function getRowMarks(station: StationRecord, match: SearchMatch | null, freeText: string): RowMarks {
  if (match === null || match.type === "similar" || freeText === "") return NO_MARKS;
  if (match.field === "siteId") return { siteId: findTextMark(station.siteId, [freeText]), city: "", address: "" };
  if (match.field !== "city" && match.field !== "address") return NO_MARKS;

  const markedTexts = listMarkedTexts(freeText);
  return { siteId: "", city: findTextMark(station.location?.city, markedTexts), address: findTextMark(station.location?.address, markedTexts) };
}

function getMatchLine(station: StationRecord, match: SearchMatch | null): StationsListMatchLine | null {
  if (match === null) return null;

  const identifierField = IDENTIFIER_MATCH_FIELDS.find((field) => field === match.field);
  if (identifierField !== undefined) return { kind: "identifier", field: identifierField, value: match.value };

  const cellField = CELL_MATCH_FIELDS.find((field) => field === match.field);
  if (cellField === undefined) return null;

  const matchedCells = station.cells.filter((cell) => String(getCellIdentifier(cell, cellField)) === match.value);
  const rats = [...new Set(matchedCells.map((cell) => toRatType(cell.rat)))];
  const [rat] = rats;

  return {
    kind: "cells",
    field: cellField,
    label: findCellIdentifierLabel(cellField) ?? cellField,
    value: match.value,
    cellCount: matchedCells.length,
    rat: rats.length === 1 && rat !== undefined ? rat : null,
  };
}

function listCellIdentifiers(cells: StationRecord["cells"], field: CellIdentifierField): number[] {
  const identifiers = cells.flatMap((cell) => {
    const identifier = getCellIdentifier(cell, field);
    return identifier === null ? [] : [identifier];
  });

  return [...new Set(identifiers)].sort((left, right) => left - right);
}

function toStationsListRow({ station, match }: StationsListHit, context: RowContext): StationsListRow {
  const { location } = station;
  const marks = getRowMarks(station, match, context.freeText);

  return {
    id: station.id,
    siteId: station.siteId,
    siteIdMark: marks.siteId,
    brand: context.lookups === undefined ? undefined : getOperatorBrand(station.operator, context.lookups.brands),
    operatorName: station.operator?.name ?? null,
    note: toShownText(station.notes),
    isConfirmed: station.isConfirmed,
    status: station.status,
    badgeStatus: station.status === "active" ? null : toV1StationStatus(station.status),
    statusChangedAt: station.statusChangedAt,
    countryCode: getStationCountryCode(station),
    city: toShownText(location?.city),
    cityMark: marks.city,
    address: toShownText(location?.address),
    addressMark: marks.address,
    regionName: location?.region.name ?? null,
    structure: toListRowStructure(location?.structure),
    bands: getCellTechnologyBands(station.cells),
    enbIds: listCellIdentifiers(station.cells, "enbid"),
    gnbIds: listCellIdentifiers(station.cells, "gnbid"),
    updatedAt: station.updatedAt,
    createdAt: station.createdAt,
    matchLine: getMatchLine(station, match),
    locationId: station.locationId,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    station,
    loadedAt: context.loadedAt,
  };
}

export function toStationsListRows(page: StationsListPageData | undefined, lookups: MapLookups | undefined, isPageFresh: boolean): StationsListRow[] {
  if (page === undefined) return NO_ROWS;

  const loadedAt = isPageFresh ? page.loadedAt : STALE_PAGE_LOADED_AT;
  const context: RowContext = { lookups, freeText: page.freeText, loadedAt };
  return page.hits.map((hit) => toStationsListRow(hit, context));
}
