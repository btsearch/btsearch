import { queryOptions } from "@tanstack/react-query";

import { QUEUE_PAGE_SIZE, fetchPendingSubmissionQueue } from "./api";
import { fetchAuditOperations } from "@/features/admin/audit-operations/api";
import { auditOperationKeys } from "@/features/admin/audit-operations/queries";
import type { AuditOperationQuery } from "@/features/admin/audit-operations/types";
import type { ModeratedCommentsQuery } from "@/features/admin/comments/api";
import { editingKeys } from "@/features/station-editing/data/keys";

const RECENT_OPERATIONS_STALE_TIME = 30_000;
const RECENT_OPERATIONS_QUERY: AuditOperationQuery = { include: ["stations"], limit: QUEUE_PAGE_SIZE };

export const PENDING_COMMENTS_QUERY: ModeratedCommentsQuery = { statuses: ["pending"], sort: "createdAt", limit: QUEUE_PAGE_SIZE, offset: 0 };

export function pendingSubmissionsQueryOptions() {
  return queryOptions({
    queryKey: [...editingKeys.dashboardPendingSubmissions, "v2"] as const,
    queryFn: ({ signal }) => fetchPendingSubmissionQueue(signal),
    staleTime: 0,
    refetchOnMount: "always" as const,
  });
}

export function recentOperationsQueryOptions() {
  return queryOptions({
    queryKey: auditOperationKeys.list(RECENT_OPERATIONS_QUERY),
    queryFn: ({ signal }) => fetchAuditOperations(RECENT_OPERATIONS_QUERY, signal),
    staleTime: RECENT_OPERATIONS_STALE_TIME,
  });
}
