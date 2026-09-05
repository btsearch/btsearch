import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

type QueryKeyPredicate = (queryKey: readonly unknown[]) => boolean;

function includeAllQueries(): boolean {
  return true;
}

function isQueryFamily(queryKey: readonly unknown[], queryFamilies: ReadonlySet<string>): boolean {
  const family = queryKey[0];
  return typeof family === "string" && queryFamilies.has(family);
}

function isManagedQuery(queryKey: readonly unknown[], queryFamilies: ReadonlySet<string>, isInScope: QueryKeyPredicate): boolean {
  return isQueryFamily(queryKey, queryFamilies) && isInScope(queryKey);
}

type UseMapQueryHousekeepingOptions = {
  bounds: string;
  isMoving: boolean;
  queryFamilies: ReadonlySet<string>;
  isInScope?: QueryKeyPredicate;
};

export function useMapQueryHousekeeping({ bounds, isMoving, queryFamilies, isInScope = includeAllQueries }: UseMapQueryHousekeepingOptions): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isMoving || !bounds) return;
    void queryClient.cancelQueries({
      predicate: (query) => isManagedQuery(query.queryKey, queryFamilies, isInScope) && query.queryKey[1] === bounds,
    });
  }, [bounds, isInScope, isMoving, queryClient, queryFamilies]);

  useEffect(() => {
    if (!bounds) return;
    queryClient.removeQueries({
      predicate: (query) =>
        isManagedQuery(query.queryKey, queryFamilies, isInScope) &&
        typeof query.queryKey[1] === "string" &&
        query.queryKey[1].includes(",") &&
        query.queryKey[1] !== bounds &&
        query.getObserversCount() === 0,
    });
  }, [bounds, isInScope, queryClient, queryFamilies]);
}
