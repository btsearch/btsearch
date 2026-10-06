import type { Band, Brand, Operator, Region, SettingsFeatures, StructureOwner } from "@openbts/shared/contract";
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { RAT_ORDER } from "../model/ratFields";
import type { Rat } from "../model/types";
import { bandPlanQueryOptions } from "@/features/admin/reference/api/bandPlan";
import { structureOwnersQueryOptions } from "@/features/admin/reference/api/structureOwners";
import { getCountryStructureOwners } from "@/features/shared/location/structureOwners";
import { bandsQueryOptions, brandsQueryOptions, operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { settingsQueryOptions } from "@/hooks/useSettings";

type ReferenceSources = {
  operators: readonly Operator[] | undefined;
  brands: readonly Brand[] | undefined;
  regions: readonly Region[] | undefined;
  bands: readonly Band[] | undefined;
  owners: readonly StructureOwner[] | undefined;
  features: SettingsFeatures | undefined;
  hasFailed: boolean;
};

export type EditReference = {
  isReady: boolean;
  hasFailed: boolean;
  operators: readonly Operator[];
  brands: readonly Brand[];
  regions: readonly Region[];
  bands: readonly Band[];
  owners: readonly StructureOwner[];
  features: SettingsFeatures | null;
  operatorsById: ReadonlyMap<number, Operator>;
  regionsById: ReadonlyMap<number, Region>;
  bandsById: ReadonlyMap<number, Band>;
  ownersById: ReadonlyMap<number, StructureOwner>;
};

export type EditLookups = EditReference & {
  countryCode: string | null;
  bandPlanIds: ReadonlySet<number> | null;
  planBands: Record<Rat, Band[]>;
  countryOperators: readonly Operator[];
  countryRegions: readonly Region[];
  countryOwners: readonly StructureOwner[];
};

const NO_COUNTRY = "";
const UNLABELLED_BAND_RANK = Number.MAX_SAFE_INTEGER;

function indexById<Row extends { id: number }>(rows: readonly Row[] | undefined): Map<number, Row> {
  return new Map((rows ?? []).map((row): [number, Row] => [row.id, row]));
}

function buildEditReference(sources: ReferenceSources): EditReference {
  const { operators, brands, regions, bands, owners, features } = sources;
  const isReady = [operators, brands, regions, bands, owners, features].every((source) => source !== undefined);

  return {
    isReady,
    hasFailed: sources.hasFailed,
    operators: operators ?? [],
    brands: brands ?? [],
    regions: regions ?? [],
    bands: bands ?? [],
    owners: owners ?? [],
    features: features ?? null,
    operatorsById: indexById(operators),
    regionsById: indexById(regions),
    bandsById: indexById(bands),
    ownersById: indexById(owners),
  };
}

function compareBands(left: Band, right: Band): number {
  return (
    (left.labelMhz ?? UNLABELLED_BAND_RANK) - (right.labelMhz ?? UNLABELLED_BAND_RANK) ||
    (left.number ?? 0) - (right.number ?? 0) ||
    left.id - right.id
  );
}

function listPlanBands(bands: readonly Band[], bandPlanIds: ReadonlySet<number> | null): Record<Rat, Band[]> {
  const planBands: Record<Rat, Band[]> = { nr: [], lte: [], umts: [], gsm: [] };
  for (const rat of RAT_ORDER) {
    planBands[rat] = bands.filter((band) => band.rat === rat && (bandPlanIds === null || bandPlanIds.has(band.id))).sort(compareBands);
  }
  return planBands;
}

function buildEditLookups(reference: EditReference, countryCode: string | null, plan: readonly number[] | undefined): EditLookups {
  const bandPlanIds = countryCode === null || plan === undefined ? null : new Set(plan);

  return {
    ...reference,
    isReady: reference.isReady && (countryCode === null || plan !== undefined),
    countryCode,
    bandPlanIds,
    planBands: listPlanBands(reference.bands, bandPlanIds),
    countryOperators: countryCode === null ? reference.operators : reference.operators.filter((operator) => operator.countryCode === countryCode),
    countryRegions: countryCode === null ? reference.regions : reference.regions.filter((region) => region.countryCode === countryCode),
    countryOwners: getCountryStructureOwners(reference.owners, countryCode),
  };
}

export function useEditReference(): EditReference {
  const operatorsQuery = useQuery(operatorsQueryOptions());
  const brandsQuery = useQuery(brandsQueryOptions());
  const regionsQuery = useQuery(regionsQueryOptions());
  const bandsQuery = useQuery(bandsQueryOptions());
  const ownersQuery = useQuery(structureOwnersQueryOptions());
  const settingsQuery = useQuery(settingsQueryOptions());

  const operators = operatorsQuery.data;
  const brands = brandsQuery.data;
  const regions = regionsQuery.data;
  const bands = bandsQuery.data;
  const owners = ownersQuery.data;
  const features = settingsQuery.data?.features;
  const hasFailed = [operatorsQuery, brandsQuery, regionsQuery, bandsQuery, ownersQuery, settingsQuery].some(
    (query) => query.isError && query.data === undefined,
  );

  return useMemo(
    () => buildEditReference({ operators, brands, regions, bands, owners, features, hasFailed }),
    [operators, brands, regions, bands, owners, features, hasFailed],
  );
}

export function useCountryLookups(reference: EditReference, countryCode: string | null): EditLookups {
  const planQuery = useQuery({ ...bandPlanQueryOptions(countryCode ?? NO_COUNTRY), enabled: countryCode !== null });
  const plan = countryCode === null ? undefined : planQuery.data;
  const hasFailed = reference.hasFailed || (countryCode !== null && planQuery.isError && plan === undefined);

  return useMemo(() => ({ ...buildEditLookups(reference, countryCode, plan), hasFailed }), [reference, countryCode, plan, hasFailed]);
}

export function retryEditLookups(queryClient: QueryClient, countryCode: string | null): Promise<void[]> {
  const keys: (readonly unknown[])[] = [
    operatorsQueryOptions().queryKey,
    brandsQueryOptions().queryKey,
    regionsQueryOptions().queryKey,
    bandsQueryOptions().queryKey,
    structureOwnersQueryOptions().queryKey,
    settingsQueryOptions().queryKey,
  ];
  if (countryCode !== null) keys.push(bandPlanQueryOptions(countryCode).queryKey);

  return Promise.all(keys.map((queryKey) => queryClient.refetchQueries({ queryKey, exact: true, type: "active" })));
}
