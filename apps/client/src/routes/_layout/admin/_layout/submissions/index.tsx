import { AlertCircleIcon, Search01Icon, Sorting05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTable } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import { Button } from "@/components/ui/button";
import {
  DATA_TABLE_HEADER_HEIGHT,
  DATA_TABLE_PAGINATION_HEIGHT,
  DATA_TABLE_ROW_HEIGHT,
  DataTable,
  getDataTableViewState,
} from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Spinner } from "@/components/ui/spinner";
import { useNavActionTarget } from "@/contexts/navActions";
import { operatorsQueryOptions, regionsQueryOptions } from "@/features/admin/queries";
import {
  SubmissionChangesSummary,
  SubmissionStationSummary,
  SubmissionStatusSummary,
  SubmissionSubmitterSummary,
  SubmissionTimestamp,
  getSubmissionStationId,
} from "@/features/admin/submissions/components/submissionListParts";
import { useSubmissionsColumns } from "@/features/admin/submissions/components/submissionsColumns";
import {
  type SubmissionStatusFilter,
  type SubmissionTypeFilter,
  SubmissionsFilterToolbar,
  SubmissionsMobileFilterRail,
  SubmissionsStatusQueue,
} from "@/features/admin/submissions/components/submissionsFilters";
import type { SubmissionListItem } from "@/features/admin/submissions/types";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useMeasuredListRowHeight } from "@/hooks/useMeasuredListRowHeight";
import { useIsMobile } from "@/hooks/useMobile";
import type { PaginationState } from "@/hooks/useTablePageSize";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { API_BASE, fetchJson } from "@/lib/api";
import { appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";
import type { Operator, Region } from "@/types/station";

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

function loadStoredNumberArray(key: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === "number" && Number.isFinite(value)) : [];
  } catch {
    return [];
  }
}

