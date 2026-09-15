import type { AdminComment } from "@/features/admin/comments/types";
import type { SubmissionListItem } from "@/features/admin/submissions/types";
import type { ImportJobStatus } from "@/features/admin/uke-import/api";
import { API_BASE, fetchApiData, fetchJson } from "@/lib/api";

export { fetchRecentAuditOperations } from "@/features/admin/audit-operations/api";

export interface DashboardStats {
  lastUpdated: {
    stations: string | null;
    stations_permits: string | null;
    radiolines: string | null;
  };
  counts: {
    locations: number;
    stations: number;
    cells: number;
    uke_locations: number;
    uke_permits: number;
    uke_radiolines: number;
  };
}

export interface DashboardDelta {
  delta: {
    weekly: {
      stations: number;
      cells: number;
      submissions: number;
    };
  };
}

export const fetchDashboardStats = () => fetchApiData<DashboardStats>("stats");
export const fetchDashboardDelta = () => fetchApiData<DashboardDelta>("stats/delta");

export const fetchPendingSubmissions = () =>
  fetchJson<{ data: SubmissionListItem[]; totalCount: number }>(`${API_BASE}/submissions/admin?status=pending&limit=25&offset=0`);

export const fetchPendingComments = () =>
  fetchJson<{ data: AdminComment[]; totalCount: number }>(`${API_BASE}/comments?status=pending&limit=25&offset=0`);

export const fetchImportStatus = () => fetchApiData<ImportJobStatus>("uke/import/status");
