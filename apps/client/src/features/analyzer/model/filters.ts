import type { Band, CellRat } from "@openbts/shared/contract";

import { UNKNOWN_BAND_KEY, getBandFacetKey, getBandFacetLabel } from "./bands";
import type { AnalyzerLookups, DifferenceField, DifferenceFilter, DifferenceKind, RowFacts, RowStatus } from "./types";
import { canMarkCountries, markSingleCountryKeys } from "@/features/map/components/search-overlay/mapFilterPanelRules";
import type { MapOperator, MapOperatorGroup } from "@/features/map/data/mapLookups";
import { FIRST_LIST_PAGE } from "@/features/stations/list/data/listPaging";

export const ROW_STATUSES = ["found", "probable", "notFound"] as const;
export const ANALYZER_VIEWS = ["cells", "stations"] as const;
export const ANALYZER_SORTS = ["file", "station", "result"] as const;
export const ANALYZER_RATS: readonly CellRat[] = ["gsm", "umts", "lte", "nr"];
export const ANY_DIFFERENCE = "any";
export const DIFFERENCE_FIELDS: readonly DifferenceField[] = ["lac", "rnc", "uarfcn", "tac", "pci", "earfcn", "arfcn", "psc", "bsic"];
export const DIFFERENCE_KIND_ORDER: readonly DifferenceKind[] = [
  "tac",
  "pci",
  "no-pci",
  "new",
  "lac",
  "rnc",
  "earfcn",
  "uarfcn",
  "arfcn",
  "no-tac",
  "no-lac",
  "no-rnc",
  "no-earfcn",
  "no-uarfcn",
  "no-arfcn",
  "psc",
  "no-psc",
  "bsic",
  "no-bsic",
  "by-lac",
  "shared",
  "unknown-cell",
  "unknown-operator",
  "no-identifiers",
];

export type AnalyzerFilters = {
  statuses: (typeof ROW_STATUSES)[number][];
  kinds: DifferenceFilter[];
  rats: CellRat[];
  operatorIds: number[];
  bandKeys: string[];
  isUnconfirmedOnly: boolean;
  view: (typeof ANALYZER_VIEWS)[number];
  sort: (typeof ANALYZER_SORTS)[number];
  page: number;
  pageSize: number | null;
};

export type FacetCounts = {
  statuses: Record<(typeof ROW_STATUSES)[number], number>;
  kinds: ReadonlyMap<DifferenceFilter, number>;
  rats: Record<CellRat, number>;
  operators: ReadonlyMap<number, number>;
  bands: ReadonlyMap<string, number>;
  unconfirmed: number;
};

export type BandFacet = { key: string; label: string | null; count: number; markCountryCode: string | null };

type KeyedBand = { key: string; band: Band | undefined };

export const DEFAULT_ANALYZER_FILTERS: AnalyzerFilters = {
  statuses: [],
  kinds: [],
  rats: [],
  operatorIds: [],
  bandKeys: [],
  isUnconfirmedOnly: false,
  view: "cells",
  sort: "file",
  page: FIRST_LIST_PAGE,
  pageSize: null,
};

const MOST_PINNED_KINDS = 4;
const CHANGE_KINDS: ReadonlySet<DifferenceKind> = new Set<DifferenceKind>([
  "new",
  ...DIFFERENCE_FIELDS,
  ...DIFFERENCE_FIELDS.map((field): DifferenceKind => `no-${field}`),
]);
const BAND_RAT_RANKS: Partial<Record<Band["rat"], number>> = { lte: 0, nr: 1, umts: 2, gsm: 3 };
const OTHER_RAT_RANK = 4;
const UNNUMBERED_BAND = Number.MAX_SAFE_INTEGER;

export function countActiveAnalyzerFilters(filters: AnalyzerFilters, hasResults: boolean): number {
  const beforeAnalysis = filters.rats.length + filters.operatorIds.length + filters.bandKeys.length;
  if (!hasResults) return beforeAnalysis;
  return beforeAnalysis + filters.statuses.length + filters.kinds.length + (filters.isUnconfirmedOnly ? 1 : 0);
}

