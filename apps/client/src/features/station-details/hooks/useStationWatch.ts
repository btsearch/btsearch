import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchIsUkeStationWatched, unwatchUkeStation, watchUkeStation } from "../api";
import { fetchIsStationWatched, stationWatchKeys, unwatchStation, watchStation } from "../station/watch/api";
import { showApiError } from "@/lib/api";
import type { StationSource } from "@/types/station";

function getStationWatchKey(source: StationSource, stationId: number) {
  return source === "internal" ? stationWatchKeys.status(stationId) : (["station-watch", source, stationId] as const);
}

function fetchIsWatched(source: StationSource, stationId: number, signal: AbortSignal): Promise<boolean> {
  return source === "internal" ? fetchIsStationWatched(stationId, signal) : fetchIsUkeStationWatched(stationId);
}

function saveWatch(source: StationSource, stationId: number, watched: boolean): Promise<void> {
  if (source === "internal") return watched ? watchStation(stationId) : unwatchStation(stationId);
  return watched ? watchUkeStation(stationId) : unwatchUkeStation(stationId);
}

export function useStationWatch(stationId: number, source: StationSource = "internal", enabled = true) {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: getStationWatchKey(source, stationId),
    queryFn: ({ signal }) => fetchIsWatched(source, stationId, signal),
    enabled,
  });

  const mutation = useMutation({
    mutationKey: getStationWatchKey(source, stationId),
    mutationFn: (watched: boolean) => saveWatch(source, stationId, watched),
    onMutate: async (watched) => {
      const queryKey = getStationWatchKey(source, stationId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<boolean>(queryKey);
      queryClient.setQueryData(queryKey, watched);
      return { previous, queryKey };
    },
    onError: (error, watched, context) => {
      queryClient.setQueryData(context?.queryKey ?? getStationWatchKey(source, stationId), context?.previous ?? !watched);
      showApiError(error);
    },
    onSettled: (_data, _error, _watched, context) => {
      void queryClient.invalidateQueries({ queryKey: context?.queryKey ?? getStationWatchKey(source, stationId) });
    },
  });

  return {
    watched: statusQuery.data ?? false,
    isLoading: statusQuery.isLoading,
    isPending: mutation.isPending,
    setWatched: mutation.mutate,
  };
}
