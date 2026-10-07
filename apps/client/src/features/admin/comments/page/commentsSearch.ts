import type { CommentStatus } from "@openbts/shared/contract";

import { COMMENT_SEARCH_MAX_LENGTH, type ModeratedCommentsQuery } from "../api";
import { listSearchUserIds, parseUserId } from "@/features/admin/users/utils/userId";
import { getLastOffsetPage, joinSearchValues, listSearchValues, parseSearchQuery, parseSearchWholeNumber } from "@/lib/urlSearch";

export type AdminCommentsQueue = "pending" | "approved" | "all";
export type AdminCommentsSort = ModeratedCommentsQuery["sort"];

type ShownQueueStatuses = "approved" | "pending,approved";

type AdminCommentsSearch = {
  statuses?: ShownQueueStatuses;
  authors?: string;
  author?: string;
  q?: string;
  sort?: Exclude<AdminCommentsSort, "-createdAt">;
  page?: number;
  size?: number;
};

export type AdminCommentsCriteria = {
  queue: AdminCommentsQueue;
  authorIds: string[];
  query: string;
  sort: AdminCommentsSort;
  page: number;
  pageSize: number | null;
};

export const ADMIN_COMMENTS_QUEUES: readonly AdminCommentsQueue[] = ["pending", "approved", "all"];
export const ADMIN_COMMENTS_MAX_LIMIT = 200;

const DEFAULT_ADMIN_COMMENTS_SORT: AdminCommentsSort = "-createdAt";
const ADMIN_COMMENTS_OFFSET_LIMIT = 100_000;
const MOST_AUTHOR_IDS = 100;
const STATUSES_BY_QUEUE: Record<AdminCommentsQueue, CommentStatus[]> = { pending: ["pending"], approved: ["approved"], all: ["pending", "approved"] };
const SEARCH_STATUSES_BY_QUEUE: Record<AdminCommentsQueue, ShownQueueStatuses | undefined> = {
  pending: undefined,
  approved: "approved",
  all: "pending,approved",
};

function readQueue(statuses: unknown): AdminCommentsQueue {
  const requested = new Set(listSearchValues(statuses));
  if (!requested.has("approved")) return "pending";
  return requested.has("pending") ? "all" : "approved";
}

function listAuthorIds(value: unknown): string[] {
  return listSearchUserIds(value, MOST_AUTHOR_IDS);
}

export function parseAdminCommentsSearch(search: Record<string, unknown>): AdminCommentsSearch {
  const oldLinkAuthorId = parseUserId(search.author);
  const isOldLinkToEveryStatus = oldLinkAuthorId !== undefined && search.statuses === undefined;

  return {
    statuses: SEARCH_STATUSES_BY_QUEUE[isOldLinkToEveryStatus ? "all" : readQueue(search.statuses)],
    authors: joinSearchValues(listAuthorIds(search.authors)),
    author: oldLinkAuthorId,
    q: parseSearchQuery(search.q),
    sort: search.sort === "createdAt" ? "createdAt" : undefined,
    page: parseSearchWholeNumber(search.page, 1, ADMIN_COMMENTS_OFFSET_LIMIT),
    size: parseSearchWholeNumber(search.size, 1, ADMIN_COMMENTS_MAX_LIMIT),
  };
}

export function readAdminCommentsCriteria(search: AdminCommentsSearch): AdminCommentsCriteria {
  return {
    queue: readQueue(search.statuses),
    authorIds: listAuthorIds([search.authors, search.author].join(",")),
    query: (search.q ?? "").slice(0, COMMENT_SEARCH_MAX_LENGTH).trim(),
    sort: search.sort ?? DEFAULT_ADMIN_COMMENTS_SORT,
    page: search.page ?? 0,
    pageSize: search.size ?? null,
  };
}

export function toAdminCommentsSearch(criteria: AdminCommentsCriteria): AdminCommentsSearch {
  return {
    statuses: SEARCH_STATUSES_BY_QUEUE[criteria.queue],
    authors: joinSearchValues(listAuthorIds(criteria.authorIds)),
    q: criteria.query === "" ? undefined : criteria.query,
    sort: criteria.sort === "createdAt" ? "createdAt" : undefined,
    page: criteria.page > 0 ? criteria.page : undefined,
    size: criteria.pageSize ?? undefined,
  };
}

export function getLastAdminCommentsPage(total: number, pageSize: number): number {
  return getLastOffsetPage(total, pageSize, ADMIN_COMMENTS_OFFSET_LIMIT);
}

export function toModeratedCommentsQuery(criteria: AdminCommentsCriteria, pageSize: number): ModeratedCommentsQuery {
  return {
    limit: pageSize,
    offset: Math.min(criteria.page * pageSize, ADMIN_COMMENTS_OFFSET_LIMIT),
    sort: criteria.sort,
    statuses: STATUSES_BY_QUEUE[criteria.queue],
    authorIds: criteria.authorIds,
    q: criteria.query,
  };
}
