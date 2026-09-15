import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { fetchAuditOperation, fetchAuditOperations } from "./api";
import type { AuditOperationFilters } from "./types";

const AUDIT_OPERATIONS_KEY = ["admin", "audit-operations"] as const;

export function auditOperationsQueryOptions(filters: AuditOperationFilters) {
  return queryOptions({
    queryKey: [...AUDIT_OPERATIONS_KEY, filters] as const,
    queryFn: ({ signal }) => fetchAuditOperations(filters, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: "always" as const,
  });
}

export function auditOperationQueryOptions(id: number) {
  return queryOptions({
    queryKey: [...AUDIT_OPERATIONS_KEY, "detail", id] as const,
    queryFn: ({ signal }) => fetchAuditOperation(id, signal),
  });
}

export function invalidateAuditOperationQueries(queryClient: QueryClient): void {
  void Promise.all([
    queryClient.invalidateQueries({ queryKey: AUDIT_OPERATIONS_KEY }),
    queryClient.invalidateQueries({ queryKey: ["admin", "dashboard", "audit-operations"] }),
    queryClient.invalidateQueries({ queryKey: ["station-history"] }),
  ]);
}
