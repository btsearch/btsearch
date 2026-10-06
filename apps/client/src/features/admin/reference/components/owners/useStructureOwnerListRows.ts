import { useQueries, useQuery } from "@tanstack/react-query";

import { structureOwnersQueryOptions } from "../../api/structureOwners";
import { ownerLocationCountQueryOptions } from "../../api/usage";
import type { Brand, Country, Operator, StructureOwner } from "../../types";
import { LOADING_VALUE, type Loadable, combineCountQueries } from "../shared/loadable";
import { type StructureOwnerListCriteria, filterStructureOwners } from "./structureOwnerListCriteria";
import { NO_COUNTRY_FACET, type StructureOwnerListSort } from "./structureOwnerListSearch";
import { brandsQueryOptions, countriesQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";

export type LinkedRecord<T> = { state: "none" } | { state: "loading" } | { state: "ready"; record: T };
export type OwnerOperator = { operator: Operator; brand: Brand | null };
export type OwnerLocationCount = Loadable<number>;
export type OwnerLocationCounts = ReadonlyMap<number, OwnerLocationCount>;

export type StructureOwnerListRow = {
  owner: StructureOwner;
  brand: LinkedRecord<Brand>;
  operator: LinkedRecord<OwnerOperator>;
};

type RecordIndex<T> = ReadonlyMap<number, T> | null;

const NO_OWNERS: StructureOwner[] = [];
const NO_LINK: LinkedRecord<never> = { state: "none" };
const LOADING_LINK: LinkedRecord<never> = { state: "loading" };

function indexById<T extends { id: number }>(records: readonly T[] | undefined): RecordIndex<T> {
  return records === undefined ? null : new Map(records.map((record) => [record.id, record]));
}

function linkBrand(brandId: number | null, brandById: RecordIndex<Brand>, hasLoadFailed: boolean): LinkedRecord<Brand> {
  if (brandId === null) return NO_LINK;
  if (brandById === null) return hasLoadFailed ? NO_LINK : LOADING_LINK;

  const brand = brandById.get(brandId);
  return brand === undefined ? NO_LINK : { state: "ready", record: brand };
}

function linkOperator(
  operatorId: number | null,
  operatorById: RecordIndex<Operator>,
  brandById: RecordIndex<Brand>,
  hasLoadFailed: boolean,
): LinkedRecord<OwnerOperator> {
  if (operatorId === null) return NO_LINK;
  if (operatorById === null) return hasLoadFailed ? NO_LINK : LOADING_LINK;

  const operator = operatorById.get(operatorId);
  if (operator === undefined) return NO_LINK;

  const brand = operator.brandId === null ? null : (brandById?.get(operator.brandId) ?? null);
  return { state: "ready", record: { operator, brand } };
}

function listKnownFacets(facets: readonly string[], countries: readonly Country[] | undefined): readonly string[] {
  if (countries === undefined) return facets;

  const countryCodes = new Set(countries.map((country) => country.code));
  return facets.filter((facet) => facet === NO_COUNTRY_FACET || countryCodes.has(facet));
}

function compareLocationCounts(left: OwnerLocationCount, right: OwnerLocationCount, direction: number): number {
  if (left.state !== "ready" || right.state !== "ready") return Number(left.state !== "ready") - Number(right.state !== "ready");
  return (left.value - right.value) * direction;
}

export function getOwnerLocationCount(locationCounts: OwnerLocationCounts, ownerId: number): OwnerLocationCount {
  return locationCounts.get(ownerId) ?? LOADING_VALUE;
}

export function sortStructureOwnerRows(
  rows: StructureOwnerListRow[],
  sort: StructureOwnerListSort,
  locationCounts: OwnerLocationCounts,
): StructureOwnerListRow[] {
  if (sort === "name") return rows;

  const countedRows = rows.map((row) => ({ row, locations: getOwnerLocationCount(locationCounts, row.owner.id) }));
  if (countedRows.some(({ locations }) => locations.state === "loading")) return rows;

  const direction = sort === "locations" ? 1 : -1;
  countedRows.sort((left, right) => compareLocationCounts(left.locations, right.locations, direction));
  return countedRows.map(({ row }) => row);
}

function useLocationCountsByOwner(owners: readonly StructureOwner[]): OwnerLocationCounts {
  const orderedCounts = useQueries({
    queries: owners.map((owner) => ownerLocationCountQueryOptions(owner.id)),
    combine: combineCountQueries,
  });

  return new Map(owners.map((owner, index) => [owner.id, orderedCounts[index]]));
}

export function useStructureOwnerListRows(criteria: StructureOwnerListCriteria, searchText: string) {
  const ownersQuery = useQuery(structureOwnersQueryOptions());
  const brandsQuery = useQuery(brandsQueryOptions());
  const operatorsQuery = useQuery(operatorsQueryOptions());
  const countriesQuery = useQuery(countriesQueryOptions());
  const owners = ownersQuery.data ?? NO_OWNERS;
  const locationCounts = useLocationCountsByOwner(owners);

  const brandById = indexById(brandsQuery.data);
  const operatorById = indexById(operatorsQuery.data);
  const hasBrandsLoadFailed = brandsQuery.data === undefined && brandsQuery.isError;
  const hasOperatorsLoadFailed = operatorsQuery.data === undefined && operatorsQuery.isError;
  const countryFacets = listKnownFacets(criteria.countryFacets, countriesQuery.data);

  const rows = filterStructureOwners(owners, searchText, countryFacets).map((owner): StructureOwnerListRow => ({
    owner,
    brand: linkBrand(owner.brandId, brandById, hasBrandsLoadFailed),
    operator: linkOperator(owner.operatorId, operatorById, brandById, hasOperatorsLoadFailed),
  }));

  function retryLookups() {
    if (brandsQuery.isError) void brandsQuery.refetch();
    if (operatorsQuery.isError) void operatorsQuery.refetch();
  }

  return {
    rows,
    locationCounts,
    total: owners.length,
    countries: countriesQuery.data,
    countryFacets,
    hasOwners: ownersQuery.data !== undefined,
    isFetching: ownersQuery.isFetching,
    isError: ownersQuery.isError,
    refetch: ownersQuery.refetch,
    haveLookupsFailed: hasBrandsLoadFailed || hasOperatorsLoadFailed,
    isRetryingLookups: brandsQuery.isFetching || operatorsQuery.isFetching,
    retryLookups,
  };
}
