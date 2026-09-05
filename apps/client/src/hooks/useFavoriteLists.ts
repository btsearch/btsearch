import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { fetchApiData } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

import { type CloudPreferences, getCloudPreferencesQueryKey, patchCloudPreferences } from "./usePreferences";

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
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const queryKey = userId === undefined ? null : getCloudPreferencesQueryKey(userId);

  const { data: cloudPreferences } = useQuery({
    queryKey: queryKey ?? ["account-preferences", "anonymous"],
    queryFn: () => fetchApiData<CloudPreferences>("account/preferences"),
    enabled: userId !== undefined,
  });

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
    onError: (_error, _nextFavoriteUuids, context) => {
      if (queryKey === null || context?.previous === undefined) return;
      queryClient.setQueryData(queryKey, context.previous);
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
