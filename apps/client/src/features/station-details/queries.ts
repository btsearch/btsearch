import type { OfficialPermit } from "@openbts/shared/contract";
import { queryOptions, skipToken, useQuery } from "@tanstack/react-query";

import { fetchStationPermits } from "./api";
import { officialKeys, useCountrySourceName, useOfficialSource } from "@/features/official/queries";

function selectFirstSourceKey(permits: OfficialPermit[]): string | undefined {
  return permits.at(0)?.sourceKey;
}

export function stationPermitsQueryOptions(stationId: number | undefined) {
  return queryOptions({
    queryKey: [...officialKeys.all, "station-permits", stationId] as const,
    queryFn: stationId === undefined ? skipToken : ({ signal }) => fetchStationPermits(stationId, signal),
    staleTime: 1000 * 60 * 10,
  });
}

export function useStationPermitsSourceName(stationId: number | undefined, countryCode: string | null): string | null {
  const { data: sourceKey } = useQuery({ ...stationPermitsQueryOptions(stationId), select: selectFirstSourceKey });
  const permitsSource = useOfficialSource(sourceKey);
  const countrySourceName = useCountrySourceName(countryCode);
  return permitsSource?.shortName ?? countrySourceName;
}
