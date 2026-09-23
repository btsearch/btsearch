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
import type { AuditEntity, AuditOperationKind } from "@openbts/shared/audit";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import type { TFunction } from "i18next";
import { useCallback, useMemo, useReducer, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DATA_TABLE_HEADER_HEIGHT, DATA_TABLE_PAGINATION_HEIGHT, DATA_TABLE_ROW_HEIGHT, DataTable } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Input } from "@/components/ui/input";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useNavActionTarget } from "@/contexts/navActions";
import { DatePickerButton } from "@/features/admin/audit-operations/components/datePickerButton";
import { OperationDetailSheet } from "@/features/admin/audit-operations/components/operationDetailSheet";
import { OperationKindBadge } from "@/features/admin/audit-operations/components/operationKindBadge";
import { UserChip } from "@/features/admin/audit-operations/components/userChip";
import { ENTITY_OPTIONS, KIND_GROUPS } from "@/features/admin/audit-operations/constants";
import { formatCountsSummary, getEntityLabel, getKindLabel } from "@/features/admin/audit-operations/labels";
import { auditOperationsQueryOptions } from "@/features/admin/audit-operations/queries";
import type { AuditOperationSummary } from "@/features/admin/audit-operations/types";
import { UserPicker } from "@/features/admin/users/components/UserPicker";
import { UserPickerPopover } from "@/features/admin/users/components/UserPickerPopover";
import { useIsMobile } from "@/hooks/useMobile";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { type AppTableFeatures, appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

const TABLE_PAGINATION_CONFIG = {
  rowHeight: DATA_TABLE_ROW_HEIGHT,
  headerHeight: DATA_TABLE_HEADER_HEIGHT,
  paginationHeight: DATA_TABLE_PAGINATION_HEIGHT,
  minRows: 1,
};
const MOBILE_PAGINATION_CONFIG = { rowHeight: 112, headerHeight: DATA_TABLE_HEADER_HEIGHT, paginationHeight: 51, minRows: 1 };
const SORT_ASC_STYLE = { transform: "scaleY(-1)" };

const ALL_KINDS = KIND_GROUPS.flatMap((group) => group.kinds);
const EMPTY_OPERATIONS: AuditOperationSummary[] = [];
const MOBILE_AUDIT_SKELETON_ROWS = Array.from({ length: 6 }, (_, index) => (
  <div key={index} className="space-y-2.5 px-3 py-2.5">
    <div className="flex items-center justify-between gap-3">
      <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      <div className="h-3.5 w-28 animate-pulse rounded bg-muted" />
    </div>
    <div className="flex items-center justify-between gap-3">
      <div className="h-6 w-36 animate-pulse rounded bg-muted" />
      <div className="h-3.5 w-12 animate-pulse rounded bg-muted" />
    </div>
    <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
  </div>
));
const auditDateFormatters = new Map<string, Intl.DateTimeFormat>();

function formatAuditDate(dateString: string, locale: string): string {
  let formatter = auditDateFormatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    auditDateFormatters.set(locale, formatter);
  }
  return formatter.format(new Date(dateString));
}

const columnHelper = createColumnHelper<AppTableFeatures, AuditOperationSummary>();

type AuditOperationsFilterState = {
  entityFilter: AuditEntity | "";
  kindsFilter: AuditOperationKind[];
  selectedUserIds: string[];
  dateFrom: string;
  dateTo: string;
  sort: "asc" | "desc";
};

type AuditLogsSearch = {
  q?: string;
  operation?: number;
};

