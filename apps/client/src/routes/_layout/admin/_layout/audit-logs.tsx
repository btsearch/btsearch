import {
  Activity01Icon,
  AlertCircleIcon,
  ArrowDown01Icon,
  Calendar03Icon,
  Cancel01Icon,
  Note01Icon,
  Search01Icon,
  Sorting05Icon,
  Tick02Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DATA_TABLE_HEADER_HEIGHT, DATA_TABLE_PAGINATION_HEIGHT, DATA_TABLE_ROW_HEIGHT, DataTable } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavActionTarget } from "@/contexts/navActions";
import { AuditLogDetailSheet } from "@/features/admin/audit-logs/components/audit-log-detail-sheet";
import { DatePickerButton } from "@/features/admin/audit-logs/components/date-picker-button";
import { UserPicker } from "@/features/admin/users/components/UserPicker";
import { UserPickerPopover } from "@/features/admin/users/components/UserPickerPopover";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { API_BASE, fetchJson } from "@/lib/api";
import { resolveAvatarUrl } from "@/lib/format";
import { type AppTableFeatures, appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

import { ACTION_GROUPS, type AuditLogEntry, TABLE_LABELS, TABLE_OPTIONS, getActionStyle } from "../../../../features/admin/audit-logs/constants";

const TABLE_PAGINATION_CONFIG = {
  rowHeight: DATA_TABLE_ROW_HEIGHT,
  headerHeight: DATA_TABLE_HEADER_HEIGHT,
  paginationHeight: DATA_TABLE_PAGINATION_HEIGHT,
  minRows: 1,
};

function formatAuditDate(dateString: string, locale: string): string {
  return new Date(dateString).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const columnHelper = createColumnHelper<AppTableFeatures, AuditLogEntry>();

type AuditLogsFilterState = {
  tableFilter: string;
  actionsFilter: string[];
  dateFrom: string;
  dateTo: string;
  queryFilter: string;
  sort: "asc" | "desc";
  selectedEntry: AuditLogEntry | null;
};

type AuditLogsSearch = {
  q?: string;
};

function parseAuditLogsQuery(value: unknown): string | undefined {
  if (typeof value === "string") return value ? value : undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function getInitialFilterState(search: AuditLogsSearch): AuditLogsFilterState {
  return {
    ...initialFilterState,
    queryFilter: search.q ?? "",
  };
}

function auditLogsFilterReducer(
  state: AuditLogsFilterState,
  action:
    | { type: "SET_TABLE_FILTER"; payload: string }
    | { type: "SET_ACTIONS_FILTER"; payload: string[] }
    | { type: "SET_DATE_FROM"; payload: string }
    | { type: "SET_DATE_TO"; payload: string }
    | { type: "SET_QUERY_FILTER"; payload: string }
    | { type: "SET_SORT"; payload: "asc" | "desc" }
    | { type: "SET_SELECTED_ENTRY"; payload: AuditLogEntry | null }
    | { type: "CLEAR_FILTERS" },
): AuditLogsFilterState {
  switch (action.type) {
    case "SET_TABLE_FILTER":
      return { ...state, tableFilter: action.payload };
    case "SET_ACTIONS_FILTER":
      return { ...state, actionsFilter: action.payload };
    case "SET_DATE_FROM":
      return { ...state, dateFrom: action.payload };
    case "SET_DATE_TO":
      return { ...state, dateTo: action.payload };
    case "SET_QUERY_FILTER":
      return { ...state, queryFilter: action.payload };
    case "SET_SORT":
      return { ...state, sort: action.payload };
    case "SET_SELECTED_ENTRY":
      return { ...state, selectedEntry: action.payload };
    case "CLEAR_FILTERS":
      return { ...state, tableFilter: "", actionsFilter: [], dateFrom: "", dateTo: "", queryFilter: "" };
    default:
      return state;
  }
}

const initialFilterState: AuditLogsFilterState = {
  tableFilter: "",
  actionsFilter: [],
  dateFrom: "",
  dateTo: "",
  queryFilter: "",
  sort: "desc",
  selectedEntry: null,
};

function ActionsFilterButton({
  value,
  onChange,
  t,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  t: ReturnType<typeof useTranslation<["admin", "common", "stationDetails"]>>["t"];
}) {
  const [open, setOpen] = useState(false);

  function toggle(action: string) {
    onChange(value.includes(action) ? value.filter((a) => a !== action) : [...value, action]);
  }

  const label = value.length === 0 ? t("auditLogs.filters.allActions") : t("auditLogs.filters.actionsCount", { count: value.length });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "h-8 rounded-lg border bg-transparent px-2.5 text-sm transition-colors flex items-center gap-2 min-w-42.5",
          "border-input dark:bg-input/30 dark:hover:bg-input/50 hover:bg-muted",
          value.length > 0 ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="truncate">{label}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} className={cn("size-3.5 shrink-0 ml-auto transition-transform", open && "rotate-180")} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0 max-h-96 overflow-y-auto">
        {value.length > 0 && (
          <div className="px-3 py-2 border-b flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t("auditLogs.filters.actionsCount", { count: value.length })}</span>
            <button type="button" onClick={() => onChange([])} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {t("common:actions.clear")}
            </button>
          </div>
        )}
        {ACTION_GROUPS.map((group, i) => (
          <div key={group.label}>
            {i > 0 && <div className="h-px bg-border mx-1" />}
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</div>
            {group.actions.map((action) => {
              const checked = value.includes(action);
              return (
                <button
                  key={action}
                  type="button"
                  onClick={() => toggle(action)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/50 transition-colors text-left"
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <span className="text-xs font-mono">{action.split(".").pop()}</span>
                  {checked && <HugeiconsIcon icon={Tick02Icon} className="size-3 text-muted-foreground ml-auto" />}
                </button>
              );
            })}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

type AuditLogsMobileFilterRailProps = {
  tableFilter: string;
  actionsFilter: string[];
  dateFrom: string;
  dateTo: string;
  queryFilter: string;
  selectedUserIds: string[];
  getTableLabel: (table: string) => string;
  onTableChange: (value: string) => void;
  onActionsChange: (value: string[]) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onUsersChange: (ids: string[]) => void;
  onClear: () => void;
};

function AuditLogsMobileFilterRail({
  tableFilter,
  actionsFilter,
  dateFrom,
  dateTo,
  queryFilter,
  selectedUserIds,
  getTableLabel,
  onTableChange,
  onActionsChange,
  onDateFromChange,
  onDateToChange,
  onQueryChange,
  onUsersChange,
  onClear,
}: AuditLogsMobileFilterRailProps) {
  const { t } = useTranslation(["admin", "common", "stationDetails"]);
  const hasActiveFilters = Boolean(tableFilter || actionsFilter.length || dateFrom || dateTo || queryFilter || selectedUserIds.length);

  return (
    <div className="flex items-center gap-1">
      <MobileFilterChip active={Boolean(queryFilter)} icon={Search01Icon} label={t("auditLogs.filters.recordId")}>
        <MobileFilterPanelTitle>{t("auditLogs.filters.recordId")}</MobileFilterPanelTitle>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="h-9 w-full pl-8 pr-8"
            placeholder={t("auditLogs.filters.recordId")}
            value={queryFilter}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
          />
          {queryFilter ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("common:actions.clear")}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          ) : null}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={Boolean(tableFilter)} icon={Note01Icon} label={t("auditLogs.columns.entity")}>
        <MobileFilterPanelTitle>{t("auditLogs.columns.entity")}</MobileFilterPanelTitle>
        <div className="grid max-h-64 gap-1 overflow-y-auto">
          <button
            type="button"
            onClick={() => onTableChange("")}
            className={cn("h-8 rounded-md px-2 text-left text-sm transition-colors", !tableFilter ? "bg-primary/10 text-primary" : "hover:bg-muted")}
          >
            {t("auditLogs.filters.allEntities")}
          </button>
          {TABLE_OPTIONS.map((table) => (
            <button
              key={table}
              type="button"
              onClick={() => onTableChange(table)}
              className={cn(
                "h-8 rounded-md px-2 text-left text-sm transition-colors",
                tableFilter === table ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              {getTableLabel(table)}
            </button>
          ))}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={actionsFilter.length > 0} count={actionsFilter.length} icon={Activity01Icon} label={t("auditLogs.columns.action")}>
        <MobileFilterPanelTitle>{t("auditLogs.columns.action")}</MobileFilterPanelTitle>
        <div className="grid max-h-64 gap-1 overflow-y-auto">
          {ACTION_GROUPS.flatMap((group) => group.actions).map((action) => {
            const selected = actionsFilter.includes(action);
            return (
              <button
                key={action}
                type="button"
                onClick={() => onActionsChange(selected ? actionsFilter.filter((value) => value !== action) : [...actionsFilter, action])}
                className={cn(
                  "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                  selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0 flex-1 truncate font-mono">{action}</span>
              </button>
            );
          })}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={selectedUserIds.length > 0} count={selectedUserIds.length} icon={UserIcon} label={t("auditLogs.columns.actor")}>
        <MobileFilterPanelTitle>{t("auditLogs.columns.actor")}</MobileFilterPanelTitle>
        <UserPicker selectedUserIds={selectedUserIds} onSelectionChange={onUsersChange} />
      </MobileFilterChip>

      <MobileFilterChip
        active={Boolean(dateFrom || dateTo)}
        count={Number(Boolean(dateFrom)) + Number(Boolean(dateTo))}
        icon={Calendar03Icon}
        label={t("auditLogs.filters.dateRange")}
      >
        <MobileFilterPanelTitle>{t("auditLogs.filters.dateRange")}</MobileFilterPanelTitle>
        <div className="flex flex-col gap-2">
          <DatePickerButton value={dateFrom} onChange={onDateFromChange} label={t("auditLogs.filters.dateFrom")} />
          <DatePickerButton value={dateTo} onChange={onDateToChange} label={t("auditLogs.filters.dateTo")} />
        </div>
      </MobileFilterChip>

      {hasActiveFilters ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("common:actions.clearAll")}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function AdminAuditLogsPage() {
  "use no memo";
  const { t, i18n } = useTranslation(["admin", "common", "stationDetails"]);
  const navigate = useNavigate();
  const search = Route.useSearch();
  const navActionTarget = useNavActionTarget();
  const showFloatingMobileFilters = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  const [filterState, dispatchFilter] = useReducer(auditLogsFilterReducer, search, getInitialFilterState);
  const { tableFilter, actionsFilter, dateFrom, dateTo, queryFilter, sort, selectedEntry } = filterState;

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const { containerRef, pagination, setPagination, autoPageSize, pageSizeOptions } = useTablePagination(TABLE_PAGINATION_CONFIG);

  const resetPage = useCallback(() => setPagination((prev) => ({ ...prev, pageIndex: 0 })), [setPagination]);

  useEffect(() => {
    dispatchFilter({ type: "SET_QUERY_FILTER", payload: search.q ?? "" });
    resetPage();
  }, [search.q, resetPage]);

  const hasActiveFilters = !!(tableFilter || actionsFilter.length || dateFrom || dateTo || queryFilter || selectedUserIds.length);
  const activeFilterCount = [tableFilter, actionsFilter.length > 0, dateFrom, dateTo, queryFilter, selectedUserIds.length > 0].filter(Boolean).length;

  const clearAllFilters = useCallback(() => {
    dispatchFilter({ type: "CLEAR_FILTERS" });
    setSelectedUserIds([]);
    resetPage();
    void navigate({ from: Route.fullPath, search: (s) => ({ ...s, q: undefined }), replace: true });
  }, [navigate, resetPage]);

  const handleQueryFilterChange = useCallback(
    (value: string) => {
      dispatchFilter({ type: "SET_QUERY_FILTER", payload: value });
      resetPage();
      void navigate({ from: Route.fullPath, search: (s) => ({ ...s, q: value || undefined }), replace: true });
    },
    [navigate, resetPage],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "admin",
      "audit-logs",
      pagination.pageIndex,
      pagination.pageSize,
      tableFilter,
      actionsFilter,
      dateFrom,
      dateTo,
      queryFilter,
      selectedUserIds,
      sort,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", pagination.pageSize.toString());
      params.set("offset", (pagination.pageIndex * pagination.pageSize).toString());
      params.set("sort", sort);
      if (tableFilter) params.set("table_name", tableFilter);
      if (actionsFilter.length > 0) params.set("actions", actionsFilter.join(","));
      if (queryFilter) params.set("record_id", queryFilter);
      if (selectedUserIds.length > 0) params.set("user_ids", selectedUserIds.join(","));
      if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        params.set("to", to.toISOString());
      }
      return fetchJson<{ data: AuditLogEntry[]; totalCount: number }>(`${API_BASE}/audit-logs?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const logs = data?.data ?? [];
  const total = data?.totalCount ?? 0;
  const getTableLabel = useCallback(
    (table: string) => (table === "station_sectors" ? t("tabs.sectors", { ns: "stationDetails" }) : (TABLE_LABELS[table] ?? table)),
    [t],
  );

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("createdAt", {
          header: () => (
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-foreground -ml-1 px-1 py-0.5 rounded transition-colors"
              onClick={() => {
                dispatchFilter({ type: "SET_SORT", payload: sort === "desc" ? "asc" : "desc" });
                resetPage();
              }}
            >
              {t("auditLogs.columns.timestamp")}
              <HugeiconsIcon
                icon={Sorting05Icon}
                className="size-3.5 text-foreground"
                style={sort === "asc" ? { transform: "scaleY(-1)" } : undefined}
              />
            </button>
          ),
          size: 160,
          cell: ({ getValue }) => (
            <span className="text-muted-foreground tabular-nums text-xs font-mono">{formatAuditDate(getValue(), i18n.language)}</span>
          ),
        }),
        columnHelper.accessor("user", {
          header: t("auditLogs.columns.actor"),
          size: 180,
          cell: ({ getValue }) => {
            const user = getValue();
            if (!user) {
              return <span className="text-muted-foreground italic text-xs">{t("auditLogs.actor.system")}</span>;
            }
            return (
              <div className="flex items-center gap-2">
                <Avatar className="size-6">
                  <AvatarImage src={resolveAvatarUrl(user.image)} />
                  <AvatarFallback className="text-[9px]">{user.name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <span className="truncate max-w-28 text-xs font-medium">{user.name}</span>
                  {user.username && <span className="truncate max-w-28 text-[10px] text-muted-foreground">@{user.username}</span>}
                </div>
              </div>
            );
          },
        }),
        columnHelper.accessor("action", {
          header: t("auditLogs.columns.action"),
          size: 200,
          cell: ({ getValue }) => {
            const action = getValue();
            const style = getActionStyle(action);
            return (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider border",
                  style.badgeClass,
                )}
              >
                <span className={cn("size-1.5 rounded-[1px]", style.dotClass)} />
                {action}
              </span>
            );
          },
        }),
        columnHelper.accessor("table_name", {
          header: t("auditLogs.columns.entity"),
          size: 120,
          cell: ({ getValue }) => <span className="text-xs font-medium">{getTableLabel(getValue())}</span>,
        }),
        columnHelper.accessor("record_id", {
          header: t("auditLogs.columns.record"),
          size: 100,
          cell: ({ getValue, row }) => {
            const recordId = getValue();
            const fallbackId =
              (row.original.old_values as Record<string, unknown> | null)?.id ??
              (row.original.new_values as Record<string, unknown> | null)?.id ??
              null;
            const displayId = recordId ?? fallbackId;
            const shortId =
              displayId !== null
                ? String(displayId as string | number)
                    .split("-")
                    .pop()
                : null;
            return shortId !== null ? (
              <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded" title={String(displayId as string | number)}>
                #{shortId}
              </span>
            ) : (
              <span className="text-muted-foreground text-xs">-</span>
            );
          },
        }),
        columnHelper.accessor("source", {
          header: t("auditLogs.columns.source"),
          size: 80,
          cell: ({ getValue }) => <span className="text-xs text-muted-foreground uppercase">{getValue() ?? "-"}</span>,
        }),
      ]),
    [t, sort, i18n.language, resetPage, getTableLabel],
  );
  const sorting = useMemo(() => [{ id: "createdAt", desc: sort === "desc" }], [sort]);

  const table = useTable({
    features: appTableFeatures,
    data: logs,
    columns,
    manualPagination: true,
    manualSorting: true,
    pageCount: Math.ceil(total / pagination.pageSize),
    state: { pagination, sorting },
    onPaginationChange: setPagination,
  });

  return (
    <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 gap-3 min-h-0 overflow-hidden">
      <div className="flex flex-col gap-3 shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("nav:items.auditLogs")}</h1>
            <p className="text-muted-foreground text-sm">{t("auditLogs.subtitle")}</p>
          </div>
        </div>

        <div className={cn("flex flex-wrap items-end gap-2", showFloatingMobileFilters && "max-md:hidden")}>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t("auditLogs.columns.entity")}</span>
            <Select
              value={tableFilter === "" ? "__all__" : tableFilter}
              onValueChange={(v) => {
                dispatchFilter({ type: "SET_TABLE_FILTER", payload: v === "__all__" ? "" : (v as string) });
                resetPage();
              }}
            >
              <SelectTrigger className="min-w-35">
                <SelectValue>{tableFilter === "" ? t("auditLogs.filters.allEntities") : getTableLabel(tableFilter)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("auditLogs.filters.allEntities")}</SelectItem>
                {TABLE_OPTIONS.map((table) => (
                  <SelectItem key={table} value={table}>
                    {getTableLabel(table)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t("auditLogs.columns.action")}</span>
            <ActionsFilterButton
              t={t}
              value={actionsFilter}
              onChange={(v) => {
                dispatchFilter({ type: "SET_ACTIONS_FILTER", payload: v });
                resetPage();
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t("auditLogs.filters.recordId")}</span>
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
              />
              <Input
                className="h-8 pl-7 w-40"
                placeholder={t("auditLogs.filters.recordId")}
                value={queryFilter}
                onChange={(e) => handleQueryFilterChange(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t("auditLogs.columns.actor")}</span>
            <UserPickerPopover
              selectedUserIds={selectedUserIds}
              onSelectionChange={(ids) => {
                setSelectedUserIds(ids);
                resetPage();
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t("auditLogs.filters.dateFrom")}</span>
            <DatePickerButton
              value={dateFrom}
              onChange={(v) => {
                dispatchFilter({ type: "SET_DATE_FROM", payload: v });
                resetPage();
              }}
              label={t("auditLogs.filters.dateFrom")}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t("auditLogs.filters.dateTo")}</span>
            <DatePickerButton
              value={dateTo}
              onChange={(v) => {
                dispatchFilter({ type: "SET_DATE_TO", payload: v });
                resetPage();
              }}
              label={t("auditLogs.filters.dateTo")}
            />
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground">
              <HugeiconsIcon icon={Cancel01Icon} className="size-3" data-icon="inline-start" />
              {t("common:actions.clearAll")}
              <span className="ml-1 bg-muted text-muted-foreground rounded-sm px-1.5 py-0.5 text-[10px] font-bold leading-none">
                {activeFilterCount}
              </span>
            </Button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className={cn("flex-1 min-h-0 max-md:mb-10 overflow-x-hidden", pagination.pageSize > autoPageSize ? "overflow-y-auto" : "overflow-y-clip")}
      >
        <div className="custom-scrollbar overflow-x-auto">
          <DataTable.Root table={table} className="block rounded-b-none border-b-0">
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
              ) : logs.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={columns.length} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <HugeiconsIcon icon={Search01Icon} className="size-10 mb-2 opacity-20" />
                        <p className="font-medium">{t("auditLogs.empty.title")}</p>
                        <p className="text-sm opacity-70">{t("auditLogs.empty.subtitle")}</p>
                      </div>
                    </td>
                  </tr>
                </tbody>
              ) : (
                <DataTable.Body onRowClick={(row: AuditLogEntry) => dispatchFilter({ type: "SET_SELECTED_ENTRY", payload: row })} />
              )}
            </DataTable.Table>
          </DataTable.Root>
        </div>
        <DataTable.PaginationFooter>
          <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} />
        </DataTable.PaginationFooter>
      </div>

      <AuditLogDetailSheet
        entry={selectedEntry}
        open={selectedEntry !== null}
        onOpenChange={(open) => {
          if (!open) dispatchFilter({ type: "SET_SELECTED_ENTRY", payload: null });
        }}
      />
      {navActionTarget &&
        createPortal(
          showFloatingMobileFilters ? (
            <div className="max-md:w-[calc(100vw-1.5rem)] max-md:min-w-0 max-md:gap-1">
              <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden md:hidden">
                <div className="w-max">
                  <AuditLogsMobileFilterRail
                    tableFilter={tableFilter}
                    actionsFilter={actionsFilter}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    queryFilter={queryFilter}
                    selectedUserIds={selectedUserIds}
                    getTableLabel={getTableLabel}
                    onTableChange={(value) => {
                      dispatchFilter({ type: "SET_TABLE_FILTER", payload: value });
                      resetPage();
                    }}
                    onActionsChange={(value) => {
                      dispatchFilter({ type: "SET_ACTIONS_FILTER", payload: value });
                      resetPage();
                    }}
                    onDateFromChange={(value) => {
                      dispatchFilter({ type: "SET_DATE_FROM", payload: value });
                      resetPage();
                    }}
                    onDateToChange={(value) => {
                      dispatchFilter({ type: "SET_DATE_TO", payload: value });
                      resetPage();
                    }}
                    onQueryChange={handleQueryFilterChange}
                    onUsersChange={(ids) => {
                      setSelectedUserIds(ids);
                      resetPage();
                    }}
                    onClear={clearAllFilters}
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

export const Route = createFileRoute("/_layout/admin/_layout/audit-logs")({
  validateSearch: (search: Record<string, unknown>): AuditLogsSearch => ({
    q: parseAuditLogsQuery(search.q),
  }),
  component: AdminAuditLogsPage,
  staticData: {
    titleKey: "items.auditLogs",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "breadcrumbs.admin", path: "/admin/stations", i18nNamespace: "admin" }],
  },
});
