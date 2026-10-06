import { SearchRemoveIcon } from "@hugeicons/core-free-icons";
import { Fragment, type ReactNode, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { ListTablePager } from "./listTablePager";
import { LIST_BOX_CLASS } from "./listTableRow";
import type { ListTablePaging } from "./useListTablePaging";
import { DataTable } from "@/components/ui/data-table";
import { ErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { ClearFiltersButton } from "@/features/shared/filterPanel";
import type { ListPageState, ListPageStatus } from "@/features/stations/list/data/listPageQuery";
import { cn } from "@/lib/utils";

type ListTableView = Pick<ListPageState, "status" | "total" | "pageCount" | "isUpdating" | "hasRefreshFailed" | "isRetrying" | "retry"> & {
  page: number;
};

type ListTableStateProps = {
  view: ListTableView;
  clearableFilterCount: number;
  onFiltersClear: () => void;
  emptyState?: ReactNode;
};

type ListTableFrameProps = ListTableStateProps & {
  paging: ListTablePaging;
  sortBar?: ReactNode;
  children: ReactNode;
};

type ListTableSkeletonProps = {
  count: number;
  children: ReactNode;
};

const NOTICE_CLASS = "absolute top-12 right-2 z-30";
const STATE_CLASS = "flex flex-1 flex-col p-3";

export function isListTableLoading(status: ListPageStatus): boolean {
  return status === "waiting" || status === "loading";
}

function ListTableNotice({ view }: { view: ListTableView }) {
  if (view.hasRefreshFailed) return <StaleDataNotice onRetry={view.retry} isRetrying={view.isUpdating} className={NOTICE_CLASS} />;
  if (view.isUpdating) return <DataTable.UpdatingIndicator className="top-12 z-30" />;
  return null;
}

function ListTableState({ view, clearableFilterCount, onFiltersClear, emptyState }: ListTableStateProps) {
  const { t } = useTranslation("main");

  if (view.status === "failed") {
    return (
      <div className={STATE_CLASS}>
        <ErrorState className="flex-1" onRetry={view.retry} isRetrying={view.isRetrying} />
      </div>
    );
  }
  if (view.status !== "empty") return null;

  return (
    <div role="status" className={STATE_CLASS}>
      {emptyState ?? (
        <ErrorState
          tone="neutral"
          className="flex-1"
          icon={SearchRemoveIcon}
          title={t("search.noResults")}
          description={t("search.noResultsHint")}
          action={
            clearableFilterCount > 0 ? (
              <ClearFiltersButton count={clearableFilterCount} onClick={onFiltersClear} className="cursor-pointer" />
            ) : undefined
          }
        />
      )}
    </div>
  );
}

export function ListTableFrame({ paging, view, sortBar, clearableFilterCount, onFiltersClear, emptyState, children }: ListTableFrameProps) {
  const isLoading = isListTableLoading(view.status);
  const hasPager = isLoading || view.status === "ready";

  const { containerRef } = paging;
  const scrollBoxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (scrollBoxRef.current !== null) scrollBoxRef.current.scrollTop = 0;
  }, [view.page]);

  return (
    <div ref={containerRef} className="relative flex min-h-0 flex-1 flex-col" aria-busy={isLoading || view.isUpdating}>
      <ListTableNotice view={view} />
      <div className={cn(LIST_BOX_CLASS, hasPager ? "rounded-t-lg border-b-0" : "rounded-lg")}>
        {sortBar}
        <div ref={scrollBoxRef} className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-auto overscroll-contain">
          {children}
          <ListTableState view={view} clearableFilterCount={clearableFilterCount} onFiltersClear={onFiltersClear} emptyState={emptyState} />
        </div>
      </div>
      {hasPager ? <ListTablePager paging={paging} page={view.page} pageCount={view.pageCount} total={view.total} /> : null}
    </div>
  );
}

export function ListTableSkeleton({ count, children }: ListTableSkeletonProps) {
  return (
    <div aria-hidden="true" className="shrink-0">
      {Array.from({ length: count }, (_, index) => (
        <Fragment key={index}>{children}</Fragment>
      ))}
    </div>
  );
}
