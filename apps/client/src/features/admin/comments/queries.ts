import type { Comment } from "@openbts/shared/contract";
import { type QueryClient, keepPreviousData, queryOptions } from "@tanstack/react-query";

import {
  type ModeratedCommentsPage,
  type ModeratedCommentsQuery,
  fetchModeratedComments,
  fetchModeratedStationComments,
  fetchPendingCommentCount,
  normalizeModeratedCommentsQuery,
} from "./api";
import { invalidateAuditOperationQueries } from "@/features/admin/audit-operations/queries";
import { userAdminKeys } from "@/features/admin/users/api/queryKeys";
import { stationCommentKeys } from "@/features/station-details/station/comments/api";
import { userProfileQueryPrefix } from "@/features/user-profile/queries";

type StationCommentsAnswer = Comment[] | null;

const COMMENT_ADMIN_ROOT = ["admin-comments"] as const;
const MODERATED_STATION_COMMENTS_STALE_TIME = 1000 * 60;

const commentAdminKeys = {
  all: () => COMMENT_ADMIN_ROOT,
  lists: () => [...COMMENT_ADMIN_ROOT, "list"] as const,
  list: (query: ModeratedCommentsQuery) => [...COMMENT_ADMIN_ROOT, "list", query] as const,
  pendingCount: () => [...COMMENT_ADMIN_ROOT, "pending-count"] as const,
  stationList: (stationId: number, viewerId: string | undefined) => [...stationCommentKeys.list(stationId, viewerId), "includePending"] as const,
};

export function moderatedCommentsQueryOptions(query: ModeratedCommentsQuery) {
  const normalized = normalizeModeratedCommentsQuery(query);

  return queryOptions({
    queryKey: commentAdminKeys.list(normalized),
    queryFn: ({ signal }) => fetchModeratedComments(normalized, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: "always" as const,
  });
}

export function pendingCommentCountQueryOptions() {
  return queryOptions({
    queryKey: commentAdminKeys.pendingCount(),
    queryFn: ({ signal }) => fetchPendingCommentCount(signal),
    staleTime: 0,
    refetchOnMount: "always" as const,
  });
}

export function moderatedStationCommentsQueryOptions(stationId: number, viewerId: string | undefined) {
  return queryOptions({
    queryKey: commentAdminKeys.stationList(stationId, viewerId),
    queryFn: ({ signal }) => fetchModeratedStationComments(stationId, signal),
    staleTime: MODERATED_STATION_COMMENTS_STALE_TIME,
  });
}

function replaceListedComment(listed: readonly Comment[], changed: Comment): Comment[] {
  return listed.map((comment) => (comment.id === changed.id ? { ...comment, ...changed } : comment));
}

function dropPageComment(page: ModeratedCommentsPage, commentId: string): ModeratedCommentsPage {
  const comments = page.comments.filter((comment) => comment.id !== commentId);
  if (comments.length === page.comments.length) return page;
  return { ...page, comments, total: Math.max(0, page.total - 1) };
}

export function storeChangedComment(queryClient: QueryClient, changed: Comment): void {
  queryClient.setQueriesData<ModeratedCommentsPage>({ queryKey: commentAdminKeys.lists() }, (page) => {
    if (page === undefined) return page;
    if (!page.statuses.includes(changed.status)) return dropPageComment(page, changed.id);
    return { ...page, comments: replaceListedComment(page.comments, changed) };
  });
  queryClient.setQueriesData<StationCommentsAnswer>({ queryKey: stationCommentKeys.station(changed.stationId) }, (listed) =>
    listed ? replaceListedComment(listed, changed) : listed,
  );
}

export function storeDeletedComment(queryClient: QueryClient, deleted: Pick<Comment, "id" | "stationId">): void {
  queryClient.setQueriesData<ModeratedCommentsPage>({ queryKey: commentAdminKeys.lists() }, (page) =>
    page === undefined ? page : dropPageComment(page, deleted.id),
  );
  queryClient.setQueriesData<StationCommentsAnswer>({ queryKey: stationCommentKeys.station(deleted.stationId) }, (listed) =>
    listed ? listed.filter((comment) => comment.id !== deleted.id) : listed,
  );
}

export function invalidateCommentQueries(queryClient: QueryClient, comment: Pick<Comment, "stationId" | "author">): void {
  const { author } = comment;
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: commentAdminKeys.all() }),
    queryClient.invalidateQueries({ queryKey: stationCommentKeys.station(comment.stationId) }),
    queryClient.invalidateQueries({ queryKey: userAdminKeys.activity(author.id) }),
  ];
  if (author.username !== null) invalidations.push(queryClient.invalidateQueries({ queryKey: userProfileQueryPrefix(author.username) }));

  void Promise.all(invalidations);
  invalidateAuditOperationQueries(queryClient);
}
