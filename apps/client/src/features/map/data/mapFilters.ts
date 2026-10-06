import type { Operator } from "@openbts/shared/contract";

import { RAT_OPTIONS, REGISTER_COUNTRY_CODE, UKE_RAT_OPTIONS } from "../constants";
import { isCountryCode, isRecordId } from "@/lib/apiValues";
import { isUplinkType } from "@/lib/format/uplink";
import type { StationSource, StationStatus, UplinkType } from "@/types/station";

export type MapRecentDateField = "createdAt" | "updatedAt";

export type MapFilters = {
  operatorIds: number[];
  countryCodes: string[];
  bands: number[];
  rat: string[];
  status: StationStatus[];
  source: StationSource;
  recentDays: number | null;
  recentDateFields: MapRecentDateField[];
  showStations: boolean;
  showRadiolines: boolean;
  radiolineOperators: number[];
  showHeatmap: boolean;
  showPlannedMeasurements: boolean;
  uplinkTypes: UplinkType[];
};

export type MapFiltersUpdater = (filters: MapFilters) => MapFilters;
export type MapFiltersChange = MapFilters | MapFiltersUpdater;

export const UNKNOWN_BAND_LABEL = 0;
export const IOT_RAT = "iot";
export const DEFAULT_RECENT_DAYS = 30;

const MIN_RECENT_DAYS = 1;
const MAX_RECENT_DAYS = 30;
const DEFAULT_MAP_STATUS: StationStatus = "published";
const DEFAULT_RECENT_DATE_FIELD: MapRecentDateField = "createdAt";
const MAP_STATUSES: ReadonlySet<string> = new Set<StationStatus>(["published", "pending", "inactive"]);
const RECENT_DATE_FIELDS: ReadonlySet<string> = new Set<MapRecentDateField>(["createdAt", "updatedAt"]);
const MAP_RATS_BY_SOURCE: Record<StationSource, ReadonlySet<string>> = {
  internal: new Set<string>(RAT_OPTIONS.map((rat) => rat.value)),
  uke: new Set<string>(UKE_RAT_OPTIONS.map((rat) => rat.value)),
};

export const DEFAULT_MAP_FILTERS: MapFilters = {
  operatorIds: [],
  countryCodes: [],
  bands: [],
  rat: [],
  status: [DEFAULT_MAP_STATUS],
  source: "internal",
  recentDays: null,
  recentDateFields: [DEFAULT_RECENT_DATE_FIELD],
  showStations: true,
  showRadiolines: false,
  radiolineOperators: [],
  showHeatmap: false,
  showPlannedMeasurements: false,
  uplinkTypes: [],
};

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function readNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is number => typeof entry === "number");
}

function readStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function isBandLabel(value: number): boolean {
  return Number.isSafeInteger(value) && value >= UNKNOWN_BAND_LABEL;
}

function isMapStationStatus(value: string): value is StationStatus {
  return MAP_STATUSES.has(value);
}

function isMapRecentDateField(value: string): value is MapRecentDateField {
  return RECENT_DATE_FIELDS.has(value);
}

export function isDefaultMapStatus(status: readonly StationStatus[]): boolean {
  return status.length === 1 && status[0] === DEFAULT_MAP_STATUS;
}

export function clampRecentDays(days: number): number | null {
  if (!Number.isFinite(days)) return null;
  return Math.min(MAX_RECENT_DAYS, Math.max(MIN_RECENT_DAYS, Math.round(days)));
}

export function sanitizeMapFilters(filters: MapFilters): MapFilters {
  const knownRats = MAP_RATS_BY_SOURCE.uke;
  const status = unique(filters.status);
  const recentDateFields = unique(filters.recentDateFields);

  return {
    ...filters,
    operatorIds: unique(filters.operatorIds.filter(isRecordId)),
    countryCodes: unique(filters.countryCodes.filter(isCountryCode)),
    bands: unique(filters.bands.filter(isBandLabel)),
    rat: unique(filters.rat.filter((rat) => knownRats.has(rat))),
    status: status.length > 0 ? status : [DEFAULT_MAP_STATUS],
    recentDays: filters.recentDays === null ? null : clampRecentDays(filters.recentDays),
    recentDateFields: recentDateFields.length > 0 ? recentDateFields : [DEFAULT_RECENT_DATE_FIELD],
    radiolineOperators: unique(filters.radiolineOperators.filter(isRecordId)),
    uplinkTypes: unique(filters.uplinkTypes),
  };
}

