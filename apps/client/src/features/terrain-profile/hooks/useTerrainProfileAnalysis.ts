import { skipToken, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { TerrainProfileCancelledError, type TerrainRequestFailure, classifyTerrainRequestError, fetchSettledTerrainProfile } from "../api";
import type { TerrainProfileRecord, TerrainProfileRequest } from "../types";

export type TerrainProfileAnalysis = {
  profile: TerrainProfileRecord | null;
  requestFailure: TerrainRequestFailure | null;
  isCalculating: boolean;
  isCancelled: boolean;
  retry: () => void;
};

const IDLE_QUERY_KEY = ["terrain-profile", "idle"] as const;
const TERRAIN_PROFILE_GC_TIME = 1000 * 60 * 60;

export function getTerrainProfileQueryKey({ station, receiver, antennaKey }: TerrainProfileRequest) {
  return ["terrain-profile", station.source, station.id, antennaKey ?? null, receiver.latitude, receiver.longitude, receiver.heightMeters] as const;
}

export function useTerrainProfileAnalysis(request: TerrainProfileRequest | null): TerrainProfileAnalysis {
  const { data, error, isFetching, isPending, refetch } = useQuery({
    queryKey: request === null ? IDLE_QUERY_KEY : getTerrainProfileQueryKey(request),
    queryFn: request === null ? skipToken : ({ signal }) => fetchSettledTerrainProfile(request, signal),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: TERRAIN_PROFILE_GC_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const retry = useCallback(() => void refetch(), [refetch]);

  const isCalculating = request !== null && (isFetching || isPending);
  const hasSettledError = request !== null && !isCalculating && error !== null;
  const isCancelled = hasSettledError && error instanceof TerrainProfileCancelledError;

  return {
    profile: request === null ? null : (data ?? null),
    requestFailure: hasSettledError && !isCancelled ? classifyTerrainRequestError(error) : null,
    isCalculating,
    isCancelled,
    retry,
  };
}
