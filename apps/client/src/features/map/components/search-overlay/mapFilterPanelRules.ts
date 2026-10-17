import { type MapCountries, sortCountryCodesByName } from "../../data/mapCountries";
import { type CapableCountries, type MapFilters, UNKNOWN_BAND_LABEL, hasCountryCapability, isMapCountryAllowed } from "../../data/mapFilters";
import type { MapBandLabelsByCountry, MapLookups, MapOperator } from "../../data/mapLookups";

type CountryPillSplit = {
  pinnedCountryCodes: string[];
  foldedCountryCodes: string[];
};

export type OperatorRowFilters = Pick<MapFilters, "operatorIds" | "countryCodes" | "source">;

export type OperatorRow = {
  countryCode: string;
  isOffScreen: boolean;
  tickedOperatorCount: number;
  pinnedOperators: MapOperator[];
  foldedOperators: MapOperator[];
};

type OperatorRows = {
  rows: OperatorRow[];
  hasCountryTiles: boolean;
  hasRowPills: boolean;
};

export type BandPill = {
  label: number;
  markCountryCode: string | null;
};

export type LayersNote = "sharedView" | "linksAndEmfUnavailable" | "linksUnavailable" | "emfUnavailable";

type RowCountry = Pick<OperatorRow, "countryCode" | "isOffScreen">;

const ALWAYS_PINNED_COUNTRIES = 4;
export const MOST_ALWAYS_OPEN_OPERATOR_ROWS = 3;
const NO_OPERATOR_ROWS: OperatorRows = { rows: [], hasCountryTiles: false, hasRowPills: false };
const NO_BAND_LABELS: readonly number[] = [];
const FEWEST_MARKED_COUNTRIES = 2;
const MOST_MARKED_COUNTRIES = 3;

function listAllowedCountryCodesOnScreen(filters: OperatorRowFilters, mapCountries: MapCountries, countries: CapableCountries): string[] {
  return mapCountries.onScreen.filter((countryCode) => isMapCountryAllowed(filters, countryCode, countries));
}

export function listCountryPillCodes(filters: MapFilters, mapCountries: MapCountries, language: string): string[] {
  const pickedOffScreen = filters.countryCodes.filter((countryCode) => !mapCountries.onScreen.includes(countryCode));
  return [...mapCountries.onScreen, ...sortCountryCodesByName(pickedOffScreen, language)];
}

export function splitCountryPillCodes(filters: MapFilters, countryPillCodes: readonly string[]): CountryPillSplit {
  const pickedCountryCodes = new Set(filters.countryCodes);
  const pinnedCountryCodes = countryPillCodes.slice(0, ALWAYS_PINNED_COUNTRIES);
  const foldedCountryCodes: string[] = [];

  for (const countryCode of countryPillCodes.slice(ALWAYS_PINNED_COUNTRIES)) {
    if (pickedCountryCodes.has(countryCode)) pinnedCountryCodes.push(countryCode);
    else foldedCountryCodes.push(countryCode);
  }
  return { pinnedCountryCodes, foldedCountryCodes };
}

export function hasCountryFacet(filters: MapFilters, countryPillCodes: readonly string[]): boolean {
  return filters.source !== "official" && (countryPillCodes.length > 1 || filters.countryCodes.length > 0);
}

export function findKeybindCountryCode(filters: MapFilters, mapCountries: MapCountries, countries: CapableCountries): string | null {
  return listAllowedCountryCodesOnScreen(filters, mapCountries, countries).at(0) ?? null;
}

function listTickedCountryCodesOffScreen(filters: OperatorRowFilters, mapCountries: MapCountries, lookups: MapLookups, language: string): string[] {
  const countryCodes = new Set<string>();

  for (const operatorId of filters.operatorIds) {
    const countryCode = lookups.operatorsById.get(operatorId)?.operator.countryCode;
    if (countryCode === undefined || mapCountries.onScreen.includes(countryCode)) continue;
    if (isMapCountryAllowed(filters, countryCode, lookups.countries)) countryCodes.add(countryCode);
  }
  return sortCountryCodesByName([...countryCodes], language);
}

function toRowCountries(countryCodes: readonly string[], isOffScreen: boolean): RowCountry[] {
  return countryCodes.map((countryCode) => ({ countryCode, isOffScreen }));
}

function listRowCountries(filters: OperatorRowFilters, mapCountries: MapCountries, lookups: MapLookups, language: string): RowCountry[] {
  const rowCountriesOnScreen = toRowCountries(listAllowedCountryCodesOnScreen(filters, mapCountries, lookups.countries), false);
  if (filters.source === "official") return rowCountriesOnScreen;

  return [...rowCountriesOnScreen, ...toRowCountries(listTickedCountryCodesOffScreen(filters, mapCountries, lookups, language), true)];
}

function isSingleCountryPanel(filters: OperatorRowFilters, mapCountries: MapCountries, rowCountries: readonly RowCountry[]): boolean {
  if (filters.source === "official") return rowCountries.length <= 1;
  if (rowCountries.length !== 1 || rowCountries[0].isOffScreen) return false;
  return mapCountries.onScreen.length === 1 && filters.countryCodes.length === 0;
}

