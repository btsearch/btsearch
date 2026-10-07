import type { Submission, SubmissionAction, SubmissionList, SubmissionListQuery, SubmissionStatus } from "@openbts/shared/contract";
import { queryOptions } from "@tanstack/react-query";

import type { SubmissionListFilters, SubmissionListRow } from "./types";
import { resolveDisplayName } from "@/features/admin/users/utils/identity";
import type { CellOperation } from "@/features/submissions/types";
import { API_V2_BASE, appendList, fetchJson } from "@/lib/api";

type AdminSubmissionListRequest = {
  userId: string | undefined;
  pageIndex: number;
  pageSize: number;
  sortOrder: "asc" | "desc";
  search: string;
  filters: SubmissionListFilters;
};

type AdminSubmissionListQuery = Required<Pick<SubmissionListQuery, "limit" | "offset" | "sort">> &
  Pick<SubmissionListQuery, "statuses" | "actions" | "q" | "submitterIds" | "countryCodes" | "operatorIds" | "regionIds">;

type AdminSubmissionListPage = {
  rows: SubmissionListRow[];
  total: number;
};

const SEARCH_MAX_LENGTH = 100;
const OFFSET_LIMIT = 100_000;
const V1_STATUSES: Record<SubmissionStatus, SubmissionListRow["status"]> = { pending: "pending", accepted: "approved", rejected: "rejected" };
const V1_TYPES: Record<SubmissionAction, SubmissionListRow["type"]> = { create: "new", update: "update", delete: "delete" };
const V1_CELL_OPERATIONS: Record<SubmissionAction, CellOperation> = { create: "add", update: "update", delete: "delete" };

function getLastPageIndex(pageSize: number): number {
  return Math.floor(OFFSET_LIMIT / pageSize);
}

export function toV1SubmissionStatus(status: SubmissionStatus): SubmissionListRow["status"] {
  return V1_STATUSES[status];
}

export function toV1SubmissionType(action: SubmissionAction): SubmissionListRow["type"] {
  return V1_TYPES[action];
}

export function toV1CellOperation(action: SubmissionAction): CellOperation {
  return V1_CELL_OPERATIONS[action];
}

export function clampSubmissionListPage(pageIndex: number, pageSize: number): number {
  return Math.min(pageIndex, getLastPageIndex(pageSize));
}

export function getSubmissionListPageCount(total: number, pageSize: number): number {
  return Math.min(Math.ceil(total / pageSize), getLastPageIndex(pageSize) + 1);
}

export function toSubmissionListRow(submission: Submission): SubmissionListRow {
  const { station, changes, submitter } = submission;

  return {
    id: submission.id,
    countryCode: submission.countryCode,
    status: toV1SubmissionStatus(submission.status),
    type: toV1SubmissionType(submission.action),
    siteId: station?.siteId ?? changes.station?.siteId ?? null,
    operatorId: station?.operatorId ?? changes.station?.operatorId ?? null,
    submitter:
      submitter === null ? null : { id: submitter.id, name: resolveDisplayName(submitter), image: submitter.image, username: submitter.username },
    cells: changes.cells.map((cell) => ({ operation: toV1CellOperation(cell.action) })),
    createdAt: submission.createdAt,
    reviewedAt: submission.reviewedAt,
  };
}

function toAdminSubmissionListQuery({ pageIndex, pageSize, sortOrder, search, filters }: AdminSubmissionListRequest): AdminSubmissionListQuery {
  const query: AdminSubmissionListQuery = {
    limit: pageSize,
    offset: clampSubmissionListPage(pageIndex, pageSize) * pageSize,
    sort: sortOrder === "asc" ? "createdAt" : "-createdAt",
  };
  const searchText = search.trim().slice(0, SEARCH_MAX_LENGTH);

  if (filters.status !== "all") query.statuses = [filters.status];
  if (filters.type !== "all") query.actions = [filters.type];
  if (searchText !== "") query.q = searchText;
  if (filters.submitterIds.length > 0) query.submitterIds = filters.submitterIds;
  if (filters.countryCodes.length > 0) query.countryCodes = filters.countryCodes;
  if (filters.operatorIds.length > 0) query.operatorIds = filters.operatorIds;
  if (filters.regionIds.length > 0) query.regionIds = filters.regionIds;
  return query;
}

function toSearchParams(query: AdminSubmissionListQuery): URLSearchParams {
  const params = new URLSearchParams({
    submitters: "all",
    include: "station",
    includeTotal: "true",
    limit: String(query.limit),
    offset: String(query.offset),
    sort: query.sort,
  });
  appendList(params, "statuses", query.statuses);
  appendList(params, "actions", query.actions);
  appendList(params, "submitterIds", query.submitterIds);
  appendList(params, "countryCodes", query.countryCodes);
  appendList(params, "operatorIds", query.operatorIds);
  appendList(params, "regionIds", query.regionIds);
  if (query.q !== undefined) params.set("q", query.q);
  return params;
}

async function fetchAdminSubmissions(query: AdminSubmissionListQuery, signal?: AbortSignal): Promise<AdminSubmissionListPage> {
  const response = await fetchJson<SubmissionList>(`${API_V2_BASE}/submissions?${toSearchParams(query).toString()}`, { signal });
  const rows = response.data.map(toSubmissionListRow);
  return { rows, total: response.paging.total ?? rows.length };
}

export function adminSubmissionsQueryOptions(request: AdminSubmissionListRequest) {
  const query = toAdminSubmissionListQuery(request);

  return queryOptions({
    queryKey: ["admin", "submissions", "v2", request.userId, query] as const,
    enabled: request.userId !== undefined,
    queryFn: ({ signal }) => fetchAdminSubmissions(query, signal),
    placeholderData: (previousData, previousQuery) => (previousQuery?.queryKey[3] === request.userId ? previousData : undefined),
    staleTime: 0,
    refetchOnMount: "always" as const,
  });
}
