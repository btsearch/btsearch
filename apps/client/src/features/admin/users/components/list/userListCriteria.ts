import { DEFAULT_USER_LIST_SORT, USER_SEARCH_MAX_LENGTH } from "../../constants";
import type { UserListParams, UserRole, UserSort } from "../../types";
import { USER_ROLES } from "../../utils/roles";
import { type UserListSearch, type UserListStatus, joinRoles, listRoles } from "./userListSearch";

export type UserListCriteria = {
  query: string;
  roles: readonly UserRole[];
  status: UserListStatus;
  sort: UserSort;
  page: number;
};

const IS_BANNED_BY_STATUS: Record<UserListStatus, boolean | null> = { all: null, active: false, banned: true };

export function readUserListCriteria(search: UserListSearch): UserListCriteria {
  return {
    query: (search.q ?? "").slice(0, USER_SEARCH_MAX_LENGTH),
    roles: listRoles(search.roles),
    status: search.status ?? "all",
    sort: search.sort ?? DEFAULT_USER_LIST_SORT,
    page: search.page ?? 0,
  };
}

export function toUserListSearch(criteria: UserListCriteria): UserListSearch {
  return {
    q: criteria.query === "" ? undefined : criteria.query,
    roles: joinRoles(USER_ROLES.filter((role) => criteria.roles.includes(role))),
    status: criteria.status === "all" ? undefined : criteria.status,
    sort: criteria.sort === DEFAULT_USER_LIST_SORT ? undefined : criteria.sort,
    page: criteria.page > 0 ? criteria.page : undefined,
  };
}

export function toUserListParams(criteria: UserListCriteria, pageSize: number): UserListParams {
  return {
    search: criteria.query,
    roles: criteria.roles,
    isBanned: IS_BANNED_BY_STATUS[criteria.status],
    sort: criteria.sort,
    limit: pageSize,
    offset: criteria.page * pageSize,
  };
}
