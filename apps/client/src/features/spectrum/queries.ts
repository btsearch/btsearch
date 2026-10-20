import type { SpectrumHolding } from "@openbts/shared/contract";
import { queryOptions } from "@tanstack/react-query";

import type { SpectrumHoldingWithOperator } from "./model";
import { fetchV2Data } from "@/lib/api";

const SPECTRUM_HOLDINGS_STALE_TIME = 1000 * 60 * 5;

export const SPECTRUM_HOLDINGS_KEY = ["spectrum-holdings", "v2"] as const;

export function spectrumHoldingsWithOperatorQueryOptions() {
  return queryOptions({
    queryKey: [...SPECTRUM_HOLDINGS_KEY, "include=operator"] as const,
    queryFn: ({ signal }) => fetchV2Data<SpectrumHoldingWithOperator[]>("spectrum-holdings?include=operator", { signal }),
    staleTime: SPECTRUM_HOLDINGS_STALE_TIME,
  });
}

export function countrySpectrumHoldingsQueryOptions(countryCode: string) {
  return queryOptions({
    queryKey: [...SPECTRUM_HOLDINGS_KEY, countryCode] as const,
    queryFn: ({ signal }) => fetchV2Data<SpectrumHolding[]>(`spectrum-holdings?countryCodes=${encodeURIComponent(countryCode)}`, { signal }),
    staleTime: SPECTRUM_HOLDINGS_STALE_TIME,
  });
}
