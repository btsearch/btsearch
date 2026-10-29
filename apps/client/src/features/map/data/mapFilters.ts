import type { Country, ObservedSiteStatus, OfficialLayer, Operator } from "@openbts/shared/contract";
import {
  type BackhaulMedium,
  OFFICIAL_PERMIT_STATUSES,
  OFFICIAL_RAT_FILTERS,
  type OfficialPermitStatus,
  type OfficialRatFilter,
} from "@openbts/shared/contract/constants";

import { RAT_OPTIONS } from "../constants";
import { type OfficialLabelParts, listOfficialRatOptions, toOfficialRatOption } from "@/features/official/labels";
import type { RatOption } from "@/features/shared/rat";
import { isCountryCode, isRecordId } from "@/lib/apiValues";
import { isBackhaulMedium } from "@/lib/format/backhaul";
import type { StationSource, StationStatus } from "@/types/station";

export type MapRecentDateField = "createdAt" | "updatedAt";

export type MapCountryCapability = "official" | "officialStatuses" | "microwaveLinks" | "emf";

export type EstimatedSiteStatus = Exclude<ObservedSiteStatus, "replaced">;

export type CapableCountries = readonly Pick<Country, "code" | "capabilities">[] | undefined;

export type MapFilters = {
  operatorIds: number[];
  countryCodes: string[];
  bands: number[];
  rat: string[];
  status: StationStatus[];
  officialStatuses: OfficialPermitStatus[];
  source: StationSource;
  recentDays: number | null;
  recentDateFields: MapRecentDateField[];
  showStations: boolean;
  showRadiolines: boolean;
  radiolineOperators: number[];
  showHeatmap: boolean;
  showPlannedMeasurements: boolean;
  showEstimatedSites: boolean;
  showTrails: boolean;
  estimatedSiteStatuses: EstimatedSiteStatus[];
  uplinkTypes: BackhaulMedium[];
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
const LEGACY_OFFICIAL_SOURCE = "uke";
const MAP_STATUSES: ReadonlySet<string> = new Set<StationStatus>(["published", "pending", "inactive"]);
const OFFICIAL_STATUS_SET: ReadonlySet<string> = new Set<string>(OFFICIAL_PERMIT_STATUSES);
const RECENT_DATE_FIELDS: ReadonlySet<string> = new Set<MapRecentDateField>(["createdAt", "updatedAt"]);
export const ESTIMATED_SITE_STATUSES: readonly EstimatedSiteStatus[] = ["unmatched", "suggested", "matched", "ignored"];
export const DEFAULT_ESTIMATED_SITE_STATUSES: readonly EstimatedSiteStatus[] = ["unmatched", "suggested"];
const ESTIMATED_SITE_STATUS_SET: ReadonlySet<string> = new Set(ESTIMATED_SITE_STATUSES);
const INTERNAL_MAP_RATS: ReadonlySet<string> = new Set<string>(RAT_OPTIONS.map((rat) => rat.value));
const STORED_REGISTER_RATS: Readonly<Record<OfficialRatFilter, string>> = {
  nr: "NR",
  lte: "LTE",
  umts: "UMTS",
  cdma: "CDMA",
  gsm: "GSM",
  gsmR: "GSM-R",
  iot: IOT_RAT,
};
const OFFICIAL_RATS_BY_STORED_RAT: ReadonlyMap<string, OfficialRatFilter> = new Map(
  OFFICIAL_RAT_FILTERS.map((rat) => [STORED_REGISTER_RATS[rat], rat]),
);

export const DEFAULT_MAP_FILTERS: MapFilters = {
  operatorIds: [],
  countryCodes: [],
  bands: [],
  rat: [],
  status: [DEFAULT_MAP_STATUS],
  officialStatuses: [...OFFICIAL_PERMIT_STATUSES],
  source: "internal",
  recentDays: null,
  recentDateFields: [DEFAULT_RECENT_DATE_FIELD],
  showStations: true,
  showRadiolines: false,
  radiolineOperators: [],
  showHeatmap: false,
  showPlannedMeasurements: false,
  showEstimatedSites: true,
  showTrails: false,
  estimatedSiteStatuses: [...DEFAULT_ESTIMATED_SITE_STATUSES],
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

function isOfficialStatus(value: string): value is OfficialPermitStatus {
  return OFFICIAL_STATUS_SET.has(value);
}

function isMapRecentDateField(value: string): value is MapRecentDateField {
  return RECENT_DATE_FIELDS.has(value);
}

function isEstimatedSiteStatus(value: string): value is EstimatedSiteStatus {
  return ESTIMATED_SITE_STATUS_SET.has(value);
}

export function isDefaultMapStatus(status: readonly StationStatus[]): boolean {
  return status.length === 1 && status[0] === DEFAULT_MAP_STATUS;
}

export function isDefaultOfficialStatuses(statuses: readonly OfficialPermitStatus[]): boolean {
  return OFFICIAL_PERMIT_STATUSES.every((status) => statuses.includes(status));
}

export function clampRecentDays(days: number): number | null {
  if (!Number.isFinite(days)) return null;
  return Math.min(MAX_RECENT_DAYS, Math.max(MIN_RECENT_DAYS, Math.round(days)));
}

export function readMapSource(value: unknown): StationSource {
  return value === "official" || value === LEGACY_OFFICIAL_SOURCE ? "official" : "internal";
}

function listKnownMapRats(source: StationSource, registerRats: readonly string[] | undefined): ReadonlySet<string> | null {
  if (source === "internal") return INTERNAL_MAP_RATS;
  return registerRats === undefined ? null : new Set(registerRats);
}

export function sanitizeMapFilters(filters: MapFilters, registerRats?: readonly string[]): MapFilters {
  const knownRats = listKnownMapRats(filters.source, registerRats);
  const status = unique(filters.status);
  const officialStatuses = unique(filters.officialStatuses);
  const recentDateFields = unique(filters.recentDateFields);
  const estimatedSiteStatuses = unique(filters.estimatedSiteStatuses);

  return {
    ...filters,
    operatorIds: unique(filters.operatorIds.filter(isRecordId)),
    countryCodes: unique(filters.countryCodes.filter(isCountryCode)),
    bands: unique(filters.bands.filter(isBandLabel)),
    rat: unique(filters.rat.filter((rat) => knownRats === null || knownRats.has(rat))),
    status: status.length > 0 ? status : [DEFAULT_MAP_STATUS],
    officialStatuses: officialStatuses.length > 0 ? officialStatuses : [...OFFICIAL_PERMIT_STATUSES],
    recentDays: filters.recentDays === null ? null : clampRecentDays(filters.recentDays),
    recentDateFields: recentDateFields.length > 0 ? recentDateFields : [DEFAULT_RECENT_DATE_FIELD],
    radiolineOperators: unique(filters.radiolineOperators.filter(isRecordId)),
    estimatedSiteStatuses: estimatedSiteStatuses.length > 0 ? estimatedSiteStatuses : [...DEFAULT_ESTIMATED_SITE_STATUSES],
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
    officialStatuses: readStrings(stored.officialStatuses).filter(isOfficialStatus),
    source: readMapSource(stored.source),
    recentDays: typeof stored.recentDays === "number" ? stored.recentDays : null,
    recentDateFields: readStrings(stored.recentDateFields).filter(isMapRecentDateField),
    showStations: stored.showStations !== false,
    showRadiolines: stored.showRadiolines === true,
    radiolineOperators: readNumbers(stored.radiolineOperators),
    showHeatmap: stored.showHeatmap === true,
    showPlannedMeasurements: stored.showPlannedMeasurements === true,
    showEstimatedSites: stored.showEstimatedSites !== false,
    showTrails: stored.showTrails === true,
    estimatedSiteStatuses: readStrings(stored.estimatedSiteStatuses).filter(isEstimatedSiteStatus),
    uplinkTypes: readStrings(stored.uplinkTypes).filter(isBackhaulMedium),
  });
}

export function readStoredOperatorMncs(stored: Record<string, unknown>, field: string): number[] {
  return unique(readNumbers(stored[field]).filter(isRecordId));
}

export function hasCountryCapability(countries: CapableCountries, countryCode: string, capability: MapCountryCapability): boolean {
  return countries?.some((country) => country.code === countryCode && country.capabilities[capability]) === true;
}

export function isMapCountryAllowed(filters: Pick<MapFilters, "source" | "countryCodes">, countryCode: string, countries: CapableCountries): boolean {
  if (filters.source === "official") return hasCountryCapability(countries, countryCode, "official");
  return filters.countryCodes.length === 0 || filters.countryCodes.includes(countryCode);
}

export function listAppliedMapBands(filters: Pick<MapFilters, "source" | "bands">): number[] {
  return filters.source === "official" ? filters.bands.filter((label) => label !== UNKNOWN_BAND_LABEL) : filters.bands;
}

export function listAppliedMapRats(filters: Pick<MapFilters, "source" | "rat">): string[] {
  return filters.source === "official" ? filters.rat : filters.rat.filter((rat) => INTERNAL_MAP_RATS.has(rat));
}

export function listShownOfficialLayers(filters: Pick<MapFilters, "source" | "showStations" | "showHeatmap" | "showRadiolines">): OfficialLayer[] {
  const layers: OfficialLayer[] = [];
  if (filters.source === "official" && (filters.showStations || filters.showHeatmap)) layers.push("sites");
  if (filters.showRadiolines) layers.push("microwaveLinks");
  return layers;
}

export function areMapRatFiltersReady(filters: Pick<MapFilters, "source" | "rat">, isRegisterRatListReady: boolean): boolean {
  return filters.source !== "official" || filters.rat.length === 0 || isRegisterRatListReady;
}

export function listOfficialRatFilters(storedRats: readonly string[]): OfficialRatFilter[] {
  return OFFICIAL_RAT_FILTERS.filter((rat) => storedRats.includes(STORED_REGISTER_RATS[rat]));
}

export function listMapRegisterRatOptions(labels: readonly Pick<OfficialLabelParts, "rat" | "variant">[]): RatOption[] {
  return listOfficialRatOptions(labels).map((option) => ({ ...option, value: STORED_REGISTER_RATS[option.value] }));
}

export function listStoredRegisterRatOptions(storedRats: readonly string[]): RatOption[] {
  return storedRats.flatMap((storedRat) => {
    const rat = OFFICIAL_RATS_BY_STORED_RAT.get(storedRat);
    return rat === undefined ? [] : [{ ...toOfficialRatOption(rat), value: storedRat }];
  });
}

export function countAllowedMapOperators(filters: MapFilters, operators: readonly Operator[] | undefined, countries: CapableCountries): number {
  if (operators === undefined) return filters.operatorIds.length;

  const chosenIds = new Set(filters.operatorIds);
  return operators.filter((operator) => chosenIds.has(operator.id) && isMapCountryAllowed(filters, operator.countryCode, countries)).length;
}

export function countActiveMapFilters(filters: MapFilters, operators: readonly Operator[] | undefined, countries: CapableCountries): number {
  const isRegister = filters.source === "official";
  const statusCount = isRegister || isDefaultMapStatus(filters.status) ? 0 : filters.status.length;
  const officialStatusCount = !isRegister || isDefaultOfficialStatuses(filters.officialStatuses) ? 0 : filters.officialStatuses.length;

  return (
    countAllowedMapOperators(filters, operators, countries) +
    (isRegister ? 0 : filters.countryCodes.length) +
    listAppliedMapBands(filters).length +
    listAppliedMapRats(filters).length +
    statusCount +
    officialStatusCount +
    (isRegister ? 0 : filters.uplinkTypes.length) +
    (filters.recentDays === null ? 0 : 1) +
    (filters.showRadiolines ? filters.radiolineOperators.length : 0)
  );
}

function isSameValueSet(left: readonly (string | number)[], right: readonly (string | number)[]): boolean {
  if (left.length !== right.length) return false;
  const rightValues = new Set<string | number>(right);
  return left.every((value) => rightValues.has(value));
}

export function areMapFiltersUrlEquivalent(left: MapFilters, right: MapFilters): boolean {
  return (
    left.source === right.source &&
    left.showStations === right.showStations &&
    left.showRadiolines === right.showRadiolines &&
    left.showHeatmap === right.showHeatmap &&
    left.showPlannedMeasurements === right.showPlannedMeasurements &&
    left.showEstimatedSites === right.showEstimatedSites &&
    left.showTrails === right.showTrails &&
    left.recentDays === right.recentDays &&
    isSameValueSet(left.operatorIds, right.operatorIds) &&
    isSameValueSet(left.countryCodes, right.countryCodes) &&
    isSameValueSet(left.bands, right.bands) &&
    isSameValueSet(left.rat, right.rat) &&
    isSameValueSet(left.status, right.status) &&
    isSameValueSet(left.officialStatuses, right.officialStatuses) &&
    isSameValueSet(left.uplinkTypes, right.uplinkTypes) &&
    (left.recentDays === null || isSameValueSet(left.recentDateFields, right.recentDateFields)) &&
    (!left.showRadiolines || isSameValueSet(left.radiolineOperators, right.radiolineOperators))
  );
}

export function clearMapFilters(filters: MapFilters): MapFilters {
  return {
    operatorIds: [],
    countryCodes: [],
    bands: [],
    rat: [],
    status: [DEFAULT_MAP_STATUS],
    officialStatuses: [...OFFICIAL_PERMIT_STATUSES],
    source: filters.source,
    recentDays: null,
    recentDateFields: [DEFAULT_RECENT_DATE_FIELD],
    showStations: filters.showStations,
    showRadiolines: filters.showRadiolines,
    radiolineOperators: [],
    showHeatmap: filters.showHeatmap,
    showPlannedMeasurements: filters.showPlannedMeasurements,
    showEstimatedSites: filters.showEstimatedSites,
    showTrails: filters.showTrails,
    estimatedSiteStatuses: [...DEFAULT_ESTIMATED_SITE_STATUSES],
    uplinkTypes: [],
  };
}

export function changeMapFilterSource(filters: MapFilters, source: StationSource): MapFilters {
  return { ...filters, source, rat: listAppliedMapRats({ source, rat: filters.rat }) };
}