export function clearAnalyzerFilters(filters: AnalyzerFilters): AnalyzerFilters {
  return { ...DEFAULT_ANALYZER_FILTERS, view: filters.view, sort: filters.sort, pageSize: filters.pageSize };
}

function getAnalyzerCriteriaKey(filters: AnalyzerFilters): string {
  return JSON.stringify([
    filters.statuses,
    filters.kinds,
    filters.rats,
    filters.operatorIds,
    filters.bandKeys,
    filters.isUnconfirmedOnly,
    filters.view,
    filters.sort,
  ]);
}

export function moveAnalyzerToFirstPage(current: AnalyzerFilters, next: AnalyzerFilters): AnalyzerFilters {
  if (next.page !== current.page || getAnalyzerCriteriaKey(current) === getAnalyzerCriteriaKey(next)) return next;
  return { ...next, page: FIRST_LIST_PAGE };
}

export function isChangeKind(kind: DifferenceKind): boolean {
  return CHANGE_KINDS.has(kind);
}

function hasAnyDifference(row: RowFacts): boolean {
  return row.kinds.some(isChangeKind);
}

export function listFilteredIndexes(facts: readonly RowFacts[], filters: AnalyzerFilters, hasResults: boolean): number[] {
  const statuses: ReadonlySet<RowStatus> = new Set(hasResults ? filters.statuses : []);
  const kinds: ReadonlySet<DifferenceFilter> = new Set(hasResults ? filters.kinds : []);
  const rats = new Set(filters.rats);
  const operatorIds = new Set(filters.operatorIds);
  const bandKeys = new Set(filters.bandKeys);
  const isUnconfirmedOnly = hasResults && filters.isUnconfirmedOnly;
  const indexes: number[] = [];

  for (const [index, row] of facts.entries()) {
    if (statuses.size > 0 && !statuses.has(row.status)) continue;
    if (kinds.size > 0 && !(kinds.has(ANY_DIFFERENCE) && hasAnyDifference(row)) && !row.kinds.some((kind) => kinds.has(kind))) continue;
    if (rats.size > 0 && !rats.has(row.rat)) continue;
    if (operatorIds.size > 0 && (row.operatorId === null || !operatorIds.has(row.operatorId))) continue;
    if (bandKeys.size > 0 && !bandKeys.has(row.bandKey)) continue;
    if (isUnconfirmedOnly && !row.isUnconfirmed) continue;
    indexes.push(index);
  }
  return indexes;
}

function addOne<Key>(counts: Map<Key, number>, key: Key): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

export function countFacets(facts: readonly RowFacts[]): FacetCounts {
  const statuses: FacetCounts["statuses"] = { found: 0, probable: 0, notFound: 0 };
  const rats: FacetCounts["rats"] = { gsm: 0, umts: 0, lte: 0, nr: 0 };
  const kinds = new Map<DifferenceFilter, number>([[ANY_DIFFERENCE, 0]]);
  const operators = new Map<number, number>();
  const bands = new Map<string, number>();
  let unconfirmed = 0;

  for (const row of facts) {
    if (row.status !== "pending") statuses[row.status] += 1;
    rats[row.rat] += 1;
    if (hasAnyDifference(row)) addOne(kinds, ANY_DIFFERENCE);
    for (const kind of new Set(row.kinds)) addOne(kinds, kind);
    if (row.operatorId !== null) addOne(operators, row.operatorId);
    addOne(bands, row.bandKey);
    if (row.isUnconfirmed) unconfirmed += 1;
  }
  return { statuses, kinds, rats, operators, bands, unconfirmed };
}

export function listKindPills(counts: FacetCounts, ticked: readonly DifferenceFilter[]): { pinned: DifferenceFilter[]; folded: DifferenceFilter[] } {
  const tickedKinds = new Set(ticked);
  const presentKinds = DIFFERENCE_KIND_ORDER.filter((kind) => (counts.kinds.get(kind) ?? 0) > 0);
  const alwaysOpenKinds = new Set<DifferenceFilter>(presentKinds.slice(0, MOST_PINNED_KINDS));

  return {
    pinned: [ANY_DIFFERENCE, ...DIFFERENCE_KIND_ORDER.filter((kind) => alwaysOpenKinds.has(kind) || tickedKinds.has(kind))],
    folded: presentKinds.filter((kind) => !alwaysOpenKinds.has(kind) && !tickedKinds.has(kind)),
  };
}

