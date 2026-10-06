import type { AdminListsParams } from "./api";
import { listSearchUserIds } from "@/features/admin/users/utils/userId";
import { getLastOffsetPage, joinSearchValues, parseSearchQuery, parseSearchWholeNumber } from "@/lib/urlSearch";

export type AdminListsVisibility = "all" | "public" | "private";

type AdminListsSearch = {
  q?: string;
  visibility?: Exclude<AdminListsVisibility, "all">;
  owners?: string;
  page?: number;
  size?: number;
};

export type AdminListsCriteria = {
  query: string;
  visibility: AdminListsVisibility;
  ownerIds: string[];
  page: number;
  pageSize: number | null;
};

export const ADMIN_LISTS_SEARCH_MAX_LENGTH = 100;
export const ADMIN_LISTS_MAX_LIMIT = 200;

const ADMIN_LISTS_OFFSET_LIMIT = 100_000;
const MOST_OWNER_IDS = 100;
const IS_PUBLIC_BY_VISIBILITY: Record<AdminListsVisibility, boolean | null> = { all: null, public: true, private: false };

function parseVisibility(value: unknown): AdminListsSearch["visibility"] {
  return value === "public" || value === "private" ? value : undefined;
}

function listOwnerIds(value: unknown): string[] {
  return listSearchUserIds(value, MOST_OWNER_IDS);
}

export function parseAdminListsSearch(search: Record<string, unknown>): AdminListsSearch {
  return {
    q: parseSearchQuery(search.q),
    visibility: parseVisibility(search.visibility),
    owners: joinSearchValues(listOwnerIds(search.owners)),
    page: parseSearchWholeNumber(search.page, 1, ADMIN_LISTS_OFFSET_LIMIT),
    size: parseSearchWholeNumber(search.size, 1, ADMIN_LISTS_MAX_LIMIT),
  };
}

export function readAdminListsCriteria(search: AdminListsSearch): AdminListsCriteria {
  return {
    query: (search.q ?? "").slice(0, ADMIN_LISTS_SEARCH_MAX_LENGTH).trim(),
    visibility: search.visibility ?? "all",
    ownerIds: listOwnerIds(search.owners),
    page: search.page ?? 0,
    pageSize: search.size ?? null,
  };
}

export function toAdminListsSearch(criteria: AdminListsCriteria): AdminListsSearch {
  return {
    q: criteria.query === "" ? undefined : criteria.query,
    visibility: criteria.visibility === "all" ? undefined : criteria.visibility,
    owners: joinSearchValues(listOwnerIds(criteria.ownerIds)),
    page: criteria.page > 0 ? criteria.page : undefined,
    size: criteria.pageSize ?? undefined,
  };
}

export function getLastAdminListsPage(total: number, pageSize: number): number {
  return getLastOffsetPage(total, pageSize, ADMIN_LISTS_OFFSET_LIMIT);
}

export function toAdminListsParams(criteria: AdminListsCriteria, pageSize: number): AdminListsParams {
  return {
    search: criteria.query,
    isPublic: IS_PUBLIC_BY_VISIBILITY[criteria.visibility],
    ownerIds: criteria.ownerIds,
    limit: pageSize,
    offset: Math.min(criteria.page * pageSize, ADMIN_LISTS_OFFSET_LIMIT),
  };
}
