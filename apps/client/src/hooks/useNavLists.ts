import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { type UserListSummary, fetchUserLists } from "@/features/lists/api";
import { authClient } from "@/lib/auth/client";

import { useFavoriteLists } from "./useFavoriteLists";

export const NAV_LIST_FETCH_LIMIT = 10;
export const NAV_RECENT_LIST_LIMIT = 5;

export function useNavLists() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const favoriteLists = useFavoriteLists();

  const query = useQuery({
    queryKey: ["user-lists", { limit: NAV_LIST_FETCH_LIMIT }],
    queryFn: () => fetchUserLists(NAV_LIST_FETCH_LIMIT, 1),
    enabled: userId !== undefined,
  });

  const lists = useMemo<UserListSummary[]>(() => {
    const ownedLists = query.data?.data.filter((list) => list.createdBy.uuid === userId) ?? [];
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
  }, [favoriteLists.favoriteSet, favoriteLists.favoriteUuids, query.data?.data, userId]);

  return {
    ...favoriteLists,
    lists,
  };
}
