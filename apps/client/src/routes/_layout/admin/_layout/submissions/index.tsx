import { Search01Icon, Sorting05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Brand, Operator } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTable } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
import {
  DATA_TABLE_HEADER_HEIGHT,
  DATA_TABLE_PAGINATION_HEIGHT,
  DATA_TABLE_ROW_HEIGHT,
  DataTable,
  getDataTableViewState,
} from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { ErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { useNavActionTarget } from "@/contexts/navActions";
import { adminSubmissionsQueryOptions, clampSubmissionListPage, getSubmissionListPageCount } from "@/features/admin/submissions/api";
import {
  SubmissionChangesSummary,
  SubmissionStationSummary,
  SubmissionStatusSummary,
  SubmissionSubmitterSummary,
  SubmissionTimestamp,
} from "@/features/admin/submissions/components/submissionListParts";
import { useSubmissionsColumns } from "@/features/admin/submissions/components/submissionsColumns";
import {
  SubmissionsFilterToolbar,
  SubmissionsMobileFilterRail,
  SubmissionsStatusQueue,
} from "@/features/admin/submissions/components/submissionsFilters";
import { filterSubmissionIdsByCountries } from "@/features/admin/submissions/submissionFilterScope";
import {
  readStoredSubmissionFilters,
  readStoredSubmissionSortOrder,
  seedSubmissionFilters,
  writeStoredSubmissionFilters,
  writeStoredSubmissionSortOrder,
} from "@/features/admin/submissions/submissionFilterStorage";
import type {
  SubmissionListFilters,
  SubmissionListRow,
  SubmissionOperatorOption,
  SubmissionStatusFilter,
  SubmissionTypeFilter,
} from "@/features/admin/submissions/types";
import { parseUserId } from "@/features/admin/users/utils/userId";
import { brandsQueryOptions, operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { useListPanelScope } from "@/features/stations/list/data/listPanel";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useMeasuredListRowHeight } from "@/hooks/useMeasuredListRowHeight";
import { useIsMobile } from "@/hooks/useMobile";
import { useSettledSession } from "@/hooks/useSettledSession";
import type { PaginationState } from "@/hooks/useTablePageSize";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

const DESKTOP_PAGINATION_CONFIG = {
  rowHeight: DATA_TABLE_ROW_HEIGHT,
  headerHeight: DATA_TABLE_HEADER_HEIGHT,
  paginationHeight: DATA_TABLE_PAGINATION_HEIGHT,
};
const MOBILE_ROW_HEIGHT_FALLBACK = 148;
const MOBILE_PAGINATION_CONFIG = { headerHeight: DATA_TABLE_HEADER_HEIGHT, paginationHeight: 51, minRows: 1 };
const SORT_ASC_STYLE = { transform: "scaleY(-1)" };
const MOBILE_SUBMISSION_SKELETON_ROWS = Array.from({ length: 6 }, (_, index) => (
  <div key={index} className="space-y-3 p-3">
    <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
    <div className="h-5 w-1/2 animate-pulse rounded bg-muted" />
    <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
  </div>
));

type AdminSubmissionsSearch = {
  page: number;
  q: string | undefined;
  submitter?: string;
};

function toOperatorOption(operator: Operator, brands: readonly Brand[] | undefined): SubmissionOperatorOption {
  return { id: operator.id, name: operator.name, brand: getOperatorBrand(operator, brands) };
}

function AdminSubmissionsListPage() {
  "use no memo";
  const { t } = useTranslation(["submissions", "common"]);
  const { data: session, isPending: isSessionPending, error: sessionError } = useSettledSession();
  const viewerReady = !isSessionPending && !sessionError;
  const userId = session?.user.id;
  const navigate = useNavigate();
  const { page, q, submitter } = Route.useSearch();
  const navActionTarget = useNavActionTarget();
  const isMobile = useIsMobile();
  const hasFloatingMobileFilters = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  const [storedFilters, setFilters] = useState(() => (submitter === undefined ? readStoredSubmissionFilters() : seedSubmissionFilters(submitter)));
  const [sortOrder, setSortOrder] = useState(readStoredSubmissionSortOrder);
  const [searchInput, setSearchInput] = useState(q ?? "");
  const [activeSearch, setActiveSearch] = useState(q ?? "");
  const { data: operatorData } = useQuery({ ...operatorsQueryOptions({ viewerId: userId ?? null }), enabled: viewerReady });
  const operators = viewerReady ? operatorData : undefined;
  const { data: brands } = useQuery(brandsQueryOptions());
  const { data: regionData } = useQuery({ ...regionsQueryOptions({ viewerId: userId ?? null }), enabled: viewerReady });
  const regions = viewerReady ? regionData : undefined;
  const filters = useMemo(() => {
    const operatorIds = filterSubmissionIdsByCountries(storedFilters.operatorIds, operators, storedFilters.countryCodes);
    const regionIds = filterSubmissionIdsByCountries(storedFilters.regionIds, regions, storedFilters.countryCodes);
    if (operatorIds === storedFilters.operatorIds && regionIds === storedFilters.regionIds) return storedFilters;
    return { ...storedFilters, operatorIds, regionIds };
  }, [storedFilters, operators, regions]);
  const filterScope = useListPanelScope(filters.countryCodes, true);

  useEffect(() => {
    if (filters !== storedFilters) writeStoredSubmissionFilters(filters);
  }, [filters, storedFilters]);

  const debouncedUpdate = useDebouncedCallback((value: string) => {
    setActiveSearch(value);
    void navigate({
      from: Route.fullPath,
      search: (search) => ({ ...search, q: value || undefined, page: 0 }),
      replace: true,
    });
  }, 300);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      debouncedUpdate(value.trim());
    },
    [debouncedUpdate],
  );

  const saveFilters = useCallback((nextFilters: SubmissionListFilters) => {
    setFilters(nextFilters);
    writeStoredSubmissionFilters(nextFilters);
  }, []);

  const changeFilters = useCallback(
    (change: Partial<SubmissionListFilters>) => {
      saveFilters({ ...filters, ...change });
      void navigate({ from: Route.fullPath, search: (search) => ({ ...search, submitter: undefined, page: 0 }), replace: true });
    },
    [filters, navigate, saveFilters],
  );

  const handleStatusFilter = useCallback((status: SubmissionStatusFilter) => changeFilters({ status }), [changeFilters]);
  const handleTypeFilter = useCallback((type: SubmissionTypeFilter) => changeFilters({ type }), [changeFilters]);
  const handleSubmitterChange = useCallback((submitterIds: string[]) => changeFilters({ submitterIds }), [changeFilters]);
  const handleCountryChange = useCallback(
    (countryCodes: string[]) =>
      changeFilters({
        countryCodes,
        operatorIds: filterSubmissionIdsByCountries(filters.operatorIds, operators, countryCodes),
        regionIds: filterSubmissionIdsByCountries(filters.regionIds, regions, countryCodes),
      }),
    [changeFilters, filters.operatorIds, filters.regionIds, operators, regions],
  );

  const handleOperatorChange = useCallback((operatorIds: number[]) => changeFilters({ operatorIds }), [changeFilters]);

  const handleRegionChange = useCallback((regionIds: number[]) => changeFilters({ regionIds }), [changeFilters]);

  const handleSortToggle = useCallback(() => {
    const nextSortOrder = sortOrder === "asc" ? "desc" : "asc";
    setSortOrder(nextSortOrder);
    writeStoredSubmissionSortOrder(nextSortOrder);
    void navigate({ from: Route.fullPath, search: (search) => ({ ...search, page: 0 }), replace: true });
  }, [navigate, sortOrder]);

  const handleClearAll = useCallback(() => {
    saveFilters({ ...filters, type: "all", submitterIds: [], countryCodes: [], operatorIds: [], regionIds: [] });
    setSearchInput("");
    setActiveSearch("");
    debouncedUpdate("");
    void navigate({
      from: Route.fullPath,
      search: (search) => ({ ...search, q: undefined, submitter: undefined, page: 0 }),
      replace: true,
    });
  }, [debouncedUpdate, filters, navigate, saveFilters]);

  const { listRef, rowHeight: mobileRowHeight } = useMeasuredListRowHeight(MOBILE_ROW_HEIGHT_FALLBACK, {
    round: false,
    safetyBuffer: 0,
  });
  const desktopPagination = useTablePagination(DESKTOP_PAGINATION_CONFIG);
  const mobilePagination = useTablePagination({ ...MOBILE_PAGINATION_CONFIG, rowHeight: mobileRowHeight });
  const {
    containerRef,
    pagination: sizePagination,
    setPagination: setSizePagination,
    autoPageSize,
    pageSizeOptions,
    isPageSizeMeasured,
  } = isMobile ? mobilePagination : desktopPagination;
  const pagination = useMemo(
    () => ({ pageIndex: clampSubmissionListPage(page, sizePagination.pageSize), pageSize: sizePagination.pageSize }),
    [page, sizePagination.pageSize],
  );

  const setPagination = useCallback(
    (updater: PaginationState | ((current: PaginationState) => PaginationState)) => {
      const next = typeof updater === "function" ? updater(pagination) : updater;
      if (next.pageSize !== pagination.pageSize) setSizePagination(next);
      if (next.pageIndex !== pagination.pageIndex) {
        void navigate({ from: Route.fullPath, search: (search) => ({ ...search, page: next.pageIndex }), replace: true });
      }
    },
    [navigate, pagination, setSizePagination],
  );

  const operatorById = useMemo(
    () => new Map((operators ?? []).map((operator) => [operator.id, toOperatorOption(operator, brands)])),
    [operators, brands],
  );
  const getOperatorById = useCallback(
    (operatorId: number | null) => (operatorId === null ? undefined : operatorById.get(operatorId)),
    [operatorById],
  );

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    ...adminSubmissionsQueryOptions({
      userId,
      pageIndex: pagination.pageIndex,
      pageSize: pagination.pageSize,
      sortOrder,
      search: activeSearch,
      filters,
    }),
    enabled: isPageSizeMeasured && userId !== undefined,
  });

  const submissions = data?.rows ?? [];
  const total = data?.total ?? 0;
  const activeFilterCount =
    Number(filters.type !== "all") +
    Number(searchInput.trim().length > 0) +
    Number(filters.submitterIds.length > 0) +
    Number(filters.countryCodes.length > 0) +
    Number(filters.operatorIds.length > 0) +
    Number(filters.regionIds.length > 0);
  const columns = useSubmissionsColumns({ sortOrder, onSortToggle: handleSortToggle, getOperatorById });
  const sorting = useMemo(() => [{ id: "createdAt", desc: sortOrder === "desc" }], [sortOrder]);
  const handleRowClick = useCallback(
    (submission: SubmissionListRow) => navigate({ to: "/admin/submissions/$id", params: { id: submission.id } }),
    [navigate],
  );
  const getRowHref = useCallback((submission: SubmissionListRow) => `/admin/submissions/${submission.id}`, []);
  const getRowAriaLabel = useCallback(
    (submission: SubmissionListRow) =>
      t("table.openSubmission", {
        id: submission.id.slice(-8),
        stationId: submission.siteId ?? t("common:labels.newStation"),
        status: t(`common:status.${submission.status}`),
        type: t(`common:submissionType.${submission.type}`),
      }),
    [t],
  );

  const table = useTable({
    features: appTableFeatures,
    data: submissions,
    columns,
    manualPagination: true,
    manualSorting: true,
    pageCount: getSubmissionListPageCount(total, pagination.pageSize),
    state: { pagination, sorting },
    onPaginationChange: setPagination,
  });

  const filterProps = {
    statusFilter: filters.status,
    typeFilter: filters.type,
    selectedSubmitterIds: filters.submitterIds,
    countryCodes: filters.countryCodes,
    operatorIds: filters.operatorIds,
    regionIds: filters.regionIds,
    scope: filterScope,
    searchInput,
    activeFilterCount,
    onStatusChange: handleStatusFilter,
    onTypeChange: handleTypeFilter,
    onSubmitterChange: handleSubmitterChange,
    onCountryChange: handleCountryChange,
    onOperatorChange: handleOperatorChange,
    onRegionChange: handleRegionChange,
    onSearchChange: handleSearchChange,
    onClearAll: handleClearAll,
  };
  const mobileFilterRail = isMobile ? <SubmissionsMobileFilterRail {...filterProps} /> : null;
  const hasRows = submissions.length > 0;
  const viewState = getDataTableViewState(!isPageSizeMeasured || userId === undefined || isLoading, isError && !hasRows, hasRows);
  const showStaleNotice = isError && hasRows;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 pb-0">
      <div className="flex shrink-0 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{t("adminTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("adminDescription")}</p>
          </div>
          {!isMobile ? <SubmissionsStatusQueue value={filters.status} onChange={handleStatusFilter} /> : null}
        </div>

        {!isMobile ? <SubmissionsFilterToolbar {...filterProps} /> : null}
        {isMobile && !hasFloatingMobileFilters ? (
          <div className="w-full min-w-0 overflow-x-auto overflow-y-hidden pb-1">{mobileFilterRail}</div>
        ) : null}
      </div>

      <div
        ref={containerRef}
        className={cn(
          "relative min-h-0 flex-1",
          isMobile ? "overflow-y-auto overscroll-y-contain" : "overflow-auto overscroll-contain",
          hasFloatingMobileFilters && "mb-10",
        )}
        aria-busy={isFetching}
      >
        {isFetching && !isLoading && !isError ? <DataTable.UpdatingIndicator /> : null}
        {showStaleNotice ? <StaleDataNotice onRetry={() => refetch()} isRetrying={isFetching} className="absolute right-2 top-2 z-20" /> : null}

        {isMobile ? (
          <div className="flex flex-col">
            <div className="overflow-hidden rounded-t-lg border border-b-0 bg-card">
              <div className="flex h-10 items-center gap-1 border-b bg-muted/20 px-2">
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-muted px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={handleSortToggle}
                  aria-label={`${t("common:labels.submitted")}: ${sortOrder === "asc" ? t("table.sortAscending") : t("table.sortDescending")}`}
                >
                  {t("common:labels.submitted")}
                  <HugeiconsIcon
                    icon={Sorting05Icon}
                    aria-hidden="true"
                    className="size-3.5 text-foreground"
                    style={sortOrder === "asc" ? SORT_ASC_STYLE : undefined}
                  />
                </button>
              </div>
              {viewState === "loading" ? (
                <div className="divide-y" aria-hidden="true">
                  {MOBILE_SUBMISSION_SKELETON_ROWS.slice(0, Math.min(pagination.pageSize, MOBILE_SUBMISSION_SKELETON_ROWS.length))}
                </div>
              ) : null}
              {viewState === "error" ? (
                <div className="flex flex-col p-3" style={{ minHeight: autoPageSize * mobileRowHeight }}>
                  <ErrorState className="flex-1" onRetry={() => refetch()} isRetrying={isFetching} />
                </div>
              ) : null}
              {viewState === "empty" ? (
                <div className="flex min-h-64 flex-1 flex-col items-center justify-center px-4 text-center text-muted-foreground" role="status">
                  <HugeiconsIcon icon={Search01Icon} className="mb-2 size-10 opacity-20" />
                  <p className="font-medium text-foreground">{t("table.empty")}</p>
                  <p className="text-sm opacity-80">{t("table.emptyHint")}</p>
                </div>
              ) : null}
              {viewState === "ready" ? (
                <ul ref={listRef} className="divide-y">
                  {submissions.map((submission) => (
                    <li key={submission.id}>
                      <Link
                        to="/admin/submissions/$id"
                        params={{ id: submission.id }}
                        className="group/header block px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        aria-label={getRowAriaLabel(submission)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <SubmissionStationSummary submission={submission} getOperatorById={getOperatorById} />
                          <SubmissionStatusSummary submission={submission} />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <SubmissionChangesSummary submission={submission} />
                          <SubmissionTimestamp value={submission.createdAt} />
                        </div>
                        <div className="mt-3">
                          <SubmissionSubmitterSummary submission={submission} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <DataTable.PaginationFooter>
              <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} showRowsPerPage={false} />
            </DataTable.PaginationFooter>
          </div>
        ) : (
          <div className="min-w-full">
            <DataTable.Root table={table} className="block rounded-b-none border-b-0">
              <DataTable.Table>
                <DataTable.Header />
                {viewState === "loading" ? <DataTable.Skeleton rows={pagination.pageSize} columns={columns.length} /> : null}
                {viewState === "error" ? (
                  <DataTable.Error columns={columns.length} rows={autoPageSize} onRetry={() => refetch()} isRetrying={isFetching} />
                ) : null}
                {viewState === "empty" ? (
                  <tbody>
                    <tr>
                      <td colSpan={columns.length} className="h-64 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground" role="status">
                          <HugeiconsIcon icon={Search01Icon} className="mb-2 size-10 opacity-20" />
                          <p className="font-medium text-foreground">{t("table.empty")}</p>
                          <p className="text-sm opacity-80">{t("table.emptyHint")}</p>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                ) : null}
                {viewState === "ready" ? (
                  <DataTable.Body onRowClick={handleRowClick} getRowHref={getRowHref} getRowAriaLabel={getRowAriaLabel} />
                ) : null}
              </DataTable.Table>
            </DataTable.Root>
            <DataTable.PaginationFooter>
              <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} />
            </DataTable.PaginationFooter>
          </div>
        )}
      </div>

      {hasFloatingMobileFilters && navActionTarget
        ? createPortal(
            <div className="w-[calc(100vw-1.5rem)] min-w-0">
              <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
                <div className="mx-auto w-max">{mobileFilterRail}</div>
              </div>
            </div>,
            navActionTarget,
          )
        : null}
    </div>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/submissions/")({
  validateSearch: (search: Record<string, unknown>): AdminSubmissionsSearch => ({
    page: typeof search.page === "number" && search.page >= 0 ? Math.floor(search.page) : 0,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    submitter: parseUserId(search.submitter),
  }),
  component: AdminSubmissionsListPage,
  staticData: {
    titleKey: "items.submissions",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.admin", path: "/admin/stations", i18nNamespace: "nav" }],
    allowedRoles: ["admin", "editor"],
  },
});