function parseAuditLogsQuery(value: unknown): string | undefined {
  if (typeof value === "string") return value ? value : undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function parseOperationId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function isAuditEntity(value: unknown): value is AuditEntity {
  return typeof value === "string" && ENTITY_OPTIONS.some((entity) => entity === value);
}

function auditOperationsFilterReducer(
  state: AuditOperationsFilterState,
  action:
    | { type: "SET_ENTITY_FILTER"; payload: AuditEntity | "" }
    | { type: "SET_KINDS_FILTER"; payload: AuditOperationKind[] }
    | { type: "SET_USER_IDS"; payload: string[] }
    | { type: "SET_DATE_FROM"; payload: string }
    | { type: "SET_DATE_TO"; payload: string }
    | { type: "SET_SORT"; payload: "asc" | "desc" }
    | { type: "CLEAR_FILTERS" },
): AuditOperationsFilterState {
  switch (action.type) {
    case "SET_ENTITY_FILTER":
      return { ...state, entityFilter: action.payload };
    case "SET_KINDS_FILTER":
      return { ...state, kindsFilter: action.payload };
    case "SET_USER_IDS":
      return { ...state, selectedUserIds: action.payload };
    case "SET_DATE_FROM":
      return { ...state, dateFrom: action.payload };
    case "SET_DATE_TO":
      return { ...state, dateTo: action.payload };
    case "SET_SORT":
      return { ...state, sort: action.payload };
    case "CLEAR_FILTERS":
      return { ...state, entityFilter: "", kindsFilter: [], selectedUserIds: [], dateFrom: "", dateTo: "" };
  }
}

const initialFilterState: AuditOperationsFilterState = {
  entityFilter: "",
  kindsFilter: [],
  selectedUserIds: [],
  dateFrom: "",
  dateTo: "",
  sort: "desc",
};

function KindsFilterButton({ value, onChange }: { value: AuditOperationKind[]; onChange: (value: AuditOperationKind[]) => void }) {
  const { t } = useTranslation(["admin", "common"]);
  const [open, setOpen] = useState(false);

  const label = value.length === 0 ? t("auditLogs.filters.allKinds") : t("auditLogs.filters.kindsCount", { count: value.length });

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
      <PopoverContent align="start" className="w-72 p-0 max-h-96 overflow-y-auto">
        {value.length > 0 ? (
          <div className="px-3 py-2 border-b flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t("auditLogs.filters.kindsCount", { count: value.length })}</span>
            <button type="button" onClick={() => onChange([])} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {t("common:actions.clear")}
            </button>
          </div>
        ) : null}
        {KIND_GROUPS.map((group, index) => (
          <div key={group.key}>
            {index > 0 ? <div className="h-px bg-border mx-1" /> : null}
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t(`auditLogs.groups.${group.key}`, { defaultValue: group.key })}
            </div>
            {group.kinds.map((kind) => {
              const checked = value.includes(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => onChange(checked ? value.filter((item) => item !== kind) : [...value, kind])}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/50 transition-colors text-left"
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <span className="min-w-0 truncate text-xs">{getKindLabel(t, kind)}</span>
                  {checked ? <HugeiconsIcon icon={Tick02Icon} className="size-3 text-muted-foreground ml-auto" /> : null}
                </button>
              );
            })}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

type AuditOperationsMobileFilterRailProps = {
  entityFilter: AuditEntity | "";
  kindsFilter: AuditOperationKind[];
  dateFrom: string;
  dateTo: string;
  queryFilter: string;
  selectedUserIds: string[];
  onEntityChange: (value: AuditEntity | "") => void;
  onKindsChange: (value: AuditOperationKind[]) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onUsersChange: (ids: string[]) => void;
  onClear: () => void;
};

function AuditOperationsMobileFilterRail({
  entityFilter,
  kindsFilter,
  dateFrom,
  dateTo,
  queryFilter,
  selectedUserIds,
  onEntityChange,
  onKindsChange,
  onDateFromChange,
  onDateToChange,
  onQueryChange,
  onUsersChange,
  onClear,
}: AuditOperationsMobileFilterRailProps) {
  const { t } = useTranslation(["admin", "common"]);
  const hasActiveFilters = Boolean(entityFilter || kindsFilter.length || dateFrom || dateTo || queryFilter || selectedUserIds.length);

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

      <MobileFilterChip active={Boolean(entityFilter)} icon={Note01Icon} label={t("auditLogs.columns.entity")}>
        <MobileFilterPanelTitle>{t("auditLogs.columns.entity")}</MobileFilterPanelTitle>
        <div className="grid max-h-64 gap-1 overflow-y-auto">
          <button
            type="button"
            onClick={() => onEntityChange("")}
            className={cn("h-8 rounded-md px-2 text-left text-sm transition-colors", !entityFilter ? "bg-primary/10 text-primary" : "hover:bg-muted")}
          >
            {t("auditLogs.filters.allEntities")}
          </button>
          {ENTITY_OPTIONS.map((entity) => (
            <button
              key={entity}
              type="button"
              onClick={() => onEntityChange(entity)}
              className={cn(
                "h-8 rounded-md px-2 text-left text-sm transition-colors",
                entityFilter === entity ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              {getEntityLabel(t, entity)}
            </button>
          ))}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={kindsFilter.length > 0} count={kindsFilter.length} icon={Activity01Icon} label={t("auditLogs.columns.kind")}>
        <MobileFilterPanelTitle>{t("auditLogs.columns.kind")}</MobileFilterPanelTitle>
        <div className="grid max-h-64 gap-1 overflow-y-auto">
          {ALL_KINDS.map((kind) => {
            const selected = kindsFilter.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => onKindsChange(selected ? kindsFilter.filter((value) => value !== kind) : [...kindsFilter, kind])}
                className={cn(
                  "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                  selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{getKindLabel(t, kind)}</span>
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

function getPerformerAttribution(t: TFunction, operation: AuditOperationSummary): string | null {
  const { actor, performer } = operation;
  if (performer === null || performer.id === actor?.id) return null;

  const performerName = performer.name ?? performer.username ?? t("auditLogs.actor.system");
  return performer.username
    ? t("auditLogs.actor.viaWithUsername", { name: performerName, username: performer.username })
    : t("auditLogs.actor.via", { name: performerName });
}

function getOperationTargetLabel(t: TFunction, operation: AuditOperationSummary): string {
  if (operation.station_ids.length === 1) return `#${operation.station_ids[0]}`;
  if (operation.station_ids.length > 1) return t("auditLogs.target.stations", { count: operation.station_ids.length });

  const entities = [...new Set(operation.counts.map((count) => count.entity))];
  return entities.length > 0 ? entities.map((entity) => getEntityLabel(t, entity)).join(", ") : "-";
}

function AuditOperationTarget({ operation, targetLabel, className }: { operation: AuditOperationSummary; targetLabel: string; className?: string }) {
  const stationId = operation.station_ids.length === 1 ? operation.station_ids[0] : undefined;

  if (stationId !== undefined)
    return (
      <Link
        to="/admin/stations/$id"
        params={{ id: String(stationId) }}
        search={{ uke: undefined }}
        className={cn(
          "pointer-events-auto rounded-sm text-xs font-mono text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {targetLabel}
      </Link>
    );

  return <span className={cn("text-xs", targetLabel === "-" ? "text-muted-foreground" : "font-medium", className)}>{targetLabel}</span>;
}

function AuditOperationMobileRow({
  operation,
  locale,
  onOpenOperation,
  t,
}: {
  operation: AuditOperationSummary;
  locale: string;
  onOpenOperation: (operationId: number) => void;
  t: TFunction;
}) {
  const timestamp = formatAuditDate(operation.createdAt, locale);
  const performerAttribution = getPerformerAttribution(t, operation);
  const targetLabel = getOperationTargetLabel(t, operation);
  const changesSummary = formatCountsSummary(t, operation.counts);
  const actorLabel = operation.actor?.name ?? operation.actor?.username ?? t("auditLogs.actor.system");
  const ariaLabel = [getKindLabel(t, operation.kind), timestamp, actorLabel, performerAttribution, targetLabel, changesSummary, operation.source]
    .filter(Boolean)
    .join(", ");

  return (
    <li className="group relative transition-colors hover:bg-muted/50">
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-pointer rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={ariaLabel}
        onClick={() => onOpenOperation(operation.id)}
      />
      <div className="pointer-events-none relative z-20 px-3 py-2.5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <OperationKindBadge
            kind={operation.kind}
            t={t}
            compact
            className="h-auto max-w-full shrink whitespace-normal py-1 text-left [&>svg]:shrink-0"
          />
          <time className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground" dateTime={operation.createdAt}>
            {timestamp}
          </time>
        </div>
        <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
          <div className="min-w-0">
            <UserChip user={operation.actor} systemLabel={t("auditLogs.actor.system")} />
            {performerAttribution !== null ? (
              <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{performerAttribution}</span>
            ) : null}
          </div>
          <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{operation.source}</span>
        </div>
        <div className="mt-2 min-w-0 text-xs">
          <AuditOperationTarget operation={operation} targetLabel={targetLabel} className="relative z-30" />
          {changesSummary ? (
            <>
              <span className="px-2 text-border" aria-hidden="true">
                ·
              </span>
              <span className="text-muted-foreground">{changesSummary}</span>
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}

type AuditOperationsMobileListProps = {
  isLoading: boolean;
  isError: boolean;
  operations: AuditOperationSummary[];
  pageSize: number;
  sort: "asc" | "desc";
  locale: string;
  onSortToggle: () => void;
  onOpenOperation: (operationId: number) => void;
  onRetry: () => unknown;
};

function AuditOperationsMobileList({
  isLoading,
  isError,
  operations,
  pageSize,
  sort,
  locale,
  onSortToggle,
  onOpenOperation,
  onRetry,
}: AuditOperationsMobileListProps) {
  const { t } = useTranslation(["admin", "common"]);

  if (isError && operations.length === 0)
    return (
      <div
        className="flex min-h-64 flex-1 flex-col items-center justify-center rounded-t-lg border border-b-0 bg-card px-4 text-center text-muted-foreground"
        role="alert"
      >
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-destructive/5 text-destructive/60">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-5" />
        </div>
        <p className="font-medium text-foreground">{t("common:error.title")}</p>
        <p className="mt-1 max-w-md text-sm">{t("common:error.description")}</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => void onRetry()}>
          {t("common:actions.retry")}
        </Button>
      </div>
    );

  const sortDirection = sort === "asc" ? t("common:sorting.ascending") : t("common:sorting.descending");

  return (
    <div className="overflow-hidden rounded-t-lg border border-b-0 bg-card">
      <div className="flex h-10 items-center border-b bg-muted/20 px-2">
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-md bg-muted px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onSortToggle}
          aria-label={`${t("auditLogs.columns.timestamp")}: ${sortDirection}`}
        >
          {t("auditLogs.columns.timestamp")}
          <HugeiconsIcon
            icon={Sorting05Icon}
            aria-hidden="true"
            className="size-3.5 text-foreground"
            style={sort === "asc" ? SORT_ASC_STYLE : undefined}
          />
        </button>
      </div>
      {isLoading ? (
        <div className="divide-y" aria-hidden="true">
          {MOBILE_AUDIT_SKELETON_ROWS.slice(0, Math.min(pageSize, MOBILE_AUDIT_SKELETON_ROWS.length))}
        </div>
      ) : null}
      {!isLoading && operations.length === 0 ? (
        <div className="flex min-h-64 flex-1 flex-col items-center justify-center px-4 text-center text-muted-foreground" role="status">
          <HugeiconsIcon icon={Search01Icon} className="mb-2 size-10 opacity-20" />
          <p className="font-medium text-foreground">{t("auditLogs.empty.title")}</p>
          <p className="text-sm opacity-80">{t("auditLogs.empty.subtitle")}</p>
        </div>
      ) : null}
      {!isLoading && operations.length > 0 ? (
        <ul className="divide-y">
          {operations.map((operation) => (
            <AuditOperationMobileRow key={operation.id} operation={operation} locale={locale} onOpenOperation={onOpenOperation} t={t} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type AuditOperationsTableRowsProps = {
  columnsCount: number;
  isLoading: boolean;
  isError: boolean;
  operations: AuditOperationSummary[];
  pageSize: number;
  onOpenOperation: (operationId: number) => void;
};

function AuditOperationsTableRows({ columnsCount, isLoading, isError, operations, pageSize, onOpenOperation }: AuditOperationsTableRowsProps) {
  const { t } = useTranslation(["admin", "common"]);
  const handleRowClick = useCallback((row: AuditOperationSummary) => onOpenOperation(row.id), [onOpenOperation]);

  if (isLoading) return <DataTable.Skeleton rows={pageSize} columns={columnsCount} />;

  if (isError)
    return (
      <tbody>
        <tr>
          <td colSpan={columnsCount} className="h-64 text-center">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <div className="size-10 rounded-full bg-destructive/5 flex items-center justify-center text-destructive/50 mb-3">
                <HugeiconsIcon icon={AlertCircleIcon} className="size-5" />
              </div>
              <p>{t("common:error.title")}</p>
            </div>
          </td>
        </tr>
      </tbody>
    );

  if (operations.length === 0)
    return (
      <tbody>
        <tr>
          <td colSpan={columnsCount} className="h-64 text-center">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <HugeiconsIcon icon={Search01Icon} className="size-10 mb-2 opacity-20" />
              <p className="font-medium">{t("auditLogs.empty.title")}</p>
              <p className="text-sm opacity-70">{t("auditLogs.empty.subtitle")}</p>
            </div>
          </td>
        </tr>
      </tbody>
    );

  return <DataTable.Body onRowClick={handleRowClick} />;
}

function AdminAuditLogsPage() {
  "use no memo";
  const { t, i18n } = useTranslation(["admin", "common"]);
  const navigate = useNavigate();
  const search = Route.useSearch();
  const queryFilter = search.q ?? "";
  const navActionTarget = useNavActionTarget();
  const isMobile = useIsMobile();
  const showFloatingMobileFilters = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  const [filterState, dispatchFilter] = useReducer(auditOperationsFilterReducer, initialFilterState);
  const { entityFilter, kindsFilter, selectedUserIds, dateFrom, dateTo, sort } = filterState;

  const desktopPagination = useTablePagination(TABLE_PAGINATION_CONFIG);
  const mobilePagination = useTablePagination(MOBILE_PAGINATION_CONFIG);
  const { setPagination: setDesktopPagination } = desktopPagination;
  const { setPagination: setMobilePagination } = mobilePagination;
  const { containerRef, pagination, setPagination, autoPageSize, pageSizeOptions } = isMobile ? mobilePagination : desktopPagination;

  const resetPage = useCallback(() => {
    setDesktopPagination((previous) => ({ ...previous, pageIndex: 0 }));
    setMobilePagination((previous) => ({ ...previous, pageIndex: 0 }));
  }, [setDesktopPagination, setMobilePagination]);
  const handleSortToggle = useCallback(() => {
    dispatchFilter({ type: "SET_SORT", payload: sort === "desc" ? "asc" : "desc" });
    resetPage();
  }, [resetPage, sort]);

  const activeFilterCount = [
    entityFilter !== "",
    kindsFilter.length > 0,
    dateFrom !== "",
    dateTo !== "",
    queryFilter !== "",
    selectedUserIds.length > 0,
  ].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;

  function clearAllFilters(): void {
    dispatchFilter({ type: "CLEAR_FILTERS" });
    resetPage();
    void navigate({ from: Route.fullPath, search: (current) => ({ ...current, q: undefined }), replace: true });
  }

  function handleQueryFilterChange(value: string): void {
    resetPage();
    void navigate({ from: Route.fullPath, search: (current) => ({ ...current, q: value || undefined }), replace: true });
  }

  const openOperation = useCallback(
    (operationId: number): void => {
      void navigate({ from: Route.fullPath, search: (current) => ({ ...current, operation: operationId }), replace: true });
    },
    [navigate],
  );
  const { data, isLoading, isFetching, isError, refetch } = useQuery(
    auditOperationsQueryOptions({
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
      sort,
      entities: entityFilter ? [entityFilter] : undefined,
      kinds: kindsFilter.length > 0 ? kindsFilter : undefined,
      userIds: selectedUserIds.length > 0 ? selectedUserIds : undefined,
      from: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
      to: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
      q: queryFilter || undefined,
    }),
  );

  const operations = data?.data ?? EMPTY_OPERATIONS;
  const total = data?.totalCount ?? 0;
  const selectedRow = operations.find((operation) => operation.id === search.operation);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("createdAt", {
          header: () => (
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-foreground -ml-1 px-1 py-0.5 rounded transition-colors"
              onClick={handleSortToggle}
            >
              {t("auditLogs.columns.timestamp")}
              <HugeiconsIcon icon={Sorting05Icon} className="size-3.5 text-foreground" style={sort === "asc" ? SORT_ASC_STYLE : undefined} />
            </button>
          ),
          size: 160,
          cell: ({ getValue }) => (
            <span className="text-muted-foreground tabular-nums text-xs font-mono">{formatAuditDate(getValue(), i18n.language)}</span>
          ),
        }),
        columnHelper.accessor("actor", {
          header: t("auditLogs.columns.actor"),
          size: 180,
          cell: ({ getValue, row }) => {
            const actor = getValue();
            const performerAttribution = getPerformerAttribution(t, row.original);
            return (
              <div className="min-w-0">
                <UserChip user={actor} systemLabel={t("auditLogs.actor.system")} />
                {performerAttribution !== null ? (
                  <span className="mt-0.5 block max-w-36 truncate text-[10px] text-muted-foreground">{performerAttribution}</span>
                ) : null}
              </div>
            );
          },
        }),
        columnHelper.accessor("kind", {
          header: t("auditLogs.columns.kind"),
          size: 200,
          cell: ({ getValue }) => <OperationKindBadge kind={getValue()} t={t} />,
        }),
        columnHelper.display({
          id: "target",
          header: t("auditLogs.columns.target"),
          size: 130,
          cell: ({ row }) => <AuditOperationTarget operation={row.original} targetLabel={getOperationTargetLabel(t, row.original)} />,
        }),
        columnHelper.display({
          id: "changes",
          header: t("auditLogs.columns.changes"),
          size: 180,
          cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatCountsSummary(t, row.original.counts)}</span>,
        }),
        columnHelper.accessor("source", {
          header: t("auditLogs.columns.source"),
          size: 80,
          cell: ({ getValue }) => <span className="text-xs text-muted-foreground uppercase">{getValue()}</span>,
        }),
      ]),
    [t, sort, i18n.language, handleSortToggle],
  );
  const sorting = useMemo(() => [{ id: "createdAt", desc: sort === "desc" }], [sort]);

  const table = useTable({
    features: appTableFeatures,
    data: operations,
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
              value={entityFilter || "__all__"}
              onValueChange={(value) => {
                dispatchFilter({ type: "SET_ENTITY_FILTER", payload: isAuditEntity(value) ? value : "" });
                resetPage();
              }}
            >
              <SelectTrigger className="min-w-35">
                <SelectValue>{entityFilter ? getEntityLabel(t, entityFilter) : t("auditLogs.filters.allEntities")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("auditLogs.filters.allEntities")}</SelectItem>
                {ENTITY_OPTIONS.map((entity) => (
                  <SelectItem key={entity} value={entity}>
                    {getEntityLabel(t, entity)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t("auditLogs.columns.kind")}</span>
            <KindsFilterButton
              value={kindsFilter}
              onChange={(value) => {
                dispatchFilter({ type: "SET_KINDS_FILTER", payload: value });
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
                dispatchFilter({ type: "SET_USER_IDS", payload: ids });
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
        className={cn(
          "relative flex-1 min-h-0 max-md:mb-10 overflow-x-hidden",
          isMobile ? "overflow-y-auto overscroll-y-contain" : pagination.pageSize > autoPageSize ? "overflow-y-auto" : "overflow-y-clip",
        )}
        aria-busy={isMobile && isFetching}
      >
        {isMobile && isFetching && !isLoading ? (
          <div
            className="absolute right-2 top-2 z-40 inline-flex items-center gap-1.5 rounded-md border bg-background/95 px-2 py-1 text-xs text-muted-foreground shadow-sm"
            role="status"
          >
            <Spinner role="presentation" aria-hidden="true" className="size-3.5" />
            {t("common:actions.updating")}
          </div>
        ) : null}
        {isMobile && !isFetching && isError && operations.length > 0 ? (
          <div
            className="absolute right-2 top-2 z-40 inline-flex items-center gap-2 rounded-md border border-destructive/30 bg-background/95 px-2 py-1 text-xs text-destructive shadow-sm"
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
            <AuditOperationsMobileList
              isLoading={isLoading}
              isError={isError}
              operations={operations}
              pageSize={pagination.pageSize}
              sort={sort}
              locale={i18n.language}
              onSortToggle={handleSortToggle}
              onOpenOperation={openOperation}
              onRetry={refetch}
            />
            <DataTable.PaginationFooter>
              <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} showRowsPerPage={false} />
            </DataTable.PaginationFooter>
          </div>
        ) : (
          <div className="min-w-full">
            <div className="custom-scrollbar overflow-x-auto">
              <DataTable.Root table={table} className="block rounded-b-none border-b-0">
                <DataTable.Table>
                  <DataTable.Header />
                  <AuditOperationsTableRows
                    columnsCount={columns.length}
                    isLoading={isLoading}
                    isError={isError}
                    operations={operations}
                    pageSize={pagination.pageSize}
                    onOpenOperation={openOperation}
                  />
                </DataTable.Table>
              </DataTable.Root>
            </div>
            <DataTable.PaginationFooter>
              <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} />
            </DataTable.PaginationFooter>
          </div>
        )}
      </div>

      {search.operation !== undefined ? (
        <OperationDetailSheet
          operationId={search.operation}
          listRow={selectedRow}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) void navigate({ from: Route.fullPath, search: (current) => ({ ...current, operation: undefined }), replace: true });
          }}
          onOpenOperation={openOperation}
        />
      ) : null}
      {navActionTarget !== null && navActionTarget !== undefined && showFloatingMobileFilters
        ? createPortal(
            <div className="max-md:w-[calc(100vw-1.5rem)] max-md:min-w-0 max-md:gap-1">
              <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden md:hidden">
                <div className="w-max">
                  <AuditOperationsMobileFilterRail
                    entityFilter={entityFilter}
                    kindsFilter={kindsFilter}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    queryFilter={queryFilter}
                    selectedUserIds={selectedUserIds}
                    onEntityChange={(value) => {
                      dispatchFilter({ type: "SET_ENTITY_FILTER", payload: value });
                      resetPage();
                    }}
                    onKindsChange={(value) => {
                      dispatchFilter({ type: "SET_KINDS_FILTER", payload: value });
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
                      dispatchFilter({ type: "SET_USER_IDS", payload: ids });
                      resetPage();
                    }}
                    onClear={clearAllFilters}
                  />
                </div>
              </div>
            </div>,
            navActionTarget,
          )
        : null}
    </div>
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/audit-logs")({
  validateSearch: (search: Record<string, unknown>): AuditLogsSearch => ({
    q: parseAuditLogsQuery(search.q),
    operation: parseOperationId(search.operation),
  }),
  component: AdminAuditLogsPage,
  staticData: {
    titleKey: "items.auditLogs",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "breadcrumbs.admin", path: "/admin/stations", i18nNamespace: "admin" }],
  },
});
