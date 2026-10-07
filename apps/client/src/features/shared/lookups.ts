import type { Band, Brand, Country, Operator, Region } from "@openbts/shared/contract";
import { queryOptions } from "@tanstack/react-query";

import { fetchV2Data } from "@/lib/api";

const LOOKUP_STALE_TIME = 1000 * 60 * 5;

type LookupQueryScope = {
  countryCode?: string;
  viewerId?: string | null;
};

function lookupQueryKey(name: string, scope?: LookupQueryScope) {
  const key = [name, "v2"];
  if (scope?.countryCode !== undefined) key.push(scope.countryCode);
  return scope?.viewerId === undefined ? key : [...key, "viewer", scope.viewerId];
}

function lookupFetchOptions(signal: AbortSignal, scope?: LookupQueryScope) {
  return scope?.viewerId === undefined ? { signal } : { signal, cache: "no-store" as const };
}

export function brandsQueryOptions() {
  return queryOptions({
    queryKey: ["brands", "v2"] as const,
    queryFn: ({ signal }) => fetchV2Data<Brand[]>("brands", { signal }),
    staleTime: LOOKUP_STALE_TIME,
  });
}

export function operatorsQueryOptions(scope?: Pick<LookupQueryScope, "viewerId">) {
  return queryOptions({
    queryKey: lookupQueryKey("operators", scope),
    queryFn: ({ signal }) => fetchV2Data<Operator[]>("operators", lookupFetchOptions(signal, scope)),
    staleTime: LOOKUP_STALE_TIME,
  });
}

export function countriesQueryOptions(scope?: Pick<LookupQueryScope, "viewerId">) {
  return queryOptions({
    queryKey: lookupQueryKey("countries", scope),
    queryFn: ({ signal }) => fetchV2Data<Country[]>("countries", lookupFetchOptions(signal, scope)),
    staleTime: LOOKUP_STALE_TIME,
  });
}

export function bandsQueryOptions(scope?: LookupQueryScope) {
  return queryOptions({
    queryKey: lookupQueryKey("bands", scope),
    queryFn: ({ signal }) => {
      const countryCode = scope?.countryCode;
      const path = countryCode === undefined ? "bands" : `bands?countryCodes=${encodeURIComponent(countryCode)}`;
      return fetchV2Data<Band[]>(path, lookupFetchOptions(signal, scope));
    },
    staleTime: LOOKUP_STALE_TIME,
  });
}

export function regionsQueryOptions(scope?: LookupQueryScope) {
  return queryOptions({
    queryKey: lookupQueryKey("regions", scope),
    queryFn: ({ signal }) => {
      const countryCode = scope?.countryCode;
      const path = countryCode === undefined ? "regions" : `regions?countryCodes=${encodeURIComponent(countryCode)}`;
      return fetchV2Data<Region[]>(path, lookupFetchOptions(signal, scope));
    },
    staleTime: LOOKUP_STALE_TIME,
  });
}

export function findOperator(operators: readonly Operator[] | undefined, operatorId: number | null): Operator | null {
  if (operators === undefined || operatorId === null) return null;
  return operators.find((operator) => operator.id === operatorId) ?? null;
}
