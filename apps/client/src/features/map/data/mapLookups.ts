import type { Band, Brand, Country, Operator, Region } from "@openbts/shared/contract";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo } from "react";

import { UNKNOWN_BAND_LABEL } from "./mapFilters";
import { bandPlanQueryOptions } from "@/features/admin/reference/api/bandPlan";
import { bandsQueryOptions, brandsQueryOptions, countriesQueryOptions, operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { FALLBACK_BRAND_COLOR, getBrandColor, getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { type QueryLoadState, hasFailedLoad } from "@/lib/queryLoadState";
import type { StationSource } from "@/types/station";

export type MapOperator = {
  operator: Operator;
  brand: Brand | null;
  color: string;
};

export type MapOperatorGroup = {
  countryCode: string;
  main: MapOperator[];
  minor: MapOperator[];
};

export type MapLookupSources = {
  operators: readonly Operator[];
  brands: readonly Brand[];
  bands: readonly Band[];
  countries: readonly Country[];
  regions: readonly Region[];
};

export type MapLookups = MapLookupSources & {
  operatorsById: ReadonlyMap<number, MapOperator>;
  operatorGroups: ReadonlyMap<string, MapOperatorGroup>;
  bandsById: ReadonlyMap<number, Band>;
  regionsById: ReadonlyMap<number, Region>;
};

export type MapBandLabelsByCountry = ReadonlyMap<string, readonly number[]>;
export type MapMaxBounds = [[number, number], [number, number]];

type OperatorLook = {
  operator: Operator | null;
  brand: Brand | null;
  color: string;
};

type CountryBandPlan = {
  countryCode: string;
  bandIds: number[];
};

type PlanSelector = (bandIds: number[]) => CountryBandPlan;

type BandPlanQuery = QueryLoadState & {
  data: CountryBandPlan | undefined;
  refetch: () => unknown;
};

type BandPlanAnswers = {
  plans: CountryBandPlan[];
  isError: boolean;
  isRetrying: boolean;
  refetchFailedPlans: BandPlanQuery["refetch"][];
};

const UNKNOWN_OPERATOR_LOOK: OperatorLook = { operator: null, brand: null, color: FALLBACK_BRAND_COLOR };
const planSelectorsByCountry = new Map<string, PlanSelector>();
const KEYBIND_OPERATOR_COUNT = 4;
const FULL_TURN_DEGREES = 360;
const CODED_CELL_BAND_RANK = 0;
const UNCODED_CELL_BAND_RANK = 1;
const REGISTER_ONLY_BAND_RANK = 2;
const CELL_BAND_RATS: ReadonlySet<string> = new Set<Band["rat"]>(["gsm", "umts", "lte", "nr"]);
const lookupsByOperators = new WeakMap<readonly Operator[], MapLookups>();
let mountedLookupReaderCount = 0;

function compareOperatorNames(left: MapOperator, right: MapOperator): number {
  return left.operator.name.localeCompare(right.operator.name) || left.operator.id - right.operator.id;
}

function compareMainOperators(left: MapOperator, right: MapOperator): number {
  return (left.operator.sortPriority ?? 0) - (right.operator.sortPriority ?? 0) || compareOperatorNames(left, right);
}

function groupOperators(operators: Iterable<MapOperator>): Map<string, MapOperatorGroup> {
  const groups = new Map<string, MapOperatorGroup>();

  for (const entry of operators) {
    const { countryCode, sortPriority } = entry.operator;
    const group: MapOperatorGroup = groups.get(countryCode) ?? { countryCode, main: [], minor: [] };
    if (sortPriority === null) group.minor.push(entry);
    else group.main.push(entry);
    groups.set(countryCode, group);
  }

  for (const group of groups.values()) {
    group.main.sort(compareMainOperators);
    group.minor.sort(compareOperatorNames);
  }
  return groups;
}

function buildMapLookups(sources: MapLookupSources): MapLookups {
  const operatorsById = new Map(
    sources.operators.map((operator): [number, MapOperator] => {
      const brand = getOperatorBrand(operator, sources.brands);
      return [operator.id, { operator, brand, color: getBrandColor(brand) }];
    }),
  );

  return {
    ...sources,
    operatorsById,
    operatorGroups: groupOperators(operatorsById.values()),
    bandsById: new Map(sources.bands.map((band) => [band.id, band])),
    regionsById: new Map(sources.regions.map((region) => [region.id, region])),
  };
}

function hasLookupSources(lookups: MapLookups, sources: MapLookupSources): boolean {
  return (
    lookups.operators === sources.operators &&
    lookups.brands === sources.brands &&
    lookups.bands === sources.bands &&
    lookups.countries === sources.countries &&
    lookups.regions === sources.regions
  );
}

function getSharedMapLookups(sources: MapLookupSources): MapLookups {
  const knownLookups = lookupsByOperators.get(sources.operators);
  if (knownLookups !== undefined && hasLookupSources(knownLookups, sources)) return knownLookups;

  const lookups = buildMapLookups(sources);
  lookupsByOperators.set(sources.operators, lookups);
  return lookups;
}

function isFirstLookupReader(): boolean {
  return mountedLookupReaderCount === 0;
}

export function useMapLookups() {
  const operatorsQuery = useQuery({ ...operatorsQueryOptions(), refetchOnMount: isFirstLookupReader });
  const brandsQuery = useQuery({ ...brandsQueryOptions(), refetchOnMount: isFirstLookupReader });
  const bandsQuery = useQuery({ ...bandsQueryOptions(), refetchOnMount: isFirstLookupReader });
  const countriesQuery = useQuery({ ...countriesQueryOptions(), refetchOnMount: isFirstLookupReader });
  const regionsQuery = useQuery({ ...regionsQueryOptions(), refetchOnMount: isFirstLookupReader });

  useEffect(() => {
    mountedLookupReaderCount += 1;
    return () => {
      mountedLookupReaderCount -= 1;
    };
  }, []);

  const operators = operatorsQuery.data;
  const brands = brandsQuery.data;
  const bands = bandsQuery.data;
  const countries = countriesQuery.data;
  const regions = regionsQuery.data;
  const lookups =
    operators === undefined || brands === undefined || bands === undefined || countries === undefined || regions === undefined
      ? undefined
      : getSharedMapLookups({ operators, brands, bands, countries, regions });

  const queries = [operatorsQuery, brandsQuery, bandsQuery, countriesQuery, regionsQuery];

  function retry() {
    for (const query of queries) if (query.isError) void query.refetch();
  }

  return {
    lookups,
    isError: queries.some(hasFailedLoad),
    isRetrying: queries.some((query) => hasFailedLoad(query) && query.isFetching),
    retry,
  };
}

export function getOperatorLook(lookups: MapLookups | undefined, operatorId: number | null | undefined): OperatorLook {
  if (lookups === undefined || operatorId === null || operatorId === undefined) return UNKNOWN_OPERATOR_LOOK;
  return lookups.operatorsById.get(operatorId) ?? UNKNOWN_OPERATOR_LOOK;
}

export function listKeybindOperatorIds(lookups: MapLookups | undefined, countryCode: string | null): number[] {
  if (lookups === undefined || countryCode === null) return [];
  const main = lookups.operatorGroups.get(countryCode)?.main ?? [];
  return main.slice(0, KEYBIND_OPERATOR_COUNT).map((entry) => entry.operator.id);
}

export function findOperatorIdsByMncs(operators: readonly Operator[], mncs: readonly number[]): number[] {
  const plmns = new Set(mncs.map(String));
  const matching = operators.filter(
    (operator) => (operator.primaryPlmn !== null && plmns.has(operator.primaryPlmn)) || operator.plmns.some((entry) => plmns.has(entry.plmn)),
  );
  return matching.map((operator) => operator.id);
}

function getPlanSelector(countryCode: string): PlanSelector {
  const known = planSelectorsByCountry.get(countryCode);
  if (known !== undefined) return known;

  const selectPlan: PlanSelector = (bandIds) => ({ countryCode, bandIds });
  planSelectorsByCountry.set(countryCode, selectPlan);
  return selectPlan;
}

function countryBandPlanQueryOptions(countryCode: string) {
  return { ...bandPlanQueryOptions(countryCode), select: getPlanSelector(countryCode) };
}

function isCodedCellBand(band: Band): boolean {
  return band.code !== null && CELL_BAND_RATS.has(band.rat);
}

function isCellBandByDuplex(band: Band): boolean {
  return CELL_BAND_RATS.has(band.rat) && (band.rat === "gsm" || band.duplex !== null);
}

function listPlanBands(bandIds: readonly number[], bandsById: ReadonlyMap<number, Band>): Band[] {
  return bandIds.flatMap((bandId) => {
    const band = bandsById.get(bandId);
    return band === undefined ? [] : [band];
  });
}

function listCellBands(bands: readonly Band[]): Band[] {
  const codedBands = bands.filter(isCodedCellBand);
  return codedBands.length > 0 ? codedBands : bands.filter(isCellBandByDuplex);
}

function listPlanBandLabels(bandIds: readonly number[], bandsById: ReadonlyMap<number, Band>, source: StationSource): number[] {
  const planBands = listPlanBands(bandIds, bandsById);
  const shownBands = source === "uke" ? planBands : listCellBands(planBands);
  const labels = new Set<number>();

  for (const band of shownBands) {
    if (band.labelMhz !== null && band.labelMhz !== UNKNOWN_BAND_LABEL) labels.add(band.labelMhz);
  }
  return [...labels].sort((left, right) => left - right);
}

function rankBandRow(band: Band): number {
  if (!CELL_BAND_RATS.has(band.rat)) return REGISTER_ONLY_BAND_RANK;
  return band.code === null ? UNCODED_CELL_BAND_RANK : CODED_CELL_BAND_RANK;
}

export function listBandIdsByLabels(bands: readonly Band[], labels: readonly number[]): number[] {
  const wantedLabels = new Set(labels);
  const rows = bands.filter((band) => band.labelMhz !== null && wantedLabels.has(band.labelMhz));
  return rows.sort((left, right) => rankBandRow(left) - rankBandRow(right) || left.id - right.id).map((band) => band.id);
}

function collectBandPlans(planQueries: readonly BandPlanQuery[]): BandPlanAnswers {
  const failedQueries = planQueries.filter(hasFailedLoad);

  return {
    plans: planQueries.flatMap((planQuery) => (planQuery.data === undefined ? [] : [planQuery.data])),
    isError: failedQueries.length > 0,
    isRetrying: failedQueries.some((planQuery) => planQuery.isFetching),
    refetchFailedPlans: failedQueries.map((planQuery) => planQuery.refetch),
  };
}

export function useCountryBandPlans(countryCodes: readonly string[], source: StationSource, lookups: MapLookups | undefined) {
  const { plans, isError, isRetrying, refetchFailedPlans } = useQueries({
    queries: countryCodes.map((countryCode) => countryBandPlanQueryOptions(countryCode)),
    combine: collectBandPlans,
  });

  const labelsByCountry: MapBandLabelsByCountry = useMemo(() => {
    const labels = new Map<string, readonly number[]>();
    if (lookups === undefined) return labels;

    for (const plan of plans) labels.set(plan.countryCode, listPlanBandLabels(plan.bandIds, lookups.bandsById, source));
    return labels;
  }, [lookups, plans, source]);

  function retry() {
    for (const refetchPlan of refetchFailedPlans) void refetchPlan();
  }

  return { labelsByCountry, isError, isRetrying, retry };
}

export function getMapMaxBounds(countries: readonly Country[]): MapMaxBounds | undefined {
  const views = countries.flatMap((country) => (country.defaultView === null ? [] : [country.defaultView]));
  if (views.length === 0 || views.length < countries.length) return undefined;

  const west = Math.min(...views.map((view) => view.west));
  const south = Math.min(...views.map((view) => view.south));
  const east = Math.max(...views.map((view) => (view.east < view.west ? view.east + FULL_TURN_DEGREES : view.east)));
  const north = Math.max(...views.map((view) => view.north));
  if (east - west >= FULL_TURN_DEGREES) return undefined;

  return [
    [west, south],
    [east, north],
  ];
}

export function useMapMaxBounds(map: MapLibreMap | null): void {
  const { data: countries } = useQuery(countriesQueryOptions());

  useEffect(() => {
    if (map === null || countries === undefined) return;
    map.setMaxBounds(getMapMaxBounds(countries));
  }, [map, countries]);
}
