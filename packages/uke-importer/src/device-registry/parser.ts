import type { ratEnum } from "@openbts/drizzle";

import { convertDMSToDD } from "../utils.js";

export type Rat = (typeof ratEnum.enumValues)[number];

export interface BandInfo {
  rat: Rat;
  value: number;
}

export interface ColumnIndices {
  alternativeNumber: number;
  applicationType?: number;
  stationId: number;
  stationName?: number;
  city?: number;
  street?: number;
  houseNumber?: number;
  locationDescription?: number;
  longitude: number;
  latitude: number;
  gusCode?: number;
  systemType: number;
  azimuth?: number;
  elevation?: number;
  antennaHeight?: number;
  cellType?: number;
}

export interface ParsedDeviceRegistryRow {
  stationId: string;
  lon: number;
  lat: number;
  regionName: string;
  city: string | null;
  address: string | null;
  decisionNumber: string;
  decisionType: "P" | "zmP";
  bandKey: string;
  azimuth: number | null;
  elevation: number | null;
  antennaType: "indoor" | "outdoor" | null;
  antennaHeight: number | null;
}

function parseRat(technology: string): Rat | null {
  switch (technology) {
    case "GSM":
      return "GSM";
    case "CDMA":
      return "CDMA";
    case "UMTS":
      return "UMTS";
    case "LTE":
      return "LTE";
    case "5G":
    case "NR":
      return "NR";
    case "IOT":
      return "IOT";
    default:
      return null;
  }
}

function parseBandVariant(variant: string): "commercial" | "railway" | null {
  if (variant === "commercial") return "commercial";
  if (variant === "railway") return "railway";
  return null;
}

export function parseBandFromSystemType(systemType: string | null): BandInfo | null {
  if (!systemType || typeof systemType !== "string") return null;
  const normalized = systemType.trim().toUpperCase();
  const match = normalized.match(/^(GSM|UMTS|LTE|5G|IOT)(\d{3,4})$/);
  if (!match) return null;

  const rat = parseRat(match[1] ?? "");
  let value = Number(match[2] ?? "");
  if (!rat || !Number.isFinite(value)) return null;
  if (rat === "NR" && value === 3600) value = 3500;
  return { rat, value };
}

export function parseLongLat(value: string | null, direction: "N" | "E"): number | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized || normalized.length !== 6) return null;

  // UKE stores 20 degrees, 58 minutes, 40 seconds as 205840.
  const degrees = normalized.slice(0, 2);
  const minutes = normalized.slice(2, 4);
  const seconds = normalized.slice(4, 6);
  return convertDMSToDD(`${degrees}${direction}${minutes}'${seconds}''`);
}

export function findColumnIndices(headerCells: string[]): ColumnIndices | null {
  const indices: Partial<ColumnIndices> = {};

  for (let index = 0; index < headerCells.length; index++) {
    const header = (headerCells[index] ?? "").trim().toLowerCase();
    switch (header) {
      case "nr alternatywny":
        if (indices.alternativeNumber === undefined) indices.alternativeNumber = index;
        break;
      case "rodzaj wniosku":
        indices.applicationType = index;
        break;
      case "id stacji":
        indices.stationId = index;
        break;
      case "nazwa stacji":
        indices.stationName = index;
        break;
      case "miejscowość":
      case "miejscowosc":
        indices.city = index;
        break;
      case "ulica":
        indices.street = index;
        break;
      case "nr domu":
        indices.houseNumber = index;
        break;
      case "dodatkowy opis lokalizacji":
        indices.locationDescription = index;
        break;
      case "dł geogr.":
      case "dl geogr.":
      case "dł geogr":
      case "dl geogr":
        indices.longitude = index;
        break;
      case "szer. geogr.":
      case "szer geogr.":
      case "szer. geogr":
      case "szer geogr":
        indices.latitude = index;
        break;
      case "kod gus":
        indices.gusCode = index;
        break;
      case "rodzaj systemu komórki":
      case "rodzaj systemu komorki":
        indices.systemType = index;
        break;
      case "azymut":
        indices.azimuth = index;
        break;
      case "elewacja":
        indices.elevation = index;
        break;
      case "h anteny":
        indices.antennaHeight = index;
        break;
      case "typ komórki":
      case "typ komorki":
        indices.cellType = index;
        break;
    }
  }

  if (
    indices.alternativeNumber === undefined ||
    indices.stationId === undefined ||
    indices.longitude === undefined ||
    indices.latitude === undefined ||
    indices.systemType === undefined
  )
    return null;

  return indices as ColumnIndices;
}

export function buildBandKeysArray(fileBandKeys: Set<string>): Array<{ rat: Rat; value: number; variant: "commercial" | "railway" }> {
  const result: Array<{ rat: Rat; value: number; variant: "commercial" | "railway" }> = [];
  for (const key of fileBandKeys) {
    const [rawRat, valueText, rawVariant] = key.split(":");
    const rat = parseRat(rawRat ?? "");
    const value = Number(valueText);
    const variant = parseBandVariant(rawVariant ?? "");
    if (rat && Number.isFinite(value) && variant) result.push({ rat, value, variant });
  }
  return result;
}

export function getOptionalCell(cells: string[], index: number | undefined): string | undefined {
  if (index === undefined) return undefined;
  return cells[index];
}

export function parseAntennaType(value: string | null): "indoor" | "outdoor" | null {
  if (value === "w") return "indoor";
  if (value === "z") return "outdoor";
  return null;
}
