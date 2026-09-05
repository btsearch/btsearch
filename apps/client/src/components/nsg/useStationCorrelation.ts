import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { analyzeCellsInChunks } from "@/lib/analyzer/api";
import { authClient } from "@/lib/auth/client";
import {
  type NsgAnalyzerResultsByKey,
  collectNsgAnalyzerRequests,
  getNsgAnalyzerRequestsIdentity,
  mapNsgAnalyzerResults,
} from "@/lib/nsg/stationCorrelation";
import type { NsgLog } from "@/lib/nsg/types";

export type StationCorrelation = {
  correlationKey: string | null;
  resultsByKey: NsgAnalyzerResultsByKey;
  status: "unavailable" | "idle" | "pending" | "success" | "error";
  analyze: () => Promise<Error | null>;
};

const EMPTY_RESULTS: NsgAnalyzerResultsByKey = new Map();
export function useStationCorrelation(log: NsgLog | null, requested: boolean): StationCorrelation {
  const { data: session, isPending: isAuthPending } = authClient.useSession();
  const requests = useMemo(() => collectNsgAnalyzerRequests(log?.cells ?? []), [log]);
  const correlationKey = useMemo(
    () =>
      log === null
        ? null
        : JSON.stringify([log.sourceName, log.sourceBytes, log.startTimestampUs, log.endTimestampMs, getNsgAnalyzerRequestsIdentity(requests)]),
    [log, requests],
  );
  const isSignedIn = !!session?.user;
  const available = !isAuthPending && isSignedIn && correlationKey !== null && requests.length > 0;
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ["nsg", "station-correlation", correlationKey],
    queryFn: async ({ signal }) => {
      const results = await analyzeCellsInChunks(
        requests.map(({ input }) => input),
        signal,
      );
      return { correlationKey, resultsByKey: mapNsgAnalyzerResults(requests, results) };
    },
    enabled: false,
    retry: false,
  });
  const hasResults = available && requested && data?.correlationKey === correlationKey;
  const analyze = useCallback(async (): Promise<Error | null> => {
    if (!available || correlationKey === null) return null;
    if (data?.correlationKey === correlationKey) return null;
    return (await refetch()).error;
  }, [available, correlationKey, data?.correlationKey, refetch]);

  let status: StationCorrelation["status"] = "idle";
  if (!available) status = "unavailable";
  else if (requested && isFetching) status = "pending";
  else if (requested && error !== null) status = "error";
  else if (hasResults) status = "success";

  return { correlationKey, resultsByKey: hasResults ? data.resultsByKey : EMPTY_RESULTS, status, analyze };
}
