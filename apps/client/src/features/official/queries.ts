import type { OfficialSource } from "@openbts/shared/contract";
import { OFFICIAL_SITE_INCLUDES, type OfficialSiteInclude } from "@openbts/shared/contract/constants";
import { queryOptions, useQuery } from "@tanstack/react-query";

import { type LicenseeListParams, fetchLicensees, fetchOfficialBandLabels, fetchOfficialSite, fetchOfficialSources } from "./api";
import { findCountrySourceName, listSiteSources } from "./sources";
import { fetchAllPages } from "@/lib/api";

type LicenseeFilters = Pick<LicenseeListParams, "ids" | "sourceKeys" | "hasOperator" | "hasMicrowaveLinks">;

const OFFICIAL_ROOT = ["official"] as const;
const SOURCES_STALE_TIME = 1000 * 60 * 60;
const LOOKUP_STALE_TIME = 1000 * 60 * 5;
const LICENSEES_PER_PAGE = 1000;
const NO_SOURCES: readonly OfficialSource[] = [];

function orderSiteIncludes(include: readonly OfficialSiteInclude[]): OfficialSiteInclude[] {
  return OFFICIAL_SITE_INCLUDES.filter((value) => include.includes(value));
}

export const officialKeys = {
  all: OFFICIAL_ROOT,
  sources: () => [...OFFICIAL_ROOT, "sources"] as const,
  bandLabels: () => [...OFFICIAL_ROOT, "band-labels"] as const,
  site: (id: number, include: readonly OfficialSiteInclude[]) => [...OFFICIAL_ROOT, "sites", id, orderSiteIncludes(include)] as const,
  siteWatch: (id: number) => [...OFFICIAL_ROOT, "site-watches", id] as const,
  licensees: (filters: LicenseeFilters) => [...OFFICIAL_ROOT, "licensees", filters] as const,
};

export function officialSourcesQueryOptions() {
  return queryOptions({
    queryKey: officialKeys.sources(),
    queryFn: ({ signal }) => fetchOfficialSources(signal),
    staleTime: SOURCES_STALE_TIME,
  });
}

export function officialBandLabelsQueryOptions() {
  return queryOptions({
    queryKey: officialKeys.bandLabels(),
    queryFn: ({ signal }) => fetchOfficialBandLabels(signal),
    staleTime: LOOKUP_STALE_TIME,
  });
}

export function officialSiteQueryOptions(id: number, include: readonly OfficialSiteInclude[]) {
  return queryOptions({
    queryKey: officialKeys.site(id, include),
    queryFn: ({ signal }) => fetchOfficialSite(id, include, signal),
    staleTime: LOOKUP_STALE_TIME,
  });
}

export function licenseesQueryOptions(filters: LicenseeFilters) {
  return queryOptions({
    queryKey: officialKeys.licensees(filters),
    queryFn: ({ signal }) => fetchAllPages((cursor) => fetchLicensees({ ...filters, limit: LICENSEES_PER_PAGE, cursor }, signal)),
    staleTime: LOOKUP_STALE_TIME,
  });
}

export function useOfficialSource(sourceKey: string | undefined): OfficialSource | null {
  const { data } = useQuery({
    ...officialSourcesQueryOptions(),
    select: (sources) => sources.find((source) => source.key === sourceKey) ?? null,
    enabled: sourceKey !== undefined,
  });
  return data ?? null;
}

export function useOfficialSourcesOnScreen(countryCodes: readonly string[]): readonly OfficialSource[] {
  const { data } = useQuery({
    ...officialSourcesQueryOptions(),
    select: (sources) => sources.filter((source) => countryCodes.includes(source.countryCode)),
  });
  return data ?? NO_SOURCES;
}

export function useSiteSources(countryCode: string | null): readonly OfficialSource[] {
  const { data } = useQuery({ ...officialSourcesQueryOptions(), select: (sources) => listSiteSources(sources, countryCode) });
  return data ?? NO_SOURCES;
}

export function useCountrySourceName(countryCode: string | null): string | null {
  const { data } = useQuery({ ...officialSourcesQueryOptions(), select: (sources) => findCountrySourceName(sources, countryCode) });
  return data ?? null;
}
