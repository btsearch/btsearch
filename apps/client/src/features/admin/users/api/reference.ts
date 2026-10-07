import { queryOptions } from "@tanstack/react-query";

import type { CountryRegion } from "../types";
import { toUniqueSorted } from "../utils/ids";
import { userAdminKeys } from "./queryKeys";
import { fetchV2Data } from "@/lib/api";
import { splitIntoChunks } from "@/lib/splitIntoChunks";

const COUNTRY_CODES_PER_REQUEST = 100;

export const REFERENCE_STALE_TIME = 1000 * 60 * 30;

function fetchRegionsOfCountries(countryCodes: readonly string[], signal?: AbortSignal): Promise<CountryRegion[]> {
  const query = new URLSearchParams({ countryCodes: countryCodes.join(",") });
  return fetchV2Data<CountryRegion[]>(`regions?${query.toString()}`, { signal });
}

async function fetchCountryRegions(countryCodes: readonly string[], signal?: AbortSignal): Promise<CountryRegion[]> {
  const chunks = splitIntoChunks(countryCodes, COUNTRY_CODES_PER_REQUEST);
  const pages = await Promise.all(chunks.map((chunk) => fetchRegionsOfCountries(chunk, signal)));
  return pages.flat();
}

export function countryRegionsQueryOptions(countryCodes: readonly string[]) {
  const codes = toUniqueSorted(countryCodes);
  return queryOptions({
    queryKey: userAdminKeys.countryRegions(codes),
    queryFn: ({ signal }) => fetchCountryRegions(codes, signal),
    staleTime: REFERENCE_STALE_TIME,
  });
}
