import { CheckmarkCircle02Icon, SearchRemoveIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";

import { getTickMark } from "../model/selection";
import { AnalyzerCard, StationGroupCard } from "./analyzerCard";
import { useRowOpeners } from "./analyzerCells";
import { ANALYZER_TABLE_CLASSES, type DescriptionColumn } from "./analyzerLayout";
import { AnalyzerHeadRow, AnalyzerRow, GroupTick, type StationGroupProps, StationGroupRow } from "./analyzerRow";
import { ViewSwitch } from "./analyzerToolbar";
import { listItemViews } from "./rowView";
import type { AnalyzerPageModel } from "./useAnalyzerPage";
import { ErrorState } from "@/components/ui/error-state";
import { ClearFiltersButton } from "@/features/shared/filterPanel";
import { ListTableFrame } from "@/features/stations/list/components/table/listTableFrame";
import {
  LIST_FILLED_ROWS_CLASS,
  LIST_FILLED_TABLE_CLASS,
  LIST_HEAD_GROUP_CLASS,
  LIST_SORT_BAR_CLASS,
} from "@/features/stations/list/components/table/listTableRow";
import { isListPageFilled } from "@/features/stations/list/components/table/useListTablePaging";
import type { ListPageStatus } from "@/features/stations/list/data/listPageQuery";
import { useIsCoarsePointer } from "@/hooks/useCoarsePointer";
import { cn } from "@/lib/utils";

type AnalyzerTableProps = {
  model: AnalyzerPageModel;
  column: DescriptionColumn;
  isReading: boolean;
};

type TableItemsProps = {
  model: AnalyzerPageModel;
  column: DescriptionColumn;
  isCompact: boolean;
};

const ROWS_CLASS = "transition-opacity motion-reduce:transition-none";
const DIMMED_ROWS_CLASS = "opacity-55";

function ignoreRetry(): void {
  return;
}

function getTableStatus(model: AnalyzerPageModel): ListPageStatus {
  const { filters, lookups, panel } = model;
  const isWaitingForLookups = lookups === null && !panel.hasLookupsError && filters.operatorIds.length + filters.bandKeys.length > 0;

  if (model.paging.pageSize === null || isWaitingForLookups) return "waiting";
  return model.filteredCount === 0 ? "empty" : "ready";
}

function TableItems({ model, column, isCompact }: TableItemsProps) {
  const openers = useRowOpeners();
  const isCoarsePointer = useIsCoarsePointer();
  const { session, facts, lookups, hasCountryTiles, page, selection } = model;
  const { rows, results, tables, selected } = session;
  const itemViews = listItemViews(page.items, { session: { rows, results, tables }, facts, lookups });

  return itemViews.map((item) => {
    if (item.kind === "row") {
      const { view } = item;
      const isTicked = selected.has(view.index);

      return isCompact ? (
        <AnalyzerCard
          key={item.key}
          view={view}
          isTicked={isTicked}
          hasCountryTile={hasCountryTiles}
          openers={openers}
          onToggle={selection.toggleRow}
        />
      ) : (
        <AnalyzerRow
          key={item.key}
          view={view}
          column={column}
          isTicked={isTicked}
          hasCountryTile={hasCountryTiles}
          hasRowActions={!isCoarsePointer}
          openers={openers}
          onToggle={selection.toggleRow}
        />
      );
    }

    const groupProps: StationGroupProps = {
      stationView: item.stationView,
      rowIndexes: item.rowIndexes,
      mark: getTickMark(item.rowIndexes, facts, selected),
      differenceCount: item.differenceCount,
      hasCountryTile: hasCountryTiles,
      openers,
      onToggle: selection.toggleRowGroup,
    };
    return isCompact ? <StationGroupCard key={item.key} {...groupProps} /> : <StationGroupRow key={item.key} {...groupProps} />;
  });
}

export function AnalyzerTable({ model, column, isReading }: AnalyzerTableProps) {
  const { t } = useTranslation("cellAnalyzer");
  const { session, filters, hasResults, paging, page, selection, activeFilterCount, filteredCount } = model;
  const { toggleRowGroup } = selection;
  const isRunning = session.analysis.phase === "running";
  const status = getTableStatus(model);
  const label = t("table.label");
  const rowsClassName = cn(ROWS_CLASS, isRunning || isReading ? DIMMED_ROWS_CLASS : null);
  const view = {
    status,
    total: filteredCount,
    pageCount: page.count,
    page: page.number,
    isUpdating: status === "ready" && isRunning,
    hasRefreshFailed: false,
    isRetrying: false,
    retry: ignoreRetry,
  };
  const emptyState = model.isNothingToChange ? (
    <ErrorState
      tone="neutral"
      className="flex-1"
      icon={CheckmarkCircle02Icon}
      title={t("state.allMatchTitle")}
      description={t("state.allMatchHint")}
    />
  ) : (
    <ErrorState
      tone="neutral"
      className="flex-1"
      icon={SearchRemoveIcon}
      title={t("main:search.noResults")}
      description={t("state.noRowsHint")}
      action={
        activeFilterCount > 0 ? <ClearFiltersButton count={activeFilterCount} onClick={model.clearFilters} className="cursor-pointer" /> : undefined
      }
    />
  );

  function togglePage() {
    toggleRowGroup(page.rowIndexes);
  }

  if (paging.isMobile) {
    return (
      <ListTableFrame
        paging={paging}
        view={view}
        sortBar={
          <div className={cn(LIST_SORT_BAR_CLASS, "gap-2.5 px-3")}>
            <GroupTick mark={page.mark} label={t("selection.selectPage")} onToggle={togglePage} />
            <ViewSwitch view={filters.view} isDisabled={!hasResults} className="h-7 max-sm:w-auto" onFiltersChange={model.changeFilters} />
          </div>
        }
        clearableFilterCount={activeFilterCount}
        onFiltersClear={model.clearFilters}
        emptyState={emptyState}
      >
        {status === "ready" ? (
          <ul aria-label={label} className={cn("shrink-0", rowsClassName)}>
            <TableItems model={model} column={column} isCompact />
          </ul>
        ) : null}
      </ListTableFrame>
    );
  }

  const isFilled = status === "ready" && filters.view === "cells" && isListPageFilled(paging, page.rowIndexes.length);

  return (
    <ListTableFrame paging={paging} view={view} clearableFilterCount={activeFilterCount} onFiltersClear={model.clearFilters} emptyState={emptyState}>
      <div role="table" aria-label={label} className={cn(ANALYZER_TABLE_CLASSES[column], isFilled ? LIST_FILLED_TABLE_CLASS : "shrink-0")}>
        <div role="rowgroup" className={LIST_HEAD_GROUP_CLASS}>
          <AnalyzerHeadRow column={column} mark={page.mark} onTogglePage={togglePage} />
        </div>
        {status === "ready" ? (
          <div role="rowgroup" className={cn(rowsClassName, isFilled ? LIST_FILLED_ROWS_CLASS : null)}>
            <TableItems model={model} column={column} isCompact={false} />
          </div>
        ) : null}
      </div>
    </ListTableFrame>
  );
}
