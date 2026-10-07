import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { stationBreakdownQueryOptions } from "../../api/statistics";
import type { Brand, Country, Operator } from "../../types";
import { indexBreakdown } from "../../utils/bands";
import { type Loadable, toLoadable } from "../shared/loadable";
import type { OperatorListSort } from "./operatorListCriteria";
import { listCountryOptions } from "@/features/admin/users/utils/grants";
import { brandsQueryOptions, countriesQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";
import { getCountryName } from "@/lib/geo/countryName";

export type OperatorNetworkRef = {
  id: number;
  name: string;
  brand: Brand | null;
};

export type OperatorListRow = {
  operator: Operator;
  brand: Brand | null;
  networks: OperatorNetworkRef[];
  countryName: string;
  stationCount: Loadable<number>;
};

export type OperatorListSecondaryFailure = "brands" | "stations";

type OperatorListFilters = {
  searchText: string;
  countryCodes: readonly string[];
  sort: OperatorListSort;
};

const NO_OPERATORS: Operator[] = [];
const NO_BRANDS: Brand[] = [];
const NO_COUNTRIES: Country[] = [];
const UNKNOWN_STATIONS = -1;
const WHITESPACE = /\s+/g;

function matchesSearch(operator: Operator, searchText: string, plmnText: string): boolean {
  if (searchText === "") return true;
  if (operator.name.toLowerCase().includes(searchText) || operator.legalName.toLowerCase().includes(searchText)) return true;
  if (operator.shortCode !== null && operator.shortCode.toLowerCase().includes(searchText)) return true;
  return plmnText !== "" && operator.plmns.some((plmn) => plmn.plmn.includes(plmnText));
}

function getKnownStations(row: OperatorListRow): number {
  return row.stationCount.state === "ready" ? row.stationCount.value : UNKNOWN_STATIONS;
}

function sortRows(rows: OperatorListRow[], sort: OperatorListSort, language: string): OperatorListRow[] {
  if (sort === "name") return [...rows].sort((left, right) => left.operator.name.localeCompare(right.operator.name, language));
  if (sort === "-stations") return [...rows].sort((left, right) => getKnownStations(right) - getKnownStations(left));
  if (sort === "stations") return [...rows].sort((left, right) => getKnownStations(left) - getKnownStations(right));
  return rows;
}

export function useOperatorListRows({ searchText, countryCodes, sort }: OperatorListFilters) {
  const { i18n } = useTranslation();
  const operatorsQuery = useQuery(operatorsQueryOptions());
  const brandsQuery = useQuery(brandsQueryOptions());
  const countriesQuery = useQuery(countriesQueryOptions());
  const breakdownQuery = useQuery(stationBreakdownQueryOptions("operator"));

  const language = i18n.language;
  const operators = operatorsQuery.data ?? NO_OPERATORS;
  const countries = countriesQuery.data;
  const brandsById = new Map((brandsQuery.data ?? NO_BRANDS).map((brand) => [brand.id, brand]));
  const operatorsById = new Map(operators.map((operator) => [operator.id, operator]));
  const stationTotals = breakdownQuery.data === undefined ? null : indexBreakdown(breakdownQuery.data, "operatorId");
  const countryOptions = listCountryOptions(countries ?? NO_COUNTRIES, language);
  const existingCountryCodes = new Set(countryOptions.map((country) => country.code));
  const selectedCountryCodes = countries === undefined ? countryCodes : countryCodes.filter((code) => existingCountryCodes.has(code));
  const selectedCountries = new Set(selectedCountryCodes);
  const normalizedSearch = searchText.trim().toLowerCase();
  const plmnSearch = normalizedSearch.replace(WHITESPACE, "");

  function findBrand(brandId: number | null): Brand | null {
    return brandId === null ? null : (brandsById.get(brandId) ?? null);
  }

  function getStationCount(operatorId: number): Loadable<number> {
    const stations = stationTotals === null ? undefined : (stationTotals.get(operatorId)?.stations ?? 0);
    return toLoadable(stations, breakdownQuery.isError);
  }

  function listNetworks(operator: Operator): OperatorNetworkRef[] {
    const networks: OperatorNetworkRef[] = [];
    for (const link of operator.links) {
      const network = operatorsById.get(link.operatorId);
      if (network !== undefined) networks.push({ id: network.id, name: network.name, brand: findBrand(network.brandId) });
    }
    return networks;
  }

  function toRow(operator: Operator): OperatorListRow {
    return {
      operator,
      brand: findBrand(operator.brandId),
      networks: listNetworks(operator),
      countryName: getCountryName(operator.countryCode, language),
      stationCount: getStationCount(operator.id),
    };
  }

  function retrySecondary() {
    if (brandsQuery.isError) void brandsQuery.refetch();
    if (breakdownQuery.isError) void breakdownQuery.refetch();
  }

  const sortedRows = sortRows(operators.map(toRow), sort, language);
  const rows = sortedRows.filter(
    ({ operator }) =>
      (selectedCountries.size === 0 || selectedCountries.has(operator.countryCode)) && matchesSearch(operator, normalizedSearch, plmnSearch),
  );
  const hasLoadFailed = operatorsQuery.data === undefined && operatorsQuery.isError;
  let secondaryFailure: OperatorListSecondaryFailure | null = null;
  if (brandsQuery.data === undefined && brandsQuery.isError) secondaryFailure = "brands";
  else if (breakdownQuery.data === undefined && breakdownQuery.isError) secondaryFailure = "stations";

  return {
    rows,
    total: operators.length,
    countryOptions,
    selectedCountryCodes,
    hasLoadFailed,
    isLoading: !hasLoadFailed && (operatorsQuery.data === undefined || brandsQuery.isPending),
    hasStaleRows: operatorsQuery.data !== undefined && operatorsQuery.isError,
    isFetching: operatorsQuery.isFetching,
    refetch: operatorsQuery.refetch,
    secondaryFailure,
    isRetryingSecondary: brandsQuery.isFetching || breakdownQuery.isFetching,
    retrySecondary,
  };
}
