import type { Comment, CommentInclude, CommentList, CommentListQuery, CommentStatus, CommentUpdate } from "@openbts/shared/contract";

import { API_V2_BASE, JSON_HEADERS, appendList, fetchJson, fetchV2Data } from "@/lib/api";

export type ModeratedCommentsQuery = Required<Pick<CommentListQuery, "limit" | "offset" | "sort">> &
  Pick<CommentListQuery, "statuses" | "authorIds" | "q">;

export type ModeratedCommentsPage = {
  comments: Comment[];
  total: number;
  statuses: readonly CommentStatus[];
};

export const COMMENT_TEXT_MAX_LENGTH = 1000;
export const COMMENT_SEARCH_MAX_LENGTH = 100;

const COMMENT_STATUSES: readonly CommentStatus[] = ["pending", "approved"];
const LIST_INCLUDE: CommentInclude = "station.location";
const PENDING_STATUSES: readonly CommentStatus[] = ["pending"];
const APPROVAL: CommentUpdate = { status: "approved" };
const RETURN_TO_QUEUE: CommentUpdate = { status: "pending" };

export function normalizeModeratedCommentsQuery(query: ModeratedCommentsQuery): ModeratedCommentsQuery {
  const normalized: ModeratedCommentsQuery = { limit: query.limit, offset: query.offset, sort: query.sort };
  const statuses = COMMENT_STATUSES.filter((status) => query.statuses?.includes(status));
  const authorIds = [...new Set(query.authorIds)].sort();
  const searchText = (query.q ?? "").trim().slice(0, COMMENT_SEARCH_MAX_LENGTH);

  if (statuses.length > 0 && statuses.length < COMMENT_STATUSES.length) normalized.statuses = statuses;
  if (authorIds.length > 0) normalized.authorIds = authorIds;
  if (searchText !== "") normalized.q = searchText;
  return normalized;
}

function toSearchParams(query: ModeratedCommentsQuery): URLSearchParams {
  const params = new URLSearchParams({
    include: LIST_INCLUDE,
    includeTotal: "true",
    limit: String(query.limit),
    offset: String(query.offset),
    sort: query.sort,
  });
  appendList(params, "statuses", query.statuses);
  appendList(params, "authorIds", query.authorIds);
  if (query.q !== undefined) params.set("q", query.q);
  return params;
}

export async function fetchModeratedComments(query: ModeratedCommentsQuery, signal?: AbortSignal): Promise<ModeratedCommentsPage> {
  const response = await fetchJson<CommentList>(`${API_V2_BASE}/comments?${toSearchParams(query).toString()}`, { signal });
  return { comments: response.data, total: response.paging.total ?? response.data.length, statuses: query.statuses ?? COMMENT_STATUSES };
}

export async function fetchPendingCommentCount(signal?: AbortSignal): Promise<number> {
  const params = new URLSearchParams({ limit: "1", includeTotal: "true" });
  appendList(params, "statuses", PENDING_STATUSES);
  const response = await fetchJson<CommentList>(`${API_V2_BASE}/comments?${params.toString()}`, { signal });
  return response.paging.total ?? response.data.length;
}

export function fetchModeratedStationComments(stationId: number, signal?: AbortSignal): Promise<Comment[]> {
  return fetchV2Data<Comment[]>(`stations/${stationId}/comments?includePending=true`, { signal });
}

function updateComment(commentId: string, body: CommentUpdate): Promise<Comment> {
  return fetchV2Data<Comment>(`comments/${commentId}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) });
}

export function approveComment(commentId: string): Promise<Comment> {
  return updateComment(commentId, APPROVAL);
}

export function sendCommentBackToQueue(commentId: string): Promise<Comment> {
  return updateComment(commentId, RETURN_TO_QUEUE);
}

export function updateCommentText(commentId: string, content: string): Promise<Comment> {
  return updateComment(commentId, { content });
}
