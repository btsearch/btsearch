import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import {
  type CloudPreferences,
  cloudPreferencesQueryOptions,
  getCloudPreferencesQueryKey,
  patchCloudPreferences,
  useCloudPreferencesUserId,
} from "./usePreferences";
import { showApiError } from "@/lib/api";

type FavoriteListsMutationContext = {
  previous: CloudPreferences | undefined;
};

const EMPTY_FAVORITE_UUIDS: string[] = [];

function withFavoriteLists(current: CloudPreferences | undefined, favoriteLists: string[]): CloudPreferences {
  return {
    syncEnabled: current?.syncEnabled ?? false,
    desktop: current?.desktop ?? null,
    mobile: current?.mobile ?? null,
    clfDescriptionTemplates: current?.clfDescriptionTemplates ?? null,
    ...current,
    favoriteLists,
  };
}

export function useFavoriteLists() {
  const queryClient = useQueryClient();
  const userId = useCloudPreferencesUserId();
  const queryKey = userId === undefined ? null : getCloudPreferencesQueryKey(userId);

  const { data: cloudPreferences } = useQuery(cloudPreferencesQueryOptions(userId));

  const favoriteUuids = cloudPreferences?.favoriteLists ?? EMPTY_FAVORITE_UUIDS;
  const favoriteSet = useMemo(() => new Set(favoriteUuids), [favoriteUuids]);

  const { mutate: setFavoriteUuids } = useMutation<CloudPreferences, Error, string[], FavoriteListsMutationContext>({
    mutationFn: (nextFavoriteUuids) => patchCloudPreferences({ favoriteLists: nextFavoriteUuids }),
    onMutate: async (nextFavoriteUuids) => {
      if (queryKey === null) return { previous: undefined };

      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CloudPreferences>(queryKey);
      queryClient.setQueryData<CloudPreferences>(queryKey, (current) => withFavoriteLists(current, nextFavoriteUuids));
      return { previous };
    },
    onError: (error, _nextFavoriteUuids, context) => {
      showApiError(error);
      if (queryKey === null) return;
      if (context?.previous === undefined) void queryClient.resetQueries({ queryKey, exact: true });
      else queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      if (queryKey === null) return;
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const toggleFavorite = useCallback(
    (uuid: string) => {
      const nextFavoriteUuids = favoriteSet.has(uuid)
        ? favoriteUuids.filter((favoriteUuid) => favoriteUuid !== uuid)
        : [uuid, ...favoriteUuids.filter((favoriteUuid) => favoriteUuid !== uuid)];

      setFavoriteUuids(nextFavoriteUuids);
    },
    [favoriteSet, favoriteUuids, setFavoriteUuids],
  );

  const isFavorite = useCallback((uuid: string) => favoriteSet.has(uuid), [favoriteSet]);

  return {
    canFavorite: userId !== undefined,
    favoriteSet,
    favoriteUuids,
    isFavorite,
    toggleFavorite,
  };
}