function listPlanBandKeys(countryCode: string, lookups: AnalyzerLookups): string[] {
  const keys = new Set<string>();
  for (const bandId of lookups.planBandIdsByCountry.get(countryCode) ?? []) keys.add(getBandFacetKey(lookups.bandsById.get(bandId)));
  keys.delete(UNKNOWN_BAND_KEY);
  return [...keys];
}

function findFileBands(facts: readonly RowFacts[], lookups: AnalyzerLookups): Map<string, Band> {
  const bandsByKey = new Map<string, Band>();

  for (const row of facts) {
    if (row.bandId === null || bandsByKey.has(row.bandKey)) continue;
    const band = lookups.bandsById.get(row.bandId);
    if (band !== undefined) bandsByKey.set(row.bandKey, band);
  }
  return bandsByKey;
}

function compareBandFacets(left: KeyedBand, right: KeyedBand): number {
  if (left.key === UNKNOWN_BAND_KEY || right.key === UNKNOWN_BAND_KEY) {
    return Number(left.key === UNKNOWN_BAND_KEY) - Number(right.key === UNKNOWN_BAND_KEY);
  }
  if (left.band === undefined || right.band === undefined) {
    return Number(left.band === undefined) - Number(right.band === undefined) || left.key.localeCompare(right.key);
  }
  return (
    (BAND_RAT_RANKS[left.band.rat] ?? OTHER_RAT_RANK) - (BAND_RAT_RANKS[right.band.rat] ?? OTHER_RAT_RANK) ||
    (left.band.number ?? UNNUMBERED_BAND) - (right.band.number ?? UNNUMBERED_BAND) ||
    (left.band.labelMhz ?? 0) - (right.band.labelMhz ?? 0) ||
    left.key.localeCompare(right.key)
  );
}

export function listBandFacets(
  facts: readonly RowFacts[],
  counts: FacetCounts,
  lookups: AnalyzerLookups,
  countryCodes: readonly string[],
  ticked: readonly string[],
): BandFacet[] {
  const fileBands = findFileBands(facts, lookups);
  const canMark = canMarkCountries(countryCodes, (countryCode) => lookups.planBandIdsByCountry.has(countryCode));
  const marks = canMark ? markSingleCountryKeys(countryCodes, (countryCode) => listPlanBandKeys(countryCode, lookups)) : new Map<string, string>();
  const keys = new Set([...counts.bands.keys(), ...ticked]);

  return [...keys]
    .map((key) => ({ key, band: fileBands.get(key) ?? lookups.bands.find((band) => getBandFacetKey(band) === key) }))
    .sort(compareBandFacets)
    .map(({ key, band }) => ({
      key,
      label: band === undefined || key === UNKNOWN_BAND_KEY ? null : getBandFacetLabel(band),
      count: counts.bands.get(key) ?? 0,
      markCountryCode: key === UNKNOWN_BAND_KEY ? null : (marks.get(key) ?? null),
    }));
}

export function listFileCountryCodes(facts: readonly RowFacts[]): string[] {
  const countryCodes = new Set<string>();
  for (const row of facts) if (row.countryCode !== null) countryCodes.add(row.countryCode);
  return [...countryCodes];
}

export function listFileOperatorGroups(counts: FacetCounts, lookups: AnalyzerLookups): Map<string, MapOperatorGroup> {
  const groups = new Map<string, MapOperatorGroup>();

  function isInFile(entry: MapOperator): boolean {
    return counts.operators.has(entry.operator.id);
  }

  for (const [countryCode, group] of lookups.operatorGroups) {
    const main = group.main.filter(isInFile);
    const minor = group.minor.filter(isInFile);
    if (main.length + minor.length > 0) groups.set(countryCode, { countryCode, main, minor });
  }
  return groups;
}
