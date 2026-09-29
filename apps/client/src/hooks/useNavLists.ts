import { useMemo } from "react";

import { useFavoriteLists } from "./useFavoriteLists";
import { useSettings } from "./useSettings";
import type { UserListSummary } from "@/features/lists/api";
import { useUserLists } from "@/features/lists/hooks/useUserLists";
import { authClient } from "@/lib/auth/client";

export const NAV_RECENT_LIST_LIMIT = 5;

export function useNavLists() {
  const { data: session } = authClient.useSession();
  const { data: settings } = useSettings();
  const userId = session?.user?.id;
  const favoriteLists = useFavoriteLists();
  const { data } = useUserLists({ enabled: userId !== undefined && settings?.enableUserLists === true });

  const lists = useMemo<UserListSummary[]>(() => {
    const ownedLists = data?.data.filter((list) => list.createdBy.uuid === userId) ?? [];
    if (ownedLists.length === 0) return [];

    const listByUuid = new Map(ownedLists.map((list) => [list.uuid, list]));
    const orderedFavoriteLists = favoriteLists.favoriteUuids.reduce<UserListSummary[]>((acc, uuid) => {
      const list = listByUuid.get(uuid);
      if (list !== undefined) acc.push(list);
      return acc;
    }, []);
    const recentLists = ownedLists
      .filter((list) => !favoriteLists.favoriteSet.has(list.uuid))
      .slice(0, Math.max(0, NAV_RECENT_LIST_LIMIT - orderedFavoriteLists.length));

    return [...orderedFavoriteLists, ...recentLists];
  }, [favoriteLists.favoriteSet, favoriteLists.favoriteUuids, data, userId]);

  return {
    ...favoriteLists,
    lists,
  };
}
