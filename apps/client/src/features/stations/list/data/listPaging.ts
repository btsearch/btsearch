const LIST_OFFSET_LIMIT = 100_000;

export const FIRST_LIST_PAGE = 1;
export const LAST_LIST_PAGE = LIST_OFFSET_LIMIT + FIRST_LIST_PAGE;
export const SMALLEST_LIST_PAGE_SIZE = 1;
export const LIST_PAGE_SIZE_LIMIT = 200;

export function clampListPageSize(pageSize: number): number {
  return Math.min(LIST_PAGE_SIZE_LIMIT, Math.max(SMALLEST_LIST_PAGE_SIZE, Math.round(pageSize)));
}

export function getListOffset(page: number, pageSize: number): number {
  return Math.min(LIST_OFFSET_LIMIT, (Math.max(FIRST_LIST_PAGE, page) - FIRST_LIST_PAGE) * pageSize);
}

export function getListPageCount(total: number, pageSize: number): number {
  const reachablePageCount = Math.floor(LIST_OFFSET_LIMIT / pageSize) + FIRST_LIST_PAGE;
  return Math.max(FIRST_LIST_PAGE, Math.min(Math.ceil(total / pageSize), reachablePageCount));
}

export function rescaleListPage(page: number, pageSize: number, nextPageSize: number): number {
  const firstRowIndex = Math.max(0, (page - FIRST_LIST_PAGE) * pageSize);
  return Math.floor(firstRowIndex / nextPageSize) + FIRST_LIST_PAGE;
}
