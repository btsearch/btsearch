import { queryOptions } from "@tanstack/react-query";

import type { Country, CountryCreate, CountryUpdate } from "../types";
import { referenceKeys } from "./queryKeys";
import { deleteRecord, fetchDataOrNull, patchData, postData } from "./request";
import { isCountryCode } from "@/lib/apiValues";

async function fetchCountry(code: string, signal?: AbortSignal): Promise<Country | null> {
  if (!isCountryCode(code)) return null;
  return fetchDataOrNull<Country>(`countries/${code}`, signal);
}

export function createCountry(body: CountryCreate): Promise<Country> {
  return postData<Country>("countries", body);
}

export function updateCountry(code: string, changes: CountryUpdate): Promise<Country> {
  return patchData<Country>(`countries/${encodeURIComponent(code)}`, changes);
}

export function deleteCountry(code: string): Promise<void> {
  return deleteRecord(`countries/${encodeURIComponent(code)}`);
}

export function countryQueryOptions(code: string) {
  return queryOptions({
    queryKey: referenceKeys.country(code),
    queryFn: ({ signal }) => fetchCountry(code, signal),
    staleTime: 0,
  });
}
