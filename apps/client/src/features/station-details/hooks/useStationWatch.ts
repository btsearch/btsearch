import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchStationWatch, unwatchStation, watchStation } from "../api";
import { showApiError } from "@/lib/api";

const stationWatchKey = (source: "internal" | "uke", stationId: number) => ["station-watch", source, stationId] as const;

export function useStationWatch(stationId: number, source: "internal" | "uke" = "internal", enabled = true) {
  const queryClient = useQueryClient();
  const queryKey = stationWatchKey(source, stationId);

  const statusQuery = useQuery({
    queryKey,
    queryFn: () => fetchStationWatch(stationId, source).then((status) => status.watched),
    enabled,
  });

  const mutation = useMutation({
    mutationFn: (watched: boolean) => (watched ? watchStation(stationId, source) : unwatchStation(stationId, source)),
    onMutate: async (watched) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<boolean>(queryKey);
      queryClient.setQueryData(queryKey, watched);
      return { previous, queryKey };
    },
    onError: (error, watched, context) => {
      queryClient.setQueryData(context?.queryKey ?? queryKey, context?.previous ?? !watched);
      showApiError(error);
    },
    onSettled: (_data, _error, _watched, context) => {
      void queryClient.invalidateQueries({ queryKey: context?.queryKey ?? queryKey });
    },
  });

  return {
    watched: statusQuery.data ?? false,
    isLoading: statusQuery.isLoading,
    isPending: mutation.isPending,
    setWatched: mutation.mutate,
  };
}
