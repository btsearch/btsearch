import { type QueryClient, queryOptions } from "@tanstack/react-query";

import type { StationComment } from "./types";
import { API_V2_BASE, ApiResponseError, fetchJson, fetchV2Data } from "@/lib/api";

const COMMENTS_DISABLED_CODE = "FEATURE_DISABLED";
const STATION_COMMENTS_STALE_TIME = 1000 * 60 * 5;

export const COMMENTS_OFF = null;
type StationCommentsAnswer = StationComment[] | typeof COMMENTS_OFF;

export const stationCommentKeys = {
  station: (stationId: number) => ["station-comments", stationId] as const,
  list: (stationId: number, viewerId: string | undefined) => ["station-comments", stationId, "v2", viewerId] as const,
};

function isCommentsDisabledError(error: unknown): boolean {
  return error instanceof ApiResponseError && error.errors.some(({ code }) => code === COMMENTS_DISABLED_CODE);
}

async function fetchStationComments(stationId: number, signal?: AbortSignal): Promise<StationCommentsAnswer> {
  try {
    return await fetchV2Data<StationComment[]>(`stations/${stationId}/comments`, { signal });
  } catch (error) {
    if (isCommentsDisabledError(error)) return COMMENTS_OFF;
    throw error;
  }
}

export function createStationComment(stationId: number, content: string, files: readonly File[]): Promise<StationComment> {
  const formData = new FormData();
  formData.append("content", content);
  for (const file of files) formData.append("files", file);

  return fetchV2Data<StationComment>(`stations/${stationId}/comments`, { method: "POST", body: formData });
}

export async function deleteStationComment(commentId: string): Promise<void> {
  await fetchJson(`${API_V2_BASE}/comments/${commentId}`, { method: "DELETE" });
}

export function stationCommentsQueryOptions(stationId: number, viewerId: string | undefined) {
  return queryOptions({
    queryKey: stationCommentKeys.list(stationId, viewerId),
    queryFn: ({ signal }) => fetchStationComments(stationId, signal),
    staleTime: STATION_COMMENTS_STALE_TIME,
  });
}

export function storeCreatedComment(queryClient: QueryClient, comment: StationComment): void {
  queryClient.setQueryData(stationCommentsQueryOptions(comment.stationId, comment.author.id).queryKey, (comments) => {
    if (!comments || comments.some((listedComment) => listedComment.id === comment.id)) return comments;
    return [comment, ...comments];
  });
  void queryClient.invalidateQueries({ queryKey: stationCommentKeys.station(comment.stationId) });
}
