import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { MeasurementsPage } from "../components/measurementsPage";
import { ContributorListTable } from "./contributorListTable";
import type { ContributorSort } from "./contributorsSearch";
import { useContributorList } from "./useContributorList";
import { DataTable, getDataTableViewState } from "@/components/ui/data-table";
import { STALE_NOTICE_CORNER_CLASS, StaleDataNotice } from "@/components/ui/error-state";
import { cn } from "@/lib/utils";

type ContributorListPageProps = {
  sort: ContributorSort;
  onSortChange: (sort: ContributorSort) => void;
};

export function ContributorListPage({ sort, onSortChange }: ContributorListPageProps) {
  const navigate = useNavigate();
  const list = useContributorList(sort);
  const { paging, pages } = list;
  const { containerRef } = paging;
  const hasRows = list.rows.length > 0;

  const isLoading = !paging.isPageSizeMeasured || list.isLoading || (!hasRows && list.isPlaceholderData);
  const viewState = getDataTableViewState(isLoading, list.isError && !hasRows, hasRows);
  const hasStaleRows = list.isError && hasRows;
  const isUpdating = list.isFetching && !isLoading && !list.isError;
  const isTableScrollable = paging.pagination.pageSize > paging.autoPageSize || viewState === "error" || viewState === "empty";

  let scrollClass = isTableScrollable ? "overflow-y-auto" : "overflow-y-clip";
  if (paging.isMobile) scrollClass = "overflow-y-auto overscroll-y-contain";

  let listNotice: ReactNode = null;
  if (hasStaleRows) listNotice = <StaleDataNotice onRetry={list.refetch} isRetrying={list.isFetching} className={STALE_NOTICE_CORNER_CLASS} />;
  else if (isUpdating) listNotice = <DataTable.UpdatingIndicator className="z-40" />;

  function openContributor(userId: string) {
    void navigate({ to: "/admin/measurements/contributors/$userId", params: { userId } });
  }

  return (
    <MeasurementsPage section="contributors" isScrolling={false}>
      <div
        ref={containerRef}
        className={cn("custom-scrollbar relative min-h-0 flex-1 overflow-x-hidden", scrollClass)}
        aria-busy={isLoading || list.isFetching}
      >
        {listNotice}
        <ContributorListTable
          rows={list.rows}
          total={list.total}
          viewState={viewState}
          paging={paging}
          pageIndex={pages.pageIndex}
          hasNextPage={list.nextCursor !== null}
          sort={sort}
          isRetrying={list.isFetching}
          onSortChange={onSortChange}
          onFirstPage={pages.goFirst}
          onPreviousPage={pages.goPrevious}
          onNextPage={list.goNext}
          onRetry={list.refetch}
          onOpenContributor={openContributor}
        />
      </div>
    </MeasurementsPage>
  );
}
