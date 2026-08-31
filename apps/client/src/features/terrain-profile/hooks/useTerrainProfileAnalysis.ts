import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import { cancelTerrainProfileAnalysis, createTerrainProfileAnalysis, fetchTerrainProfileAnalysis } from "../api";
import type { TerrainProfileAnalysisRequest, TerrainProfileReceiver, TerrainProfileStationTarget } from "../types";

type UseTerrainProfileAnalysisArgs = {
  enabled: boolean;
  station: TerrainProfileStationTarget | null;
  receiver: TerrainProfileReceiver | null;
  antennaKey?: string;
  revision: number;
};

const POLL_INTERVAL_MS = 1500;

export function useTerrainProfileAnalysis({ enabled, station, receiver, antennaKey, revision }: UseTerrainProfileAnalysisArgs) {
  const request = useMemo<TerrainProfileAnalysisRequest | null>(() => {
    if (!enabled || station === null || receiver === null) return null;
    return {
      station: { source: station.source, id: station.id },
      receiver: { latitude: receiver.latitude, longitude: receiver.longitude, mountedHeight: receiver.mountedHeight },
      ...(antennaKey === undefined ? {} : { antenna_key: antennaKey }),
    };
  }, [antennaKey, enabled, receiver, station]);

  const previousAnalysisIdRef = useRef<string | undefined>(undefined);

  const creation = useQuery({
    queryKey: ["terrain-profile", "create", request, revision],
    queryFn: ({ signal }) => createTerrainProfileAnalysis(request!, signal),
    enabled: request !== null,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  const analysisId = creation.data?.analysis_id;

  useEffect(() => {
    const prev = previousAnalysisIdRef.current;
    if (prev && prev !== analysisId) void cancelTerrainProfileAnalysis(prev);
    previousAnalysisIdRef.current = analysisId;
  }, [analysisId]);

  useEffect(() => {
    return () => {
      const id = previousAnalysisIdRef.current;
      if (id) void cancelTerrainProfileAnalysis(id);
    };
  }, []);

  const polling = useQuery({
    queryKey: ["terrain-profile", "analysis", analysisId],
    queryFn: ({ signal }) => fetchTerrainProfileAnalysis(analysisId!, signal),
    enabled: analysisId !== undefined && creation.data?.status === "pending",
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? POLL_INTERVAL_MS : false),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  return {
    analysis: polling.data ?? creation.data ?? null,
    isStarting: creation.isFetching,
    isPolling: polling.isFetching,
    error: polling.error ?? creation.error,
  };
}
