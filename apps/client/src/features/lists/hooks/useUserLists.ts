import { useQuery } from "@tanstack/react-query";

import { fetchUserLists } from "../api";

const USER_LISTS_LIMIT = 50;

export function useUserLists({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["user-lists", "mine"],
    queryFn: () => fetchUserLists(USER_LISTS_LIMIT, 1),
    enabled,
  });
}
