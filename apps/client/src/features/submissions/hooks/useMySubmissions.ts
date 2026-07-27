import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import { useInfiniteQuery } from "@tanstack/react-query";

import type { MySubmissionsFilters, MySubmissionsResponse } from "../api";
import { fetchMySubmissions } from "../api";

const LIMIT = 20;

export function useMySubmissions(userId?: string, filters: MySubmissionsFilters = {}): UseInfiniteQueryResult<InfiniteData<MySubmissionsResponse>> {
  const { status, operatorMncs, search } = filters;

  return useInfiniteQuery({
    queryKey: ["my-submissions", userId, status, operatorMncs, search],
    queryFn: ({ pageParam }) => fetchMySubmissions(LIMIT, pageParam as number, filters),
    initialPageParam: 0,
    enabled: !!userId,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.length * LIMIT;
      return fetched < lastPage.totalCount ? fetched : undefined;
    },
    staleTime: 0,
    refetchOnMount: "always",
  });
}
