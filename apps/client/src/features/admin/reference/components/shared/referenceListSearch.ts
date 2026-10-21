import { FIRST_LIST_PAGE, LAST_LIST_PAGE, LIST_PAGE_SIZE_LIMIT, SMALLEST_LIST_PAGE_SIZE } from "@/features/stations/list/data/listPaging";
import { parseUrlNumber } from "@/features/stations/list/data/listUrlValues";

export type ReferenceListPagingSearch = {
  page?: number;
  size?: number;
};

export type ReferenceListPaging = {
  page: number;
  pageSize: number | null;
};

export function parseReferenceListPagingSearch(search: Record<string, unknown>): ReferenceListPagingSearch {
  return {
    page: parseUrlNumber(search.page, FIRST_LIST_PAGE, LAST_LIST_PAGE),
    size: parseUrlNumber(search.size, SMALLEST_LIST_PAGE_SIZE, LIST_PAGE_SIZE_LIMIT),
  };
}

export function readReferenceListPaging(search: ReferenceListPagingSearch): ReferenceListPaging {
  return { page: search.page ?? FIRST_LIST_PAGE, pageSize: search.size ?? null };
}

export function toReferenceListPagingSearch({ page, pageSize }: ReferenceListPaging): ReferenceListPagingSearch {
  return { page: page > FIRST_LIST_PAGE ? page : undefined, size: pageSize ?? undefined };
}
