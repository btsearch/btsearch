import { Delete02Icon, Search01Icon, Sorting05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { useCallback, useMemo, useReducer } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { UKESourceBadge } from "@/components/cellular/ukeSourceBadge";
import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DATA_TABLE_HEADER_HEIGHT,
  DATA_TABLE_PAGINATION_HEIGHT,
  DATA_TABLE_ROW_HEIGHT,
  DataTable,
  getDataTableViewState,
} from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { StaleDataNotice } from "@/components/ui/error-state";
import { Label } from "@/components/ui/label";
import { useNavActionTarget } from "@/contexts/navActions";
import { DatePickerButton } from "@/features/admin/audit-operations/components/datePickerButton";
import { deletedEntriesQueryOptions } from "@/features/deleted-entries/api";
import { DeletedEntriesMobileFilterRail } from "@/features/deleted-entries/components/deletedEntriesMobileFilterRail";
import {
  DELETED_ENTRY_MOBILE_ROW_HEIGHT,
  type DeletedEntriesEmptyState,
  DeletedEntriesMobileList,
} from "@/features/deleted-entries/components/deletedEntriesMobileList";
import { DeletedEntriesSearchField } from "@/features/deleted-entries/components/deletedEntriesSearchField";
import { DeletedEntryDetailSheet } from "@/features/deleted-entries/components/deletedEntryDetailSheet";
import { DeletedEntryIdentifier } from "@/features/deleted-entries/components/deletedEntryIdentifier";
import { DELETED_ENTRIES_MAX_PAGE_SIZE, DELETED_ENTRY_SOURCE_FILTERS } from "@/features/deleted-entries/constants";
import { getDeletedEntryAriaLabel, getDeletedEntryCreatedAt, getDeletedEntrySourceFilterLabel } from "@/features/deleted-entries/labels";
import type { DeletedEntriesSort, DeletedEntry, DeletedEntrySourceFilter } from "@/features/deleted-entries/types";
import { ClearFiltersButton, MobileFilterRailInline } from "@/features/shared/filterPanel";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useIsMobile } from "@/hooks/useMobile";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { formatFullDate } from "@/lib/format";
import { buildStaticPageHead } from "@/lib/seo";
import { type AppTableFeatures, appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

const TABLE_PAGINATION_CONFIG = {
  rowHeight: DATA_TABLE_ROW_HEIGHT,
  headerHeight: DATA_TABLE_HEADER_HEIGHT,
  paginationHeight: DATA_TABLE_PAGINATION_HEIGHT,
  minRows: 1,
};
const MOBILE_PAGINATION_CONFIG = {
  rowHeight: DELETED_ENTRY_MOBILE_ROW_HEIGHT,
  headerHeight: DATA_TABLE_HEADER_HEIGHT,
  paginationHeight: 51,
  minRows: 1,
};
const SEARCH_DEBOUNCE_MS = 300;
const SORT_ASC_STYLE = { transform: "scaleY(-1)" };
const EMPTY_ENTRIES: DeletedEntry[] = [];

const columnHelper = createColumnHelper<AppTableFeatures, DeletedEntry>();

type DeletedEntriesState = {
  source: DeletedEntrySourceFilter;
  dateFrom: string;
  dateTo: string;
  searchInput: string;
  search: string;
  sort: DeletedEntriesSort;
  detailEntry: DeletedEntry | null;
  isDetailOpen: boolean;
};

type DeletedEntriesAction =
  | { type: "SET_SOURCE"; payload: DeletedEntrySourceFilter }
  | { type: "SET_DATE_FROM"; payload: string }
  | { type: "SET_DATE_TO"; payload: string }
  | { type: "SET_SEARCH_INPUT"; payload: string }
  | { type: "SET_SEARCH"; payload: string }
  | { type: "TOGGLE_SORT" }
  | { type: "OPEN_DETAIL"; payload: DeletedEntry }
  | { type: "CLOSE_DETAIL" }
  | { type: "CLEAR_FILTERS" };

function deletedEntriesReducer(state: DeletedEntriesState, action: DeletedEntriesAction): DeletedEntriesState {
  switch (action.type) {
    case "SET_SOURCE":
      return { ...state, source: action.payload };
    case "SET_DATE_FROM":
      return { ...state, dateFrom: action.payload };
    case "SET_DATE_TO":
      return { ...state, dateTo: action.payload };
    case "SET_SEARCH_INPUT":
      return { ...state, searchInput: action.payload };
    case "SET_SEARCH":
      return { ...state, search: action.payload };
    case "TOGGLE_SORT":
      return { ...state, sort: state.sort === "desc" ? "asc" : "desc" };
    case "OPEN_DETAIL":
      return { ...state, detailEntry: action.payload, isDetailOpen: true };
    case "CLOSE_DETAIL":
      return { ...state, isDetailOpen: false };
    case "CLEAR_FILTERS":
      return { ...state, source: "all", dateFrom: "", dateTo: "", searchInput: "", search: "" };
  }
}

const initialState: DeletedEntriesState = {
  source: "all",
  dateFrom: "",
  dateTo: "",
  searchInput: "",
  search: "",
  sort: "desc",
  detailEntry: null,
  isDetailOpen: false,
};

function DeletedEntriesPage() {
  "use no memo";
  const { t, i18n } = useTranslation(["deletedEntries", "common", "stationDetails"]);
  const locale = i18n.language;
  const navActionTarget = useNavActionTarget();
  const isMobile = useIsMobile();
  const hasFloatingMobileFilters = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  const [state, dispatch] = useReducer(deletedEntriesReducer, initialState);
  const { source, dateFrom, dateTo, searchInput, search, sort, detailEntry, isDetailOpen } = state;

  const desktopPagination = useTablePagination(TABLE_PAGINATION_CONFIG);
  const mobilePagination = useTablePagination(MOBILE_PAGINATION_CONFIG);
  const { setPagination: setDesktopPagination } = desktopPagination;
  const { setPagination: setMobilePagination } = mobilePagination;
  const activePagination = isMobile ? mobilePagination : desktopPagination;
  const { containerRef, pagination, setPagination, autoPageSize, pageSizeOptions, isPageSizeMeasured } = activePagination;

  const resetPage = useCallback(() => {
    setDesktopPagination((previous) => ({ ...previous, pageIndex: 0 }));
    setMobilePagination((previous) => ({ ...previous, pageIndex: 0 }));
  }, [setDesktopPagination, setMobilePagination]);
  const debouncedSearchUpdate = useDebouncedCallback(applySearch, SEARCH_DEBOUNCE_MS);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    ...deletedEntriesQueryOptions({
      page: pagination.pageIndex + 1,
      limit: pagination.pageSize,
      sort,
      source,
      from: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
      to: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
      search: search || undefined,
    }),
    enabled: isPageSizeMeasured,
  });

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("deleted_at", {
          header: () => (
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-foreground -ml-1 px-1 py-0.5 rounded transition-colors"
              onClick={() => {
                dispatch({ type: "TOGGLE_SORT" });
                resetPage();
              }}
            >
              {t("deletedEntries.columns.deletedAt")}
              <HugeiconsIcon icon={Sorting05Icon} className="size-3.5 text-foreground" style={sort === "asc" ? SORT_ASC_STYLE : undefined} />
            </button>
          ),
          size: 190,
          cell: ({ getValue }) => (
            <time dateTime={getValue()} className="text-xs tabular-nums text-muted-foreground">
              {formatFullDate(getValue(), locale)}
            </time>
          ),
        }),
        columnHelper.display({
          id: "createdAt",
          header: t("deletedEntries.columns.createdAt"),
          size: 190,
          cell: ({ row }) => {
            const createdAt = getDeletedEntryCreatedAt(row.original);
            return createdAt === null ? (
              <span className="text-xs text-muted-foreground">-</span>
            ) : (
              <time dateTime={createdAt} className="text-xs tabular-nums text-muted-foreground">
                {formatFullDate(createdAt, locale)}
              </time>
            );
          },
        }),
        columnHelper.accessor("source_type", {
          header: t("deletedEntries.columns.sourceType"),
          size: 140,
          cell: ({ getValue }) => <UKESourceBadge source={getValue()} />,
        }),
        columnHelper.accessor("source_id", {
          header: t("deletedEntries.columns.sourceId"),
          size: 110,
          cell: ({ getValue }) => <span className="text-xs font-mono text-muted-foreground">#{getValue()}</span>,
        }),
        columnHelper.display({
          id: "identifier",
          header: t("deletedEntries.columns.identifier"),
          size: 240,
          cell: ({ row }) => <DeletedEntryIdentifier entry={row.original} />,
        }),
        columnHelper.accessor("import_id", {
          header: t("deletedEntries.columns.importId"),
          size: 90,
          cell: ({ getValue }) => {
            const importId = getValue();
            return importId !== null ? (
              <span className="text-xs font-mono text-muted-foreground">#{importId}</span>
            ) : (
              <span className="text-muted-foreground text-xs">-</span>
            );
          },
        }),
      ]),
    [t, sort, locale, resetPage],
  );
  const sorting = useMemo(() => [{ id: "deleted_at", desc: sort === "desc" }], [sort]);

  const entries = data?.data ?? EMPTY_ENTRIES;
  const total = data?.totalCount ?? 0;

  const table = useTable({
    features: appTableFeatures,
    data: entries,
    columns,
    manualPagination: true,
    manualSorting: true,
    pageCount: Math.ceil(total / pagination.pageSize),
    state: { pagination, sorting },
    onPaginationChange: setPagination,
  });

  const activeFilterCount = [source !== "all", dateFrom !== "", dateTo !== "", searchInput.trim() !== ""].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;
  const showInitialLoading = !isPageSizeMeasured || isLoading;
  const showError = isError && entries.length === 0;
  const showStaleNotice = isError && entries.length > 0;
  const showUpdating = isFetching && !isLoading && !isError;
  const viewState = getDataTableViewState(showInitialLoading, showError, entries.length > 0);
  const isTableScrollable = pagination.pageSize > autoPageSize || viewState === "error" || viewState === "empty";
  const entriesPageSizeOptions = pageSizeOptions.filter((pageSize) => pageSize <= DELETED_ENTRIES_MAX_PAGE_SIZE);

  function applySearch(value: string): void {
    if (value === search) return;
    dispatch({ type: "SET_SEARCH", payload: value });
    resetPage();
  }

  function handleSearchChange(value: string): void {
    dispatch({ type: "SET_SEARCH_INPUT", payload: value });
    const normalized = value.trim();
    debouncedSearchUpdate(normalized);
    if (normalized === "") applySearch("");
  }

  function handleSourceChange(value: DeletedEntrySourceFilter): void {
    dispatch({ type: "SET_SOURCE", payload: value });
    resetPage();
  }

  function handleDateFromChange(value: string): void {
    dispatch({ type: "SET_DATE_FROM", payload: value });
    resetPage();
  }

  function handleDateToChange(value: string): void {
    dispatch({ type: "SET_DATE_TO", payload: value });
    resetPage();
  }

  function toggleSort(): void {
    dispatch({ type: "TOGGLE_SORT" });
    resetPage();
  }

  function clearAllFilters(): void {
    debouncedSearchUpdate("");
    dispatch({ type: "CLEAR_FILTERS" });
    resetPage();
  }

  function openEntry(entry: DeletedEntry): void {
    dispatch({ type: "OPEN_DETAIL", payload: entry });
  }

  const emptyState: DeletedEntriesEmptyState = hasActiveFilters
    ? {
        icon: Search01Icon,
        title: t("deletedEntries.empty.filteredTitle"),
        description: t("deletedEntries.empty.filteredDescription"),
        action: <ClearFiltersButton count={activeFilterCount} onClick={clearAllFilters} />,
      }
    : { icon: Delete02Icon, title: t("deletedEntries.empty.title"), description: t("deletedEntries.empty.description") };

  const mobileFilterRail = isMobile ? (
    <DeletedEntriesMobileFilterRail
      search={searchInput}
      source={source}
      dateFrom={dateFrom}
      dateTo={dateTo}
      activeFilterCount={activeFilterCount}
      onSearchChange={handleSearchChange}
      onSourceChange={handleSourceChange}
      onDateFromChange={handleDateFromChange}
      onDateToChange={handleDateToChange}
      onClear={clearAllFilters}
    />
  ) : null;

  return (
    <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 gap-3 min-h-0 overflow-hidden">
      <header className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">{t("deletedEntries.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("deletedEntries.subtitle")}</p>
      </header>

      {!isMobile ? (
        <div className="flex shrink-0 flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <span id="deleted-entries-source-label" className="text-xs font-medium text-muted-foreground">
              {t("deletedEntries.columns.sourceType")}
            </span>
            <ButtonGroup aria-labelledby="deleted-entries-source-label">
              {DELETED_ENTRY_SOURCE_FILTERS.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={source === value ? "default" : "outline"}
                  aria-pressed={source === value}
                  onClick={() => handleSourceChange(value)}
                >
                  {getDeletedEntrySourceFilterLabel(t, value)}
                </Button>
              ))}
            </ButtonGroup>
          </div>

          <div role="group" aria-labelledby="deleted-entries-date-from-label" className="flex flex-col gap-1">
            <span id="deleted-entries-date-from-label" className="text-xs font-medium text-muted-foreground">
              {t("deletedEntries.filters.dateFrom")}
            </span>
            <DatePickerButton value={dateFrom} onChange={handleDateFromChange} label={t("deletedEntries.filters.dateFrom")} />
          </div>

          <div role="group" aria-labelledby="deleted-entries-date-to-label" className="flex flex-col gap-1">
            <span id="deleted-entries-date-to-label" className="text-xs font-medium text-muted-foreground">
              {t("deletedEntries.filters.dateTo")}
            </span>
            <DatePickerButton value={dateTo} onChange={handleDateToChange} label={t("deletedEntries.filters.dateTo")} />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="deleted-entries-search" className="text-xs font-medium text-muted-foreground">
              {t("common:labels.search")}
            </Label>
            <DeletedEntriesSearchField id="deleted-entries-search" value={searchInput} onChange={handleSearchChange} className="w-64" />
          </div>

          {hasActiveFilters ? <ClearFiltersButton count={activeFilterCount} onClick={clearAllFilters} /> : null}
        </div>
      ) : null}
      {isMobile && !hasFloatingMobileFilters ? <MobileFilterRailInline>{mobileFilterRail}</MobileFilterRailInline> : null}

      <div
        ref={containerRef}
        className={cn(
          "custom-scrollbar relative min-h-0 flex-1 overflow-x-hidden",
          isMobile ? "overflow-y-auto overscroll-y-contain" : isTableScrollable ? "overflow-y-auto" : "overflow-y-clip",
          hasFloatingMobileFilters && "max-md:mb-10",
        )}
        aria-busy={showInitialLoading || isFetching}
      >
        {showUpdating ? <DataTable.UpdatingIndicator className="z-40" /> : null}
        {showStaleNotice ? <StaleDataNotice onRetry={() => refetch()} isRetrying={isFetching} className="absolute right-2 top-2 z-40" /> : null}
        {isMobile ? (
          <div className="flex flex-col">
            <DeletedEntriesMobileList
              entries={entries}
              viewState={viewState}
              isRetrying={isFetching}
              pageSize={pagination.pageSize}
              autoPageSize={autoPageSize}
              sort={sort}
              locale={locale}
              emptyState={emptyState}
              onSortToggle={toggleSort}
              onOpenEntry={openEntry}
              onRetry={refetch}
            />
            <DataTable.PaginationFooter>
              <DataTablePagination table={table} totalItems={total} pageSizeOptions={entriesPageSizeOptions} showRowsPerPage={false} />
            </DataTable.PaginationFooter>
          </div>
        ) : (
          <div className="min-w-full">
            <div className="custom-scrollbar overflow-x-auto">
              <DataTable.Root table={table} className="block rounded-b-none border-b-0">
                <DataTable.Table>
                  <DataTable.Header />
                  {viewState === "loading" ? <DataTable.Skeleton rows={pagination.pageSize} columns={columns.length} /> : null}
                  {viewState === "error" ? (
                    <DataTable.Error columns={columns.length} rows={autoPageSize} onRetry={() => refetch()} isRetrying={isFetching} />
                  ) : null}
                  {viewState === "empty" ? <DataTable.EmptyState columns={columns.length} rows={autoPageSize} {...emptyState} /> : null}
                  {viewState === "ready" ? (
                    <DataTable.Body onRowClick={openEntry} getRowAriaLabel={(entry: DeletedEntry) => getDeletedEntryAriaLabel(t, entry, locale)} />
                  ) : null}
                </DataTable.Table>
              </DataTable.Root>
            </div>
            <DataTable.PaginationFooter>
              <DataTablePagination table={table} totalItems={total} pageSizeOptions={entriesPageSizeOptions} />
            </DataTable.PaginationFooter>
          </div>
        )}
      </div>

      <DeletedEntryDetailSheet
        entry={detailEntry}
        open={isDetailOpen}
        onOpenChange={(open) => {
          if (!open) dispatch({ type: "CLOSE_DETAIL" });
        }}
      />

      {hasFloatingMobileFilters && navActionTarget
        ? createPortal(
            <div className="w-[calc(100vw-1.5rem)] min-w-0 md:hidden">
              <div className="scrollbar-hide min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
                <div className="mx-auto w-max">{mobileFilterRail}</div>
              </div>
            </div>,
            navActionTarget,
          )
        : null}
    </div>
  );
}

export const Route = createFileRoute("/_layout/deleted-entries")({
  component: DeletedEntriesPage,
  head: () => buildStaticPageHead("/deleted-entries"),
  staticData: {
    titleKey: "items.deletedEntries",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
