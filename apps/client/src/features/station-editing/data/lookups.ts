import type { Band, Brand, Country, CountryFeatures, Operator, Region, SettingsFeatures, StructureOwner } from "@openbts/shared/contract";
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { RAT_ORDER } from "../model/ratFields";
import type { Rat } from "../model/types";
import { bandPlanQueryOptions } from "@/features/admin/reference/api/bandPlan";
import { structureOwnersQueryOptions } from "@/features/admin/reference/api/structureOwners";
import { getCountryStructureOwners } from "@/features/shared/location/structureOwners";
import { bandsQueryOptions, brandsQueryOptions, countriesQueryOptions, operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { settingsQueryOptions } from "@/hooks/useSettings";
import { authClient } from "@/lib/auth/client";

type ReferenceSources = {
  countries: readonly Country[] | undefined;
  viewerId: string | null;
  retrySession: () => void;
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
  viewerId: string | null;
  retrySession: () => void;
  operators: readonly Operator[];
  brands: readonly Brand[];
  regions: readonly Region[];
  bands: readonly Band[];
  owners: readonly StructureOwner[];
  features: SettingsFeatures | null;
  countriesByCode: ReadonlyMap<string, Country>;
  operatorsById: ReadonlyMap<number, Operator>;
  regionsById: ReadonlyMap<number, Region>;
  bandsById: ReadonlyMap<number, Band>;
  ownersById: ReadonlyMap<number, StructureOwner>;
};

export type EditLookups = EditReference & {
  countryCode: string | null;
  countryFeatures: CountryFeatures | null;
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
  const { countries, operators, brands, regions, bands, owners, features } = sources;
  const isReady = [countries, operators, brands, regions, bands, owners, features].every((source) => source !== undefined);

  return {
    isReady,
    hasFailed: sources.hasFailed,
    viewerId: sources.viewerId,
    retrySession: sources.retrySession,
    operators: operators ?? [],
    brands: brands ?? [],
    regions: regions ?? [],
    bands: bands ?? [],
    owners: owners ?? [],
    features: features ?? null,
    countriesByCode: new Map((countries ?? []).map((country) => [country.code, country])),
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

function buildEditLookups(
  reference: EditReference,
  countryCode: string | null,
  plan: readonly number[] | undefined,
  featureCountryCode: string | null,
): EditLookups {
  const bandPlanIds = countryCode === null || plan === undefined ? null : new Set(plan);

  return {
    ...reference,
    isReady: reference.isReady && (countryCode === null || plan !== undefined),
    countryCode,
    countryFeatures: featureCountryCode === null ? null : (reference.countriesByCode.get(featureCountryCode)?.features ?? null),
    bandPlanIds,
    planBands: listPlanBands(reference.bands, bandPlanIds),
    countryOperators: countryCode === null ? reference.operators : reference.operators.filter((operator) => operator.countryCode === countryCode),
    countryRegions: countryCode === null ? reference.regions : reference.regions.filter((region) => region.countryCode === countryCode),
    countryOwners: getCountryStructureOwners(reference.owners, countryCode),
  };
}

export function useEditReference(): EditReference {
  const { data: session, isPending, error, refetch: retrySession } = authClient.useSession();
  const viewerId = session?.user.id ?? null;
  const viewerReady = !isPending && !error;
  const countriesQuery = useQuery({ ...countriesQueryOptions({ viewerId }), enabled: viewerReady });
  const operatorsQuery = useQuery({ ...operatorsQueryOptions({ viewerId }), enabled: viewerReady });
  const brandsQuery = useQuery(brandsQueryOptions());
  const regionsQuery = useQuery({ ...regionsQueryOptions({ viewerId }), enabled: viewerReady });
  const bandsQuery = useQuery(bandsQueryOptions());
  const ownersQuery = useQuery(structureOwnersQueryOptions());
  const settingsQuery = useQuery(settingsQueryOptions());

  const countries = viewerReady ? countriesQuery.data : undefined;
  const operators = viewerReady ? operatorsQuery.data : undefined;
  const brands = brandsQuery.data;
  const regions = viewerReady ? regionsQuery.data : undefined;
  const bands = bandsQuery.data;
  const owners = ownersQuery.data;
  const features = settingsQuery.data?.features;
  const hasFailed =
    Boolean(error) ||
    [brandsQuery, bandsQuery, ownersQuery, settingsQuery].some((query) => query.isError && query.data === undefined) ||
    (viewerReady && [countriesQuery, operatorsQuery, regionsQuery].some((query) => query.isError && query.data === undefined));

  return useMemo(
    () => buildEditReference({ countries, viewerId, retrySession, operators, brands, regions, bands, owners, features, hasFailed }),
    [countries, viewerId, retrySession, operators, brands, regions, bands, owners, features, hasFailed],
  );
}

export function useCountryLookups(reference: EditReference, countryCode: string | null, featureCountryCode: string | null): EditLookups {
  const planQuery = useQuery({ ...bandPlanQueryOptions(countryCode ?? NO_COUNTRY), enabled: countryCode !== null });
  const plan = countryCode === null ? undefined : planQuery.data;
  const hasFailed = reference.hasFailed || (countryCode !== null && planQuery.isError && plan === undefined);

  return useMemo(
    () => ({ ...buildEditLookups(reference, countryCode, plan, featureCountryCode), hasFailed }),
    [reference, countryCode, plan, featureCountryCode, hasFailed],
  );
}

export function retryEditLookups(
  queryClient: QueryClient,
  countryCode: string | null,
  reference: Pick<EditReference, "viewerId" | "retrySession">,
): Promise<void[]> {
  reference.retrySession();
  const keys: (readonly unknown[])[] = [
    countriesQueryOptions({ viewerId: reference.viewerId }).queryKey,
    operatorsQueryOptions({ viewerId: reference.viewerId }).queryKey,
    brandsQueryOptions().queryKey,
    regionsQueryOptions({ viewerId: reference.viewerId }).queryKey,
    bandsQueryOptions().queryKey,
    structureOwnersQueryOptions().queryKey,
    settingsQueryOptions().queryKey,
  ];
  if (countryCode !== null) keys.push(bandPlanQueryOptions(countryCode).queryKey);

  return Promise.all(keys.map((queryKey) => queryClient.refetchQueries({ queryKey, exact: true, type: "active" })));
}
