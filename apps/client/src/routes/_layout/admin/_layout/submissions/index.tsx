import {
  AlertCircleIcon,
  Cancel01Icon,
  FullSignalIcon,
  Location01Icon,
  Search01Icon,
  Sorting05Icon,
  Tag01Icon,
  TaskDaily01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { DataTable } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { useNavActionTarget } from "@/contexts/navActions";
import { operatorsQueryOptions, regionsQueryOptions } from "@/features/admin/queries";
import { StationIdentityCell } from "@/features/admin/submissions/components/stationIdentityCell";
import { SUBMISSION_STATUS, SUBMISSION_TYPE } from "@/features/admin/submissions/submissionUI";
import type { SubmissionListItem } from "@/features/admin/submissions/types";
import { UserPicker } from "@/features/admin/users/components/UserPicker";
import { UserPickerPopover } from "@/features/admin/users/components/UserPickerPopover";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import type { PaginationState } from "@/hooks/useTablePageSize";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { API_BASE, fetchJson } from "@/lib/api";
import { formatShortDate, resolveAvatarUrl } from "@/lib/format";
import { getOperatorColor } from "@/lib/operatorUtils";
import { type AppTableFeatures, appTableFeatures } from "@/lib/tableFeatures";
import { cn, toggleValue } from "@/lib/utils";
import type { Operator, Region } from "@/types/station";

const TABLE_PAGINATION_CONFIG = { rowHeight: 64, headerHeight: 40, paginationHeight: 45 };

const columnHelper = createColumnHelper<AppTableFeatures, SubmissionListItem>();

function loadStoredNumberArray(key: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === "number" && Number.isFinite(value)) : [];
  } catch {
    return [];
  }
}

function SortableHeader({ label, sort, onToggle }: { label: string; sort: "asc" | "desc"; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-foreground -ml-1 px-1 py-0.5 rounded transition-colors"
      onClick={onToggle}
    >
      {label}
      <HugeiconsIcon
        icon={Sorting05Icon}
        className="size-3.5 text-foreground transition-colors"
        style={sort === "asc" ? { transform: "scaleY(-1)" } : undefined}
      />
    </button>
  );
}

type SubmissionsMobileFilterRailProps = {
  statusFilter: "all" | "pending" | "approved" | "rejected";
  typeFilter: "all" | "new" | "update" | "delete";
  selectedSubmitterIds: string[];
  selectedOperators: Operator[];
  selectedRegions: Region[];
  operators: Operator[];
  regions: Region[];
  searchInput: string;
  onStatusChange: (status: "all" | "pending" | "approved" | "rejected") => void;
  onTypeChange: (type: "all" | "new" | "update" | "delete") => void;
  onSubmitterChange: (ids: string[]) => void;
  onOperatorChange: (operators: Operator[]) => void;
  onRegionChange: (regions: Region[]) => void;
  onSearchChange: (value: string) => void;
};