function AdminSubmissionsListPage() {
  "use no memo";
  const { t } = useTranslation(["submissions", "common"]);
  const navigate = useNavigate();
  const { page, q } = Route.useSearch();
  const navActionTarget = useNavActionTarget();
  const isMobile = useIsMobile();
  const hasFloatingMobileFilters = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  const [statusFilter, setStatusFilter] = useState<SubmissionStatusFilter>(() => {
    const saved = localStorage.getItem("admin:submissions:status");
    return saved === "all" || saved === "pending" || saved === "approved" || saved === "rejected" ? saved : "pending";
  });
  const [typeFilter, setTypeFilter] = useState<SubmissionTypeFilter>(() => {
    const saved = localStorage.getItem("admin:submissions:type");
    return saved === "all" || saved === "new" || saved === "update" || saved === "delete" ? saved : "all";
  });
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => {
    const saved = localStorage.getItem("admin:submissions:sort");
    return saved === "desc" ? "desc" : "asc";
  });
  const [searchInput, setSearchInput] = useState(q ?? "");
  const [activeSearch, setActiveSearch] = useState(q ?? "");
  const [selectedSubmitterIds, setSelectedSubmitterIds] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("admin:submissions:submitters") ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
    } catch {
      return [];
    }
  });
  const [selectedOperatorMncs, setSelectedOperatorMncs] = useState<number[]>(() => loadStoredNumberArray("admin:submissions:operators"));
  const [selectedRegionIds, setSelectedRegionIds] = useState<number[]>(() => loadStoredNumberArray("admin:submissions:regions"));

  const debouncedUpdate = useDebouncedCallback((value: string) => {
    setActiveSearch(value);
    void navigate({
      from: Route.fullPath,
      search: (search) => ({ ...search, q: value || undefined, page: 0 }),
      replace: true,
    });
  }, 300);

  const resetPage = useCallback(() => {
    void navigate({ from: Route.fullPath, search: (search) => ({ ...search, page: 0 }), replace: true });
  }, [navigate]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      debouncedUpdate(value.trim());
    },
    [debouncedUpdate],
  );

  const handleStatusFilter = useCallback(
    (value: SubmissionStatusFilter) => {
      setStatusFilter(value);
      localStorage.setItem("admin:submissions:status", value);
      resetPage();
    },
    [resetPage],
  );

  const handleTypeFilter = useCallback(
    (value: SubmissionTypeFilter) => {
      setTypeFilter(value);
      localStorage.setItem("admin:submissions:type", value);
      resetPage();
    },
    [resetPage],
  );

  const handleSubmitterChange = useCallback(
    (ids: string[]) => {
      setSelectedSubmitterIds(ids);
      localStorage.setItem("admin:submissions:submitters", JSON.stringify(ids));
      resetPage();
    },
    [resetPage],
  );

  const handleOperatorChange = useCallback(
    (operators: Operator[]) => {
      const mncs = operators.map((operator) => operator.mnc);
      setSelectedOperatorMncs(mncs);
      localStorage.setItem("admin:submissions:operators", JSON.stringify(mncs));
      resetPage();
    },
    [resetPage],
  );

  const handleRegionChange = useCallback(
    (regions: Region[]) => {
      const ids = regions.map((region) => region.id);
      setSelectedRegionIds(ids);
      localStorage.setItem("admin:submissions:regions", JSON.stringify(ids));
      resetPage();
    },
    [resetPage],
  );

  const handleSortToggle = useCallback(() => {
    setSortOrder((current) => {
      const next = current === "asc" ? "desc" : "asc";
      localStorage.setItem("admin:submissions:sort", next);
      return next;
    });
    resetPage();
  }, [resetPage]);

  const handleClearAll = useCallback(() => {
    setTypeFilter("all");
    setSelectedSubmitterIds([]);
    setSelectedOperatorMncs([]);
    setSelectedRegionIds([]);
    setSearchInput("");
    setActiveSearch("");
    debouncedUpdate("");
    localStorage.setItem("admin:submissions:type", "all");
    localStorage.setItem("admin:submissions:submitters", "[]");
    localStorage.setItem("admin:submissions:operators", "[]");
    localStorage.setItem("admin:submissions:regions", "[]");
    void navigate({
      from: Route.fullPath,
      search: (search) => ({ ...search, q: undefined, page: 0 }),
      replace: true,
    });
  }, [debouncedUpdate, navigate]);

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
    pageSizeOptions,
  } = isMobile ? mobilePagination : desktopPagination;
  const pagination = useMemo(() => ({ pageIndex: page, pageSize: sizePagination.pageSize }), [page, sizePagination.pageSize]);

  const setPagination = useCallback(
    (updater: PaginationState | ((current: PaginationState) => PaginationState)) => {
      const next = typeof updater === "function" ? updater(pagination) : updater;
      if (next.pageSize !== pagination.pageSize) setSizePagination(next);
      if (next.pageIndex !== pagination.pageIndex)
        void navigate({ from: Route.fullPath, search: (search) => ({ ...search, page: next.pageIndex }), replace: true });
    },
    [navigate, pagination, setSizePagination],
  );

  const { data: operators = [] } = useQuery(operatorsQueryOptions());
  const { data: regions = [] } = useQuery(regionsQueryOptions());
  const { operatorById, operatorByMnc } = useMemo(() => {
    const byId = new Map<number, Operator>();
    const byMnc = new Map<number, Operator>();
    for (const operator of operators) {
      byId.set(operator.id, operator);
      byMnc.set(operator.mnc, operator);
    }
    return { operatorById: byId, operatorByMnc: byMnc };
  }, [operators]);
  const regionById = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions]);
  const selectedOperators = useMemo(
    () => selectedOperatorMncs.map((mnc) => operatorByMnc.get(mnc)).filter((operator): operator is Operator => operator !== undefined),
    [operatorByMnc, selectedOperatorMncs],
  );
  const selectedRegions = useMemo(
    () => selectedRegionIds.map((id) => regionById.get(id)).filter((region): region is Region => region !== undefined),
    [regionById, selectedRegionIds],
  );
  const selectedRegionCodes = useMemo(() => selectedRegions.map((region) => region.code), [selectedRegions]);
  const getOperatorById = useCallback(
    (operatorId: number | null | undefined) => (operatorId !== null && operatorId !== undefined ? operatorById.get(operatorId) : undefined),
    [operatorById],
  );

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: [
      "admin",
      "submissions",
      pagination.pageIndex,
      pagination.pageSize,
      statusFilter,
      typeFilter,
      activeSearch,
      sortOrder,
      selectedSubmitterIds,
      selectedOperatorMncs,
      selectedRegionCodes,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", pagination.pageSize.toString());
      params.set("offset", (pagination.pageIndex * pagination.pageSize).toString());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (activeSearch) params.set("search", activeSearch);
      if (selectedSubmitterIds.length > 0) params.set("submitter_ids", selectedSubmitterIds.join(","));
      if (selectedOperatorMncs.length > 0) params.set("operators", selectedOperatorMncs.join(","));
      if (selectedRegionCodes.length > 0) params.set("regions", selectedRegionCodes.join(","));
      params.set("sort", sortOrder);
      return fetchJson<{ data: SubmissionListItem[]; totalCount: number }>(`${API_BASE}/submissions/admin?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const submissions = data?.data ?? [];
  const total = data?.totalCount ?? 0;
  const activeFilterCount =
    Number(typeFilter !== "all") +
    Number(searchInput.trim().length > 0) +
    Number(selectedSubmitterIds.length > 0) +
    Number(selectedOperatorMncs.length > 0) +
    Number(selectedRegionIds.length > 0);
  const columns = useSubmissionsColumns({ sortOrder, onSortToggle: handleSortToggle, getOperatorById });
  const sorting = useMemo(() => [{ id: "createdAt", desc: sortOrder === "desc" }], [sortOrder]);
  const handleRowClick = useCallback(
    (submission: SubmissionListItem) => navigate({ to: "/admin/submissions/$id", params: { id: submission.id } }),
    [navigate],
  );
  const getRowHref = useCallback((submission: SubmissionListItem) => `/admin/submissions/${submission.id}`, []);
  const getRowAriaLabel = useCallback(
    (submission: SubmissionListItem) =>
      t("table.openSubmission", {
        id: submission.id.slice(-8),
        stationId: getSubmissionStationId(submission) ?? t("common:labels.newStation"),
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
    pageCount: Math.ceil(total / pagination.pageSize),
    state: { pagination, sorting },
    onPaginationChange: setPagination,
  });

  const filterProps = {
    statusFilter,
    typeFilter,
    selectedSubmitterIds,
    selectedOperators,
    selectedRegions,
    operators,
    regions,
    searchInput,
    activeFilterCount,
    onStatusChange: handleStatusFilter,
    onTypeChange: handleTypeFilter,
    onSubmitterChange: handleSubmitterChange,
    onOperatorChange: handleOperatorChange,
    onRegionChange: handleRegionChange,
    onSearchChange: handleSearchChange,
    onClearAll: handleClearAll,
  };
  const mobileFilterRail = isMobile ? <SubmissionsMobileFilterRail {...filterProps} /> : null;
  const hasRows = submissions.length > 0;
  const viewState = getDataTableViewState(isLoading, isError && !hasRows, hasRows);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 pb-0">
      <div className="flex shrink-0 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{t("adminTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("adminDescription")}</p>
          </div>
          {!isMobile ? <SubmissionsStatusQueue value={statusFilter} onChange={handleStatusFilter} /> : null}
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
        {isFetching && !isLoading ? (
          <div
            className="absolute right-2 top-2 z-20 inline-flex items-center gap-1.5 rounded-md border bg-background/95 px-2 py-1 text-xs text-muted-foreground shadow-sm"
            role="status"
          >
            <Spinner role="presentation" aria-hidden="true" className="size-3.5" />
            {t("common:actions.updating")}
          </div>
        ) : null}
        {isError && hasRows ? (
          <div
            className="absolute right-2 top-2 z-20 inline-flex items-center gap-2 rounded-md border border-destructive/30 bg-background/95 px-2 py-1 text-xs text-destructive shadow-sm"
            role="alert"
          >
            <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5" />
            {t("common:placeholder.errorFetching")}
            <Button type="button" variant="ghost" size="xs" onClick={() => void refetch()}>
              {t("common:actions.retry")}
            </Button>
          </div>
        ) : null}

        {isMobile ? (
          <div className="flex flex-col">
            {viewState === "error" ? (
              <div
                className="flex min-h-64 flex-1 flex-col items-center justify-center rounded-t-lg border border-b-0 bg-card px-4 text-center text-muted-foreground"
                role="alert"
              >
                <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-destructive/5 text-destructive/60">
                  <HugeiconsIcon icon={AlertCircleIcon} className="size-5" />
                </div>
                <p className="font-medium text-foreground">{t("common:error.title")}</p>
                <p className="mt-1 max-w-md text-sm">{t("common:error.description")}</p>
                <Button type="button" variant="outline" className="mt-4" onClick={() => void refetch()}>
                  {t("common:actions.retry")}
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-t-lg border border-b-0 bg-card">
                <div className="flex h-10 items-center gap-1 border-b bg-muted/20 px-2">
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-md bg-muted px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={handleSortToggle}
                    aria-label={`${t("common:labels.submitted")}: ${sortOrder === "asc" ? t("table.sortAscending") : t("table.sortDescending")}`}
                    aria-pressed="true"
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
            )}

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
                  <tbody>
                    <tr>
                      <td colSpan={columns.length} className="h-64 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground" role="alert">
                          <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-destructive/5 text-destructive/60">
                            <HugeiconsIcon icon={AlertCircleIcon} className="size-5" />
                          </div>
                          <p className="font-medium text-foreground">{t("common:error.title")}</p>
                          <p className="mt-1 max-w-md text-sm">{t("common:error.description")}</p>
                          <Button type="button" variant="outline" className="mt-4" onClick={() => void refetch()}>
                            {t("common:actions.retry")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
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
  validateSearch: (search: Record<string, unknown>) => ({
    page: typeof search.page === "number" && search.page >= 0 ? Math.floor(search.page) : 0,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
  }),
  component: AdminSubmissionsListPage,
  staticData: {
    titleKey: "breadcrumbs.submissions",
    i18nNamespace: "admin",
    breadcrumbs: [{ titleKey: "breadcrumbs.admin", path: "/admin/stations", i18nNamespace: "admin" }],
    allowedRoles: ["admin", "editor"],
  },
});
