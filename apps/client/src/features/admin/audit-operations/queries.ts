import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { fetchAuditOperation, fetchAuditOperations } from "./api";
import type { AuditOperationQuery } from "./types";

const AUDIT_OPERATIONS_KEY = ["admin", "audit-operations"] as const;

export const auditOperationKeys = {
  all: () => AUDIT_OPERATIONS_KEY,
  list: (query: AuditOperationQuery) => [...AUDIT_OPERATIONS_KEY, "v2", query] as const,
  detail: (id: number) => [...AUDIT_OPERATIONS_KEY, "v2", "detail", id] as const,
};

export function auditOperationsQueryOptions(query: AuditOperationQuery) {
  return queryOptions({
    queryKey: auditOperationKeys.list(query),
    queryFn: ({ signal }) => fetchAuditOperations(query, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: "always" as const,
  });
}

export function auditOperationQueryOptions(id: number) {
  return queryOptions({
    queryKey: auditOperationKeys.detail(id),
    queryFn: ({ signal }) => fetchAuditOperation(id, signal),
  });
}

export function invalidateAuditOperationQueries(queryClient: QueryClient): void {
  void Promise.all([
    queryClient.invalidateQueries({ queryKey: auditOperationKeys.all() }),
    queryClient.invalidateQueries({ queryKey: ["station-history"] }),
  ]);
}