function SubmissionsMobileFilterRail({
  statusFilter,
  typeFilter,
  selectedSubmitterIds,
  selectedOperators,
  selectedRegions,
  operators,
  regions,
  searchInput,
  onStatusChange,
  onTypeChange,
  onSubmitterChange,
  onOperatorChange,
  onRegionChange,
  onSearchChange,
}: SubmissionsMobileFilterRailProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const hasSearch = searchInput.trim().length > 0;

  return (
    <div className="flex items-center gap-1">
      <MobileFilterChip active={hasSearch} icon={Search01Icon} label={t("common:labels.search")}>
        <MobileFilterPanelTitle>{t("common:labels.search")}</MobileFilterPanelTitle>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="h-9 w-full pl-8 pr-8"
            placeholder={t("table.searchPlaceholder")}
            value={searchInput}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
          {hasSearch ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("common:actions.clear")}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          ) : null}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={statusFilter !== "all"} icon={TaskDaily01Icon} label={t("common:labels.status")}>
        <MobileFilterPanelTitle>{t("common:labels.status")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          {(["all", "pending", "approved", "rejected"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onStatusChange(status)}
              className={cn(
                "h-8 rounded-md px-2 text-left text-sm transition-colors",
                statusFilter === status ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              {status === "all" ? t("common:status.all", "All") : t(`common:status.${status}`)}
            </button>
          ))}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={typeFilter !== "all"} icon={Tag01Icon} label={t("common:labels.type")}>
        <MobileFilterPanelTitle>{t("common:labels.type")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          {(["all", "new", "update", "delete"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onTypeChange(type)}
              className={cn(
                "h-8 rounded-md px-2 text-left text-sm transition-colors",
                typeFilter === type ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              {type === "all" ? t("common:submissionType.all", "All") : t(`common:submissionType.${type}`)}
            </button>
          ))}
        </div>
      </MobileFilterChip>

      <MobileFilterChip
        active={selectedSubmitterIds.length > 0}
        count={selectedSubmitterIds.length}
        icon={UserGroupIcon}
        label={t("detail.submitter")}
      >
        <MobileFilterPanelTitle>{t("detail.submitter")}</MobileFilterPanelTitle>
        <UserPicker selectedUserIds={selectedSubmitterIds} onSelectionChange={onSubmitterChange} />
      </MobileFilterChip>

      <MobileFilterChip
        active={selectedOperators.length > 0}
        count={selectedOperators.length}
        icon={FullSignalIcon}
        label={t("common:labels.operator")}
      >
        <MobileFilterPanelTitle>{t("common:labels.operator")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          {operators.map((operator) => {
            const selected = selectedOperators.some((value) => value.id === operator.id);
            return (
              <button
                key={operator.id}
                type="button"
                onClick={() => onOperatorChange(toggleValue(selectedOperators, operator))}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                  selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: getOperatorColor(operator.mnc) }} />
                <span className="min-w-0 flex-1 truncate">{operator.name}</span>
              </button>
            );
          })}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={selectedRegions.length > 0} count={selectedRegions.length} icon={Location01Icon} label={t("common:labels.region")}>
        <MobileFilterPanelTitle>{t("common:labels.region")}</MobileFilterPanelTitle>
        <div className="grid max-h-64 gap-1 overflow-y-auto">
          {regions.map((region) => {
            const selected = selectedRegions.some((value) => value.id === region.id);
            return (
              <button
                key={region.id}
                type="button"
                onClick={() => onRegionChange(toggleValue(selectedRegions, region))}
                className={cn(
                  "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                  selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{region.name}</span>
              </button>
            );
          })}
        </div>
      </MobileFilterChip>
    </div>
  );
}

function AdminSubmissionsListPage() {
  "use no memo";
  const { t, i18n } = useTranslation(["submissions", "common"]);
  const navigate = useNavigate();
  const { page, q } = Route.useSearch();
  const navActionTarget = useNavActionTarget();
  const showFloatingMobileFilters = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">(() => {
    const saved = localStorage.getItem("admin:submissions:status");
    return saved === "all" || saved === "pending" || saved === "approved" || saved === "rejected" ? saved : "pending";
  });
  const [typeFilter, setTypeFilter] = useState<"all" | "new" | "update" | "delete">(() => {
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
      const saved = localStorage.getItem("admin:submissions:submitters");
      const parsed = JSON.parse(saved ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
    } catch {
      return [];
    }
  });
  const [selectedOperatorMncs, setSelectedOperatorMncs] = useState<number[]>(() => loadStoredNumberArray("admin:submissions:operators"));
  const [selectedRegionIds, setSelectedRegionIds] = useState<number[]>(() => loadStoredNumberArray("admin:submissions:regions"));
  const operatorChipsRef = useRef<HTMLDivElement>(null);
  const regionChipsRef = useRef<HTMLDivElement>(null);

  const debouncedUpdate = useDebouncedCallback((value: string) => {
    setActiveSearch(value);
    void navigate({
      from: Route.fullPath,
      search: (s) => ({ ...s, q: value || undefined, page: 0 }),
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

  const handleStatusFilter = useCallback(
    (v: typeof statusFilter) => {
      setStatusFilter(v);
      localStorage.setItem("admin:submissions:status", v);
      void navigate({ from: Route.fullPath, search: (s) => ({ ...s, page: 0 }), replace: true });
    },
    [navigate],
  );

  const handleTypeFilter = useCallback(
    (v: typeof typeFilter) => {
      setTypeFilter(v);
      localStorage.setItem("admin:submissions:type", v);
      void navigate({ from: Route.fullPath, search: (s) => ({ ...s, page: 0 }), replace: true });
    },
    [navigate],
  );

  const handleSubmitterChange = useCallback((ids: string[]) => {
    setSelectedSubmitterIds(ids);
    localStorage.setItem("admin:submissions:submitters", JSON.stringify(ids));
  }, []);

  const handleOperatorChange = useCallback(
    (operators: Operator[]) => {
      const mncs = operators.map((operator) => operator.mnc);
      setSelectedOperatorMncs(mncs);
      localStorage.setItem("admin:submissions:operators", JSON.stringify(mncs));
      void navigate({ from: Route.fullPath, search: (s) => ({ ...s, page: 0 }), replace: true });
    },
    [navigate],
  );

  const handleRegionChange = useCallback(
    (regions: Region[]) => {
      const ids = regions.map((region) => region.id);
      setSelectedRegionIds(ids);
      localStorage.setItem("admin:submissions:regions", JSON.stringify(ids));
      void navigate({ from: Route.fullPath, search: (s) => ({ ...s, page: 0 }), replace: true });
    },
    [navigate],
  );

  const handleSortToggle = useCallback(() => {
    setSortOrder((prev) => {
      const next = prev === "asc" ? "desc" : "asc";
      localStorage.setItem("admin:submissions:sort", next);
      return next;
    });
    void navigate({ from: Route.fullPath, search: (s) => ({ ...s, page: 0 }), replace: true });
  }, [navigate]);

  const {
    containerRef,
    pagination: sizePagination,
    setPagination: setSizePagination,
    autoPageSize,
    pageSizeOptions,
  } = useTablePagination(TABLE_PAGINATION_CONFIG);

  const pagination = useMemo(() => ({ pageIndex: page, pageSize: sizePagination.pageSize }), [page, sizePagination.pageSize]);

  const setPagination = useCallback(
    (updater: PaginationState | ((prev: PaginationState) => PaginationState)) => {
      const next = typeof updater === "function" ? updater(pagination) : updater;
      if (next.pageSize !== pagination.pageSize) setSizePagination(next);
      if (next.pageIndex !== pagination.pageIndex)
        void navigate({ from: Route.fullPath, search: (s) => ({ ...s, page: next.pageIndex }), replace: true });
    },
    [pagination, setSizePagination, navigate],
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
    [selectedOperatorMncs, operatorByMnc],
  );
  const selectedRegions = useMemo(
    () => selectedRegionIds.map((id) => regionById.get(id)).filter((region): region is Region => region !== undefined),
    [selectedRegionIds, regionById],
  );
  const visibleSelectedOperators = useMemo(() => selectedOperators.slice(0, 1), [selectedOperators]);
  const visibleSelectedRegions = useMemo(() => selectedRegions.slice(0, 1), [selectedRegions]);
  const hiddenSelectedOperatorCount = selectedOperators.length - visibleSelectedOperators.length;
  const hiddenSelectedRegionCount = selectedRegions.length - visibleSelectedRegions.length;
  const selectedRegionCodes = useMemo(() => selectedRegions.map((region) => region.code), [selectedRegions]);
  const getOperatorById = useCallback(
    (operatorId: number | null | undefined) => (operatorId !== null && operatorId !== undefined ? operatorById.get(operatorId) : undefined),
    [operatorById],
  );

  const { data, isLoading, isError } = useQuery({
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

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("id", {
          header: t("common:labels.id"),
          size: 80,
          cell: ({ getValue }) => {
            const id = getValue();
            const lastPart = id.slice(-8);
            return <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground transition-colors">{lastPart}</span>;
          },
        }),
        columnHelper.accessor("type", {
          header: t("common:labels.type"),
          size: 100,
          cell: ({ getValue }) => {
            const type = getValue();
            const typeCfg = SUBMISSION_TYPE[type];
            return (
              <span
                className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase border", typeCfg.badgeClass)}
              >
                <span className={cn("size-1.5 rounded-[1px]", typeCfg.dotClass)} />
                {t(`common:submissionType.${type}`)}
              </span>
            );
          },
        }),
        columnHelper.accessor("status", {
          header: t("common:labels.status"),
          size: 120,
          cell: ({ getValue }) => {
            const status = getValue();
            const statusCfg = SUBMISSION_STATUS[status];
            return (
              <div className={cn("flex items-center gap-1.5 w-fit px-2 py-1 rounded-md", statusCfg.bgClass)}>
                <HugeiconsIcon icon={statusCfg.icon} className={cn("size-3.5", statusCfg.iconClass)} />
                <span className="text-xs font-medium capitalize">{t(`common:status.${status}`)}</span>
              </div>
            );
          },
        }),
        columnHelper.accessor("station", {
          header: t("common:labels.station"),
          cell: ({ getValue, row }) => {
            const station = getValue();
            const proposedStation = row.original.proposedStation;
            const fallback = t("common:labels.newStation");
            if (station)
              return <StationIdentityCell stationId={station.station_id} operator={getOperatorById(station.operator_id)} fallback={fallback} />;
            return (
              <StationIdentityCell
                stationId={proposedStation?.station_id ?? null}
                operator={getOperatorById(proposedStation?.operator_id)}
                fallback={fallback}
              />
            );
          },
        }),
        columnHelper.accessor("submitter", {
          header: t("detail.submitter"),
          cell: ({ getValue }) => {
            const submitter = getValue();
            return (
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="size-6 shrink-0">
                  <AvatarImage src={resolveAvatarUrl(submitter.image)} />
                  <AvatarFallback className="text-[10px]">{submitter.name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{submitter.name}</div>
                  {submitter.username && <div className="truncate text-xs text-muted-foreground">@{submitter.username}</div>}
                </div>
              </div>
            );
          },
        }),
        columnHelper.accessor("cells", {
          header: t("table.cells"),
          size: 120,
          cell: ({ getValue }) => <span className="text-xs font-mono bg-muted px-2 py-1 rounded">{getValue().length}</span>,
        }),
        columnHelper.accessor("createdAt", {
          header: () => <SortableHeader label={t("common:labels.submitted")} sort={sortOrder} onToggle={handleSortToggle} />,
          size: 120,
          cell: ({ getValue }) => <span className="text-muted-foreground tabular-nums text-xs">{formatShortDate(getValue(), i18n.language)}</span>,
        }),
        columnHelper.accessor("reviewed_at", {
          header: t("common:labels.reviewed"),
          size: 120,
          cell: ({ getValue }) => <span className="text-muted-foreground tabular-nums text-xs">{formatShortDate(getValue(), i18n.language)}</span>,
        }),
      ]),
    [t, i18n.language, sortOrder, handleSortToggle, getOperatorById],
  );

  const handleRowClick = useCallback((submission: SubmissionListItem) => navigate({ to: `/admin/submissions/${submission.id}` }), [navigate]);
  const getRowHref = useCallback((submission: SubmissionListItem) => `/admin/submissions/${submission.id}`, []);

  const table = useTable({
    features: appTableFeatures,
    data: submissions,
    columns,
    manualPagination: true,
    pageCount: Math.ceil(total / pagination.pageSize),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  return (
    <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 gap-3 min-h-0 overflow-hidden">
      <div className="flex flex-col gap-3 shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("adminTitle")}</h1>
            <p className="text-muted-foreground text-sm">{t("adminDescription")}</p>
          </div>

          <div className={cn("flex flex-col sm:flex-row flex-wrap gap-2 w-full md:w-auto", showFloatingMobileFilters && "max-md:hidden")}>
            <div className="flex items-center p-1 bg-muted/50 rounded-lg border">
              {(["all", "pending", "approved", "rejected"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => handleStatusFilter(status)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize",
                    statusFilter === status
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  {status === "all" ? t("common:status.all", "All") : t(`common:status.${status}`)}
                </button>
              ))}
            </div>

            <div className="flex items-center p-1 bg-muted/50 rounded-lg border">
              {(["all", "new", "update", "delete"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeFilter(type)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize",
                    typeFilter === type
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  {type === "all" ? t("common:submissionType.all", "All") : t(`common:submissionType.${type}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={cn("flex flex-wrap items-end gap-2", showFloatingMobileFilters && "max-md:hidden")}>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t("detail.submitter")}</span>
            <UserPickerPopover selectedUserIds={selectedSubmitterIds} onSelectionChange={handleSubmitterChange} />
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-44">
            <span className="text-xs font-medium text-muted-foreground">{t("common:labels.operator")}</span>
            <Combobox multiple value={selectedOperators} onValueChange={handleOperatorChange} items={operators}>
              <ComboboxChips
                ref={operatorChipsRef}
                className="h-8 min-h-8 max-h-8 flex-nowrap overflow-hidden text-sm has-data-[slot=combobox-chip]:px-2.5"
              >
                <HugeiconsIcon icon={FullSignalIcon} className="size-3.5 shrink-0 text-muted-foreground pointer-events-none" />
                {visibleSelectedOperators.map((operator) => (
                  <ComboboxChip key={operator.id} className="max-w-20 shrink-0">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span className="size-2 rounded-[2px] shrink-0" style={{ backgroundColor: getOperatorColor(operator.mnc) }} />
                      <span className="truncate">{operator.name}</span>
                    </span>
                  </ComboboxChip>
                ))}
                {hiddenSelectedOperatorCount > 0 ? (
                  <ComboboxChip showRemove={false} className="shrink-0 text-muted-foreground">
                    +{hiddenSelectedOperatorCount}
                  </ComboboxChip>
                ) : null}
                <ComboboxChipsInput
                  className={selectedOperatorMncs.length === 0 ? "min-w-0" : "min-w-2 w-2 flex-none"}
                  placeholder={selectedOperatorMncs.length === 0 ? t("common:labels.allOperators") : ""}
                />
              </ComboboxChips>
              <ComboboxContent anchor={operatorChipsRef}>
                <ComboboxList>
                  <ComboboxEmpty>-</ComboboxEmpty>
                  {operators.map((operator) => (
                    <ComboboxItem key={operator.id} value={operator}>
                      <span className="size-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: getOperatorColor(operator.mnc) }} />
                      <span className="truncate">{operator.name}</span>
                    </ComboboxItem>
                  ))}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-52">
            <span className="text-xs font-medium text-muted-foreground">{t("common:labels.region")}</span>
            <Combobox multiple value={selectedRegions} onValueChange={handleRegionChange} items={regions}>
              <ComboboxChips
                ref={regionChipsRef}
                className="h-8 min-h-8 max-h-8 flex-nowrap overflow-hidden text-sm has-data-[slot=combobox-chip]:px-2.5"
              >
                <HugeiconsIcon icon={Location01Icon} className="size-3.5 shrink-0 text-muted-foreground pointer-events-none" />
                {visibleSelectedRegions.map((region) => (
                  <ComboboxChip key={region.id} className="max-w-32 shrink-0">
                    <span className="truncate">{region.name}</span>
                  </ComboboxChip>
                ))}
                {hiddenSelectedRegionCount > 0 ? (
                  <ComboboxChip showRemove={false} className="shrink-0 text-muted-foreground">
                    +{hiddenSelectedRegionCount}
                  </ComboboxChip>
                ) : null}
                <ComboboxChipsInput
                  className={selectedRegionIds.length === 0 ? "min-w-0" : "min-w-2 w-2 flex-none"}
                  placeholder={selectedRegionIds.length === 0 ? t("common:labels.allRegions") : ""}
                />
              </ComboboxChips>
              <ComboboxContent anchor={regionChipsRef}>
                <ComboboxList>
                  <ComboboxEmpty>-</ComboboxEmpty>
                  {regions.map((region) => (
                    <ComboboxItem key={region.id} value={region}>
                      {region.name}
                    </ComboboxItem>
                  ))}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-72">
            <span className="text-xs font-medium text-muted-foreground">{t("common:labels.search")}</span>
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
              />
              <Input
                className="h-8 pl-8 pr-8 w-full"
                placeholder={t("table.searchPlaceholder")}
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => handleSearchChange("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className={cn(
          "flex-1 min-h-0 max-md:mb-10 overflow-x-auto",
          sizePagination.pageSize > autoPageSize ? "overflow-y-auto overscroll-y-contain" : "overflow-y-clip",
        )}
      >
        <DataTable.Root table={table}>
          <DataTable.Table>
            <DataTable.Header />
            {isLoading ? (
              <DataTable.Skeleton rows={pagination.pageSize} columns={columns.length} />
            ) : isError ? (
              <tbody>
                <tr>
                  <td colSpan={columns.length} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <div className="size-10 rounded-full bg-destructive/5 flex items-center justify-center text-destructive/50 mb-3">
                        <HugeiconsIcon icon={AlertCircleIcon} className="size-5" />
                      </div>
                      <p>{t("common:error.title")}</p>
                    </div>
                  </td>
                </tr>
              </tbody>
            ) : submissions.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={columns.length} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <HugeiconsIcon icon={Search01Icon} className="size-10 mb-2 opacity-20" />
                      <p className="font-medium">{t("table.empty")}</p>
                      <p className="text-sm opacity-70">{t("table.emptyHint")}</p>
                    </div>
                  </td>
                </tr>
              </tbody>
            ) : (
              <DataTable.Body onRowClick={handleRowClick} getRowHref={getRowHref} />
            )}
            <DataTable.Footer columns={columns.length}>
              <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} />
            </DataTable.Footer>
          </DataTable.Table>
        </DataTable.Root>
      </div>
      {navActionTarget &&
        createPortal(
          showFloatingMobileFilters ? (
            <div className="max-md:w-[calc(100vw-1.5rem)] max-md:min-w-0 max-md:gap-1">
              <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden md:hidden">
                <div className="w-max mx-auto">
                  <SubmissionsMobileFilterRail
                    statusFilter={statusFilter}
                    typeFilter={typeFilter}
                    selectedSubmitterIds={selectedSubmitterIds}
                    selectedOperators={selectedOperators}
                    selectedRegions={selectedRegions}
                    operators={operators}
                    regions={regions}
                    searchInput={searchInput}
                    onStatusChange={handleStatusFilter}
                    onTypeChange={handleTypeFilter}
                    onSubmitterChange={handleSubmitterChange}
                    onOperatorChange={handleOperatorChange}
                    onRegionChange={handleRegionChange}
                    onSearchChange={handleSearchChange}
                  />
                </div>
              </div>
            </div>
          ) : null,
          navActionTarget,
        )}
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