function toOperatorRows(rowCountry: RowCountry, lookups: MapLookups, tickedOperatorIds: ReadonlySet<number>): OperatorRow[] {
  const group = lookups.operatorGroups.get(rowCountry.countryCode);
  if (group === undefined) return [];

  const tickedMain = group.main.filter((entry) => tickedOperatorIds.has(entry.operator.id));
  const tickedMinor = group.minor.filter((entry) => tickedOperatorIds.has(entry.operator.id));
  const tickedOperatorCount = tickedMain.length + tickedMinor.length;
  if (rowCountry.isOffScreen) return [{ ...rowCountry, tickedOperatorCount, pinnedOperators: [...tickedMain, ...tickedMinor], foldedOperators: [] }];

  const foldedOperators = group.minor.filter((entry) => !tickedOperatorIds.has(entry.operator.id));
  return [{ ...rowCountry, tickedOperatorCount, pinnedOperators: [...group.main, ...tickedMinor], foldedOperators }];
}

export function listOperatorRows(
  filters: OperatorRowFilters,
  mapCountries: MapCountries,
  lookups: MapLookups | undefined,
  language: string,
): OperatorRows {
  if (lookups === undefined) return NO_OPERATOR_ROWS;

  const rowCountries = listRowCountries(filters, mapCountries, lookups, language);
  const tickedOperatorIds = new Set(filters.operatorIds);
  const rows = rowCountries.flatMap((rowCountry) => toOperatorRows(rowCountry, lookups, tickedOperatorIds));
  return {
    rows,
    hasCountryTiles: !isSingleCountryPanel(filters, mapCountries, rowCountries),
    hasRowPills: rows.length > MOST_ALWAYS_OPEN_OPERATOR_ROWS,
  };
}

export function listBandFacetCountryCodes(filters: MapFilters, mapCountries: MapCountries, language: string, countries: CapableCountries): string[] {
  const allowedOnScreen = listAllowedCountryCodesOnScreen(filters, mapCountries, countries);
  if (filters.source === "official") return allowedOnScreen;

  return allowedOnScreen.length > 0 ? allowedOnScreen : sortCountryCodesByName(filters.countryCodes, language);
}

export function canMarkCountries(facetCountryCodes: readonly string[], hasPlan: (countryCode: string) => boolean): boolean {
  if (facetCountryCodes.length < FEWEST_MARKED_COUNTRIES || facetCountryCodes.length > MOST_MARKED_COUNTRIES) return false;
  return facetCountryCodes.every((countryCode) => hasPlan(countryCode));
}

export function markSingleCountryKeys<Key>(
  facetCountryCodes: readonly string[],
  listKeys: (countryCode: string) => readonly Key[],
): Map<Key, string> {
  const onlyCountryCodes = new Map<Key, string | null>();
  for (const countryCode of facetCountryCodes) {
    for (const key of new Set(listKeys(countryCode))) onlyCountryCodes.set(key, onlyCountryCodes.has(key) ? null : countryCode);
  }

  const marks = new Map<Key, string>();
  for (const [key, countryCode] of onlyCountryCodes) {
    if (countryCode !== null) marks.set(key, countryCode);
  }
  return marks;
}

function canMarkBandCountries(filters: MapFilters, facetCountryCodes: readonly string[], labelsByCountry: MapBandLabelsByCountry): boolean {
  if (filters.source === "official") return false;
  return canMarkCountries(facetCountryCodes, (countryCode) => labelsByCountry.has(countryCode));
}

export function listBandPills(filters: MapFilters, facetCountryCodes: readonly string[], labelsByCountry: MapBandLabelsByCountry): BandPill[] {
  const labels = new Set<number>();
  for (const countryCode of facetCountryCodes) {
    for (const label of labelsByCountry.get(countryCode) ?? NO_BAND_LABELS) labels.add(label);
  }
  for (const label of filters.bands) if (label !== UNKNOWN_BAND_LABEL) labels.add(label);

  const marks = canMarkBandCountries(filters, facetCountryCodes, labelsByCountry)
    ? markSingleCountryKeys(facetCountryCodes, (countryCode) => labelsByCountry.get(countryCode) ?? NO_BAND_LABELS)
    : null;
  const pills = [...labels].sort((left, right) => left - right).map((label): BandPill => ({ label, markCountryCode: marks?.get(label) ?? null }));

  return filters.source === "official" ? pills : [...pills, { label: UNKNOWN_BAND_LABEL, markCountryCode: null }];
}

export function hasRegisterSourceNote(filters: MapFilters, mapCountries: MapCountries, countries: CapableCountries): boolean {
  if (filters.source !== "official" || countries === undefined) return false;
  return mapCountries.onScreen.some((countryCode) => !hasCountryCapability(countries, countryCode, "official"));
}

function lacksShownLayer(countryCode: string, hasEmfLayer: boolean, countries: CapableCountries): boolean {
  if (!hasCountryCapability(countries, countryCode, "microwaveLinks")) return true;
  return hasEmfLayer && !hasCountryCapability(countries, countryCode, "emf");
}

export function getLayersNote(filters: MapFilters, mapCountries: MapCountries, hasEmfLayer: boolean, countries: CapableCountries): LayersNote | null {
  const isEmfLayerUnavailable = hasEmfLayer && !mapCountries.capabilities.emf;
  if (!mapCountries.capabilities.microwaveLinks) return isEmfLayerUnavailable ? "linksAndEmfUnavailable" : "linksUnavailable";
  if (isEmfLayerUnavailable) return "emfUnavailable";
  if (filters.source === "official" || countries === undefined) return null;

  const showsUncoveredCountry = listAllowedCountryCodesOnScreen(filters, mapCountries, countries).some((countryCode) =>
    lacksShownLayer(countryCode, hasEmfLayer, countries),
  );
  return showsUncoveredCountry ? "sharedView" : null;
}
