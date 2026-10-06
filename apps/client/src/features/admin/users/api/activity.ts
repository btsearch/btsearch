import type { Paging } from "@openbts/shared/contract";
import { queryOptions } from "@tanstack/react-query";

import { USER_DETAIL_PRELOAD_STALE_TIME } from "../constants";
import type { AuditOperation, ProfileVisibility } from "../types";
import { userAdminKeys } from "./queryKeys";
import { fetchAuditOperations } from "@/features/admin/audit-operations/api";
import { API_V2_BASE, ApiResponseError, fetchJson, isNotFound } from "@/lib/api";

const ACCOUNT_HISTORY_LIMIT = 20;
const FORBIDDEN_STATUS = 403;
const FEATURE_DISABLED_CODE = "FEATURE_DISABLED";

export type SubmissionCounts = { total: number; pending: number; accepted: number; rejected: number };
export type CommentCounts = { total: number; pending: number; approved: number };
export type UserActivityCounts = {
  submissions: SubmissionCounts | null;
  comments: CommentCounts | null;
  auditOperations: number | null;
};

type ProfileVisibilityResponse = { data: { visibility: ProfileVisibility } };

function isFeatureDisabled(error: unknown): boolean {
  if (!(error instanceof ApiResponseError) || error.status !== FORBIDDEN_STATUS) return false;
  return error.errors.some((entry) => entry.code === FEATURE_DISABLED_CODE);
}

async function fetchTotal(path: string, filters: Record<string, string>, signal?: AbortSignal): Promise<number | null> {
  const query = new URLSearchParams({ ...filters, limit: "1", includeTotal: "true" });
  try {
    const response = await fetchJson<{ paging: Paging }>(`${API_V2_BASE}/${path}?${query.toString()}`, { signal });
    return response.paging.total ?? 0;
  } catch (error) {
    if (isFeatureDisabled(error)) return null;
    throw error;
  }
}

async function fetchSubmissionCounts(userId: string, signal?: AbortSignal): Promise<SubmissionCounts | null> {
  const filters = { submitters: "all", submitterIds: userId };
  const [total, pending, rejected] = await Promise.all([
    fetchTotal("submissions", filters, signal),
    fetchTotal("submissions", { ...filters, statuses: "pending" }, signal),
    fetchTotal("submissions", { ...filters, statuses: "rejected" }, signal),
  ]);
  if (total === null || pending === null || rejected === null) return null;
  return { total, pending, accepted: Math.max(0, total - pending - rejected), rejected };
}

async function fetchCommentCounts(userId: string, signal?: AbortSignal): Promise<CommentCounts | null> {
  const filters = { authorIds: userId };
  const [total, pending] = await Promise.all([
    fetchTotal("comments", filters, signal),
    fetchTotal("comments", { ...filters, statuses: "pending" }, signal),
  ]);
  if (total === null || pending === null) return null;
  return { total, pending, approved: Math.max(0, total - pending) };
}

async function fetchUserActivityCounts(userId: string, signal?: AbortSignal): Promise<UserActivityCounts> {
  const [submissions, comments, auditOperations] = await Promise.all([
    fetchSubmissionCounts(userId, signal),
    fetchCommentCounts(userId, signal),
    fetchTotal("audit-operations", { userIds: userId }, signal),
  ]);
  return { submissions, comments, auditOperations };
}

async function fetchAccountHistory(userId: string, signal?: AbortSignal): Promise<AuditOperation[]> {
  const page = await fetchAuditOperations({ entities: ["users"], q: userId, limit: ACCOUNT_HISTORY_LIMIT }, signal);
  return page.data;
}

async function fetchProfileVisibility(username: string | null, signal?: AbortSignal): Promise<ProfileVisibility | null> {
  if (username === null) return null;
  try {
    const response = await fetchJson<ProfileVisibilityResponse>(`${API_V2_BASE}/users/${encodeURIComponent(username)}`, { signal });
    return response.data.visibility;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export function userActivityQueryOptions(userId: string) {
  return queryOptions({
    queryKey: userAdminKeys.activity(userId),
    queryFn: ({ signal }) => fetchUserActivityCounts(userId, signal),
    staleTime: USER_DETAIL_PRELOAD_STALE_TIME,
  });
}

export function accountHistoryQueryOptions(userId: string) {
  return queryOptions({
    queryKey: userAdminKeys.accountHistory(userId),
    queryFn: ({ signal }) => fetchAccountHistory(userId, signal),
    staleTime: USER_DETAIL_PRELOAD_STALE_TIME,
  });
}

export function profileVisibilityQueryOptions(userId: string, username: string | null) {
  return queryOptions({
    queryKey: userAdminKeys.profileVisibility(userId, username),
    queryFn: ({ signal }) => fetchProfileVisibility(username, signal),
    staleTime: 0,
  });
}
