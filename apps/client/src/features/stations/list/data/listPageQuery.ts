import { useState } from "react";

import { getListPageCount } from "./listPaging";
import { isRejectedSearchText } from "./listRequestParams";
import type { ListReadiness } from "./useListState";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export type ListPageStatus = "waiting" | "loading" | "ready" | "empty" | "rejected" | "failed";

export type ListPageState = {
  status: ListPageStatus;
  total: number | null;
  pageCount: number;
  pageBeyondEnd: number | null;
  isUpdating: boolean;
  isSearchRejected: boolean;
  hasRefreshFailed: boolean;
  isRetrying: boolean;
  retry: () => void;
};

type ListPageCounts = {
  total: number;
  rowCount: number;
};

type ListPageQuery<Data> = {
  data: Data | undefined;
  error: unknown;
  isFetching: boolean;
  isPlaceholderData: boolean;
  refetch: () => unknown;
};

type ListPageViewInput<Data> = {
  pageQuery: ListPageQuery<Data>;
  hasRequest: boolean;
  page: number;
  pageSize: number | null;
  readiness: ListReadiness;
};

type ListPageView<Data> = ListPageState & {
  data: Data | undefined;
};

type SearchedFilters = {
  searchText: string;
};

type AppliedFilters<Filters> = {
  filters: Filters;
  key: string;
};

const SEARCH_TEXT_DELAY_MS = 400;
const FALLBACK_PAGE_SIZE = 1;

export function useAppliedListFilters<Filters extends SearchedFilters>(filters: Filters, filtersKey: string): Filters {
  const settledText = useDebouncedValue(filters.searchText, SEARCH_TEXT_DELAY_MS);
  const isTextSettled = settledText === filters.searchText || filters.searchText.trim() === "";
  const [applied, setApplied] = useState<AppliedFilters<Filters>>({ filters, key: filtersKey });

  if (isTextSettled && applied.key !== filtersKey) setApplied({ filters, key: filtersKey });
  return isTextSettled ? filters : applied.filters;
}

function useLastLoaded<Data>(data: Data | undefined): Data | undefined {
  const [lastData, setLastData] = useState(data);

  if (data !== undefined && data !== lastData) setLastData(data);
  return data ?? lastData;
}

function getBodyStatus<Data extends ListPageCounts>(shownData: Data, isAnswerToRequest: boolean, isRejected: boolean): ListPageStatus {
  if (shownData.rowCount > 0) return "ready";
  if (isRejected) return "rejected";
  return isAnswerToRequest ? "empty" : "loading";
}

export function useListPageView<Data extends ListPageCounts>({
  pageQuery,
  hasRequest,
  page,
  pageSize,
  readiness,
}: ListPageViewInput<Data>): ListPageView<Data> {
  const { data, error, isFetching, isPlaceholderData, refetch } = pageQuery;
  const lastData = useLastLoaded(data);
  const hasError = error !== null && error !== undefined;
  const isSearchRejected = hasError && isRejectedSearchText(error);
  const shownData = data ?? (isSearchRejected ? lastData : undefined);
  const answeredData = hasRequest && !isPlaceholderData ? data : undefined;
  const isAnswerToRequest = answeredData !== undefined;
  const hasRequestFailed = hasError && !isSearchRejected && data === undefined;
  const hasWaitFailed = !hasRequest && shownData === undefined && readiness.hasFailed;
  const total = shownData?.total ?? null;
  const pageCount = getListPageCount(total ?? 0, pageSize ?? FALLBACK_PAGE_SIZE);
  const isBeyondEnd = answeredData !== undefined && answeredData.rowCount === 0 && answeredData.total > 0 && page > pageCount;

  function retry() {
    if (hasWaitFailed) readiness.retry();
    else void refetch();
  }

  let status: ListPageStatus;
  if (hasRequestFailed || hasWaitFailed) status = "failed";
  else if (shownData === undefined && !hasRequest) status = "waiting";
  else if (shownData === undefined) status = isSearchRejected ? "rejected" : "loading";
  else if (isBeyondEnd) status = "loading";
  else status = getBodyStatus(shownData, isAnswerToRequest, isSearchRejected);

  return {
    status,
    data: shownData,
    total,
    pageCount,
    pageBeyondEnd: isBeyondEnd ? pageCount : null,
    isUpdating: status === "ready" && (isFetching || !isAnswerToRequest) && !isSearchRejected,
    isSearchRejected,
    hasRefreshFailed: hasError && data !== undefined && !isPlaceholderData,
    isRetrying: hasWaitFailed ? readiness.isRetrying : hasRequestFailed && isFetching,
    retry,
  };
}
