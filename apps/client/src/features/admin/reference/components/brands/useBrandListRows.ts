import { useQuery } from "@tanstack/react-query";

import { structureOwnersQueryOptions } from "../../api/structureOwners";
import type { Brand } from "../../types";
import { type Loadable, toLoadable } from "../shared/loadable";
import { brandsQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";

export type BrandUsage = Loadable<string[]>;

export type BrandListRow = {
  brand: Brand;
  operators: BrandUsage;
  owners: BrandUsage;
};

type BrandedRecord = {
  brandId: number | null;
  name: string;
  countryCode: string | null;
};

type BrandedRecordIndex = ReadonlyMap<number, BrandedRecord[]>;

const NO_BRANDS: Brand[] = [];
const NO_RECORDS: BrandedRecord[] = [];

function groupByBrand(records: readonly BrandedRecord[]): BrandedRecordIndex {
  const recordsByBrand = new Map<number, BrandedRecord[]>();
  for (const record of records) {
    if (record.brandId === null) continue;
    const brandRecords = recordsByBrand.get(record.brandId);
    if (brandRecords) brandRecords.push(record);
    else recordsByBrand.set(record.brandId, [record]);
  }
  return recordsByBrand;
}

function listDistinctNames(records: readonly BrandedRecord[]): string[] {
  const nameCounts = new Map<string, number>();
  for (const record of records) nameCounts.set(record.name, (nameCounts.get(record.name) ?? 0) + 1);

  return records.map((record) => {
    const isNameShared = (nameCounts.get(record.name) ?? 0) > 1;
    return isNameShared && record.countryCode !== null ? `${record.name} (${record.countryCode})` : record.name;
  });
}

function getBrandUsage(recordsByBrand: BrandedRecordIndex | null, hasLoadFailed: boolean, brandId: number): BrandUsage {
  const names = recordsByBrand === null ? undefined : listDistinctNames(recordsByBrand.get(brandId) ?? NO_RECORDS);
  return toLoadable(names, hasLoadFailed);
}

export function useBrandListRows() {
  const brandsQuery = useQuery(brandsQueryOptions());
  const operatorsQuery = useQuery(operatorsQueryOptions());
  const ownersQuery = useQuery(structureOwnersQueryOptions());

  const brands = brandsQuery.data ?? NO_BRANDS;
  const operatorsByBrand = operatorsQuery.data === undefined ? null : groupByBrand(operatorsQuery.data);
  const ownersByBrand = ownersQuery.data === undefined ? null : groupByBrand(ownersQuery.data);
  const hasOperatorsLoadFailed = operatorsQuery.data === undefined && operatorsQuery.isError;
  const hasOwnersLoadFailed = ownersQuery.data === undefined && ownersQuery.isError;

  const rows = brands.map((brand): BrandListRow => ({
    brand,
    operators: getBrandUsage(operatorsByBrand, hasOperatorsLoadFailed, brand.id),
    owners: getBrandUsage(ownersByBrand, hasOwnersLoadFailed, brand.id),
  }));

  function retryUsage() {
    if (operatorsQuery.isError) void operatorsQuery.refetch();
    if (ownersQuery.isError) void ownersQuery.refetch();
  }

  return {
    rows,
    hasBrands: brandsQuery.data !== undefined,
    isFetching: brandsQuery.isFetching,
    isError: brandsQuery.isError,
    refetch: brandsQuery.refetch,
    hasUsageLoadFailed: hasOperatorsLoadFailed || hasOwnersLoadFailed,
    isRetryingUsage: operatorsQuery.isFetching || ownersQuery.isFetching,
    retryUsage,
  };
}