export function readStoredMapFilters(stored: Record<string, unknown>): MapFilters {
  return sanitizeMapFilters({
    operatorIds: readNumbers(stored.operatorIds),
    countryCodes: readStrings(stored.countryCodes),
    bands: readNumbers(stored.bands),
    rat: readStrings(stored.rat),
    status: readStrings(stored.status).filter(isMapStationStatus),
    source: stored.source === "uke" ? "uke" : "internal",
    recentDays: typeof stored.recentDays === "number" ? stored.recentDays : null,
    recentDateFields: readStrings(stored.recentDateFields).filter(isMapRecentDateField),
    showStations: stored.showStations !== false,
    showRadiolines: stored.showRadiolines === true,
    radiolineOperators: readNumbers(stored.radiolineOperators),
    showHeatmap: stored.showHeatmap === true,
    showPlannedMeasurements: stored.showPlannedMeasurements === true,
    uplinkTypes: readStrings(stored.uplinkTypes).filter(isUplinkType),
  });
}

export function readStoredOperatorMncs(stored: Record<string, unknown>, field: string): number[] {
  return unique(readNumbers(stored[field]).filter(isRecordId));
}

export function isMapCountryAllowed(filters: Pick<MapFilters, "source" | "countryCodes">, countryCode: string): boolean {
  if (filters.source === "uke") return countryCode === REGISTER_COUNTRY_CODE;
  return filters.countryCodes.length === 0 || filters.countryCodes.includes(countryCode);
}

export function listAppliedMapBands(filters: Pick<MapFilters, "source" | "bands">): number[] {
  return filters.source === "uke" ? filters.bands.filter((label) => label !== UNKNOWN_BAND_LABEL) : filters.bands;
}

export function listAppliedMapRats(filters: Pick<MapFilters, "source" | "rat">): string[] {
  const sourceRats = MAP_RATS_BY_SOURCE[filters.source];
  return filters.rat.filter((rat) => sourceRats.has(rat));
}

export function countAllowedMapOperators(filters: MapFilters, operators: readonly Operator[] | undefined): number {
  if (operators === undefined) return filters.operatorIds.length;

  const chosenIds = new Set(filters.operatorIds);
  return operators.filter((operator) => chosenIds.has(operator.id) && isMapCountryAllowed(filters, operator.countryCode)).length;
}

export function countActiveMapFilters(filters: MapFilters, operators: readonly Operator[] | undefined): number {
  const isRegister = filters.source === "uke";
  const statusCount = isRegister || isDefaultMapStatus(filters.status) ? 0 : filters.status.length;

  return (
    countAllowedMapOperators(filters, operators) +
    (isRegister ? 0 : filters.countryCodes.length) +
    listAppliedMapBands(filters).length +
    listAppliedMapRats(filters).length +
    statusCount +
    (isRegister ? 0 : filters.uplinkTypes.length) +
    (filters.recentDays === null ? 0 : 1) +
    (filters.showRadiolines ? filters.radiolineOperators.length : 0)
  );
}

export function clearMapFilters(filters: MapFilters): MapFilters {
  return {
    operatorIds: [],
    countryCodes: [],
    bands: [],
    rat: [],
    status: [DEFAULT_MAP_STATUS],
    source: filters.source,
    recentDays: null,
    recentDateFields: [DEFAULT_RECENT_DATE_FIELD],
    showStations: filters.showStations,
    showRadiolines: filters.showRadiolines,
    radiolineOperators: [],
    showHeatmap: filters.showHeatmap,
    showPlannedMeasurements: filters.showPlannedMeasurements,
    uplinkTypes: [],
  };
}

export function changeMapFilterSource(filters: MapFilters, source: StationSource): MapFilters {
  return { ...filters, source, rat: listAppliedMapRats({ source, rat: filters.rat }) };
}
