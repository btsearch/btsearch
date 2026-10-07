import { USER_LIST_SORTS } from "../../constants";
import type { UserRole, UserSort } from "../../types";
import { USER_ROLES } from "../../utils/roles";
import { listSearchValues, parseSearchQuery, parseSearchWholeNumber } from "@/lib/urlSearch";

export type UserListStatus = "all" | "active" | "banned";

export type UserListSearch = {
  q?: string;
  roles?: string;
  status?: Exclude<UserListStatus, "all">;
  sort?: UserSort;
  page?: number;
};

export function listRoles(value: unknown): UserRole[] {
  const requestedRoles = new Set(listSearchValues(value));
  return USER_ROLES.filter((role) => requestedRoles.has(role));
}

export function joinRoles(roles: readonly UserRole[]): string | undefined {
  return roles.length > 0 ? roles.join(",") : undefined;
}

function parseStatus(value: unknown): UserListSearch["status"] {
  return value === "active" || value === "banned" ? value : undefined;
}

function parseSort(value: unknown): UserSort | undefined {
  return USER_LIST_SORTS.find((sort) => sort === value);
}

export function parseUserListSearch(search: Record<string, unknown>): UserListSearch {
  return {
    q: parseSearchQuery(search.q),
    roles: joinRoles(listRoles(search.roles)),
    status: parseStatus(search.status),
    sort: parseSort(search.sort),
    page: parseSearchWholeNumber(search.page, 1, Number.MAX_SAFE_INTEGER),
  };
}
