import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useFavoriteLists } from "./useFavoriteLists";
import { useSettings } from "./useSettings";
import { ownListsQueryOptions } from "@/features/lists/api";
import { authClient } from "@/lib/auth/client";

const NAV_RECENT_LIST_LIMIT = 5;

type NavList = { uuid: string; name: string };

export function useNavLists() {
  const { data: session } = authClient.useSession();
  const { data: settings } = useSettings();
  const userId = session?.user?.id;
  const favoriteLists = useFavoriteLists();
  const { data } = useQuery({ ...ownListsQueryOptions(), enabled: userId !== undefined && settings?.features.lists === true });

  const lists = useMemo<NavList[]>(() => {
    const ownLists = data?.lists.map((list): NavList => ({ uuid: list.id, name: list.name })) ?? [];
    if (ownLists.length === 0) return [];

    const listByUuid = new Map(ownLists.map((list) => [list.uuid, list]));
    const orderedFavoriteLists = favoriteLists.favoriteUuids.reduce<NavList[]>((acc, uuid) => {
      const list = listByUuid.get(uuid);
      if (list !== undefined) acc.push(list);
      return acc;
    }, []);
    const recentLists = ownLists
      .filter((list) => !favoriteLists.favoriteSet.has(list.uuid))
      .slice(0, Math.max(0, NAV_RECENT_LIST_LIMIT - orderedFavoriteLists.length));

    return [...orderedFavoriteLists, ...recentLists];
  }, [favoriteLists.favoriteSet, favoriteLists.favoriteUuids, data]);

  return {
    ...favoriteLists,
    lists,
  };
}
