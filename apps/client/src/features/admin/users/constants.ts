import type { UserSort } from "./types";

export const USER_LIST_MAX_LIMIT = 100;
export const USER_SEARCH_MAX_LENGTH = 100;
export const USER_LIST_SORTS = ["name", "createdAt", "-createdAt"] as const satisfies readonly UserSort[];
export const DEFAULT_USER_LIST_SORT: UserSort = "-createdAt";
export const USER_DETAIL_PRELOAD_STALE_TIME = 1000 * 10;
