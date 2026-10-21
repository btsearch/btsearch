import type { LocalFile } from "../../../../core/sources.ts";
import { missingColumnsError } from "../shared/sheets.ts";

type RegistryColumn =
  | "alternativeNumber"
  | "applicationType"
  | "stationId"
  | "stationName"
  | "city"
  | "street"
  | "houseNumber"
  | "locationDescription"
  | "longitude"
  | "latitude"
  | "systemType"
  | "azimuth"
  | "antennaHeight"
  | "cellType";

type MatchedColumns = Partial<Record<RegistryColumn, number>>;

const REQUIRED_COLUMNS = [
  ["alternativeNumber", "Nr alternatywny"],
  ["stationId", "Id stacji"],
  ["longitude", "Dł geogr."],
  ["latitude", "Szer. geogr."],
  ["systemType", "Rodzaj systemu komórki"],
] as const;

export const REQUIRED_REGISTRY_HEADERS = REQUIRED_COLUMNS.map(([, header]) => header);

export type RegistryColumns = MatchedColumns & Record<(typeof REQUIRED_COLUMNS)[number][0], number>;

const COLUMN_BY_HEADER = new Map<string, RegistryColumn>([
  ["nr alternatywny", "alternativeNumber"],
  ["rodzaj wniosku", "applicationType"],
  ["id stacji", "stationId"],
  ["nazwa stacji", "stationName"],
  ["miejscowość", "city"],
  ["miejscowosc", "city"],
  ["ulica", "street"],
  ["nr domu", "houseNumber"],
  ["dodatkowy opis lokalizacji", "locationDescription"],
  ["dł geogr.", "longitude"],
  ["dl geogr.", "longitude"],
  ["dł geogr", "longitude"],
  ["dl geogr", "longitude"],
  ["szer. geogr.", "latitude"],
  ["szer geogr.", "latitude"],
  ["szer. geogr", "latitude"],
  ["szer geogr", "latitude"],
  ["rodzaj systemu komórki", "systemType"],
  ["rodzaj systemu komorki", "systemType"],
  ["azymut", "azimuth"],
  ["h anteny", "antennaHeight"],
  ["typ komórki", "cellType"],
  ["typ komorki", "cellType"],
]);

export function matchRegistryColumns(headerCells: readonly string[]): MatchedColumns {
  const columns: MatchedColumns = {};
  for (const [index, headerCell] of headerCells.entries()) {
    const column = COLUMN_BY_HEADER.get(headerCell.trim().toLowerCase());
    if (column === undefined) continue;
    if (column === "alternativeNumber" && columns.alternativeNumber !== undefined) continue;
    columns[column] = index;
  }

  return columns;
}

export function findRegistryColumns(file: LocalFile, headerCells: readonly string[]): RegistryColumns {
  const columns = matchRegistryColumns(headerCells);
  const { alternativeNumber, stationId, longitude, latitude, systemType } = columns;
  if (alternativeNumber === undefined || stationId === undefined || longitude === undefined || latitude === undefined || systemType === undefined) {
    const missingHeaders = REQUIRED_COLUMNS.filter(([column]) => columns[column] === undefined).map(([, header]) => header);
    throw missingColumnsError(file, missingHeaders);
  }

  return { ...columns, alternativeNumber, stationId, longitude, latitude, systemType };
}
