import { AlertCircleIcon, Cancel01Icon, Search01Icon, Sorting05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { useCallback, useMemo, useReducer } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UKESourceBadge } from "@/components/uke-source-badge";
import { DatePickerButton } from "@/features/admin/audit-logs/components/date-picker-button";
import { DeletedEntryDetailSheet } from "@/features/deleted-entries/components/deleted-entry-detail-sheet";
import type { DeletedEntry } from "@/features/deleted-entries/types";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { API_BASE, fetchJson } from "@/lib/api";
import { type AppTableFeatures, appTableFeatures } from "@/lib/tableFeatures";

function formatDeletedDate(dateString: string, locale: string): string {
  return new Date(dateString).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const SOURCE_TABLE_OPTIONS = ["uke_permits", "uke_radiolines"] as const;
const SOURCE_TYPE_OPTIONS = ["permits", "device_registry", "radiolines"] as const;

const SOURCE_TABLE_LABELS: Record<string, string> = {
  uke_permits: "UKE Permits",
  uke_radiolines: "UKE Radiolines",
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  permits: "Permits",
  device_registry: "Device Registry",
  radiolines: "Radiolines",
};

const TABLE_PAGINATION_CONFIG = { rowHeight: 64, headerHeight: 40, paginationHeight: 45 };

const columnHelper = createColumnHelper<AppTableFeatures, DeletedEntry>();

type FilterState = {
  sourceTable: string;
  sourceType: string;
  dateFrom: string;
  dateTo: string;
  search: string;
  sort: "asc" | "desc";
  selectedEntry: DeletedEntry | null;
};

function filterReducer(
  state: FilterState,
  action:
    | { type: "SET_SOURCE_TABLE"; payload: string }
    | { type: "SET_SOURCE_TYPE"; payload: string }
    | { type: "SET_DATE_FROM"; payload: string }
    | { type: "SET_DATE_TO"; payload: string }
    | { type: "SET_SEARCH"; payload: string }
    | { type: "SET_SORT"; payload: "asc" | "desc" }
    | { type: "SET_SELECTED_ENTRY"; payload: DeletedEntry | null }
    | { type: "CLEAR_FILTERS" },
): FilterState {
  switch (action.type) {
    case "SET_SOURCE_TABLE":
      return { ...state, sourceTable: action.payload };
    case "SET_SOURCE_TYPE":
      return { ...state, sourceType: action.payload };
    case "SET_DATE_FROM":
      return { ...state, dateFrom: action.payload };
    case "SET_DATE_TO":
      return { ...state, dateTo: action.payload };
    case "SET_SEARCH":
      return { ...state, search: action.payload };
    case "SET_SORT":
      return { ...state, sort: action.payload };
    case "SET_SELECTED_ENTRY":
      return { ...state, selectedEntry: action.payload };
    case "CLEAR_FILTERS":
      return { ...state, sourceTable: "", sourceType: "", dateFrom: "", dateTo: "", search: "" };
    default:
      return state;
  }
}

const initialFilterState: FilterState = {
  sourceTable: "",
  sourceType: "",
  dateFrom: "",
  dateTo: "",
  search: "",
  sort: "desc",
  selectedEntry: null,
};

function DeletedEntriesPage() {
  "use no memo";
  const { t, i18n } = useTranslation(["deletedEntries", "common"]);

  const [filterState, dispatchFilter] = useReducer(filterReducer, initialFilterState);
  const { sourceTable, sourceType, dateFrom, dateTo, search, sort, selectedEntry } = filterState;

  const { containerRef, pagination, setPagination, pageSizeOptions } = useTablePagination(TABLE_PAGINATION_CONFIG);

  const resetPage = useCallback(() => setPagination((prev) => ({ ...prev, pageIndex: 0 })), [setPagination]);

  const hasActiveFilters = !!(sourceTable || sourceType || dateFrom || dateTo || search);
  const activeFilterCount = [sourceTable, sourceType, dateFrom, dateTo, search].filter(Boolean).length;

  const clearAllFilters = useCallback(() => {
    dispatchFilter({ type: "CLEAR_FILTERS" });
    resetPage();
  }, [resetPage]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["deleted-entries", pagination.pageIndex, pagination.pageSize, sourceTable, sourceType, dateFrom, dateTo, search, sort],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", pagination.pageSize.toString());
      params.set("page", (pagination.pageIndex + 1).toString());
      if (sourceTable) params.set("source_table", sourceTable);
      if (sourceType) params.set("source_type", sourceType);
      if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        params.set("to", to.toISOString());
      }
      if (search) params.set("search", search);
      return fetchJson<{ data: DeletedEntry[]; totalCount: number }>(`${API_BASE}/deleted-entries?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const entries = data?.data ?? [];
  const total = data?.totalCount ?? 0;

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("deleted_at", {
          header: () => (
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-foreground -ml-1 px-1 py-0.5 rounded transition-colors"
              onClick={() => {
                dispatchFilter({ type: "SET_SORT", payload: sort === "desc" ? "asc" : "desc" });
                resetPage();
              }}
            >
              {t("deletedEntries.columns.deletedAt")}
              <HugeiconsIcon
                icon={Sorting05Icon}
                className="size-3.5 text-foreground"
                style={sort === "asc" ? { transform: "scaleY(-1)" } : undefined}
              />
            </button>
          ),
          size: 160,
          cell: ({ getValue }) => (
            <span className="text-muted-foreground tabular-nums text-xs font-mono">{formatDeletedDate(getValue(), i18n.language)}</span>
          ),
        }),
        columnHelper.display({
          id: "createdAt",
          header: t("deletedEntries.columns.createdAt"),
          size: 160,
          cell: ({ row }) => {
            const createdAt = row.original.data.createdAt as string | undefined;
            return createdAt ? (
              <span className="text-muted-foreground tabular-nums text-xs font-mono">{formatDeletedDate(createdAt, i18n.language)}</span>
            ) : (
              <span className="text-muted-foreground text-xs">-</span>
            );
          },
        }),
        columnHelper.accessor("source_table", {
          header: t("deletedEntries.columns.sourceTable"),
          size: 140,
          cell: ({ getValue }) => <span className="text-xs font-medium">{SOURCE_TABLE_LABELS[getValue()] ?? getValue()}</span>,
        }),
        columnHelper.accessor("source_type", {
          header: t("deletedEntries.columns.sourceType"),
          size: 140,
          cell: ({ getValue }) => <UKESourceBadge source={getValue()} />,
        }),
        columnHelper.accessor("source_id", {
          header: t("deletedEntries.columns.sourceId"),
          size: 100,
          cell: ({ getValue }) => <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">#{getValue()}</span>,
        }),
        columnHelper.accessor("data", {
          header: t("deletedEntries.columns.identifier"),
          size: 200,
          cell: ({ getValue, row }) => {
            const rowData = getValue();
            const isPermits = row.original.source_table === "uke_permits";
            const label = isPermits ? ((rowData.station_id as string) ?? (rowData.decision_number as string)) : (rowData.permit_number as string);
            const decisionNumber = isPermits ? (rowData.decision_number as string | undefined) : undefined;
            return (
              <div className="flex flex-col gap-0.5 max-w-48">
                {label ? (
                  <span className="text-xs truncate" title={String(label)}>
                    {String(label)}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">-</span>
                )}
                {decisionNumber && label !== decisionNumber && (
                  <span className="text-[10px] text-muted-foreground truncate" title={decisionNumber}>
                    {decisionNumber}
                  </span>
                )}
              </div>
            );
          },
        }),
        columnHelper.accessor("import_id", {
          header: t("deletedEntries.columns.importId"),
          size: 100,
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
    [t, sort, i18n.language, resetPage],
  );

  const table = useTable({
    features: appTableFeatures,
    data: entries,
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
            <h1 className="text-2xl font-bold tracking-tight">{t("deletedEntries.title")}</h1>
            <p className="text-muted-foreground text-sm">{t("deletedEntries.subtitle")}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={sourceTable}
            onValueChange={(v) => {
              dispatchFilter({ type: "SET_SOURCE_TABLE", payload: v === "__all__" ? "" : (v as string) });
              resetPage();
            }}
          >
            <SelectTrigger className="min-w-35">
              <SelectValue placeholder={t("deletedEntries.filters.allTables")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("deletedEntries.filters.allTables")}</SelectItem>
              {SOURCE_TABLE_OPTIONS.map((table) => (
                <SelectItem key={table} value={table}>
                  {SOURCE_TABLE_LABELS[table]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={sourceType}
            onValueChange={(v) => {
              dispatchFilter({ type: "SET_SOURCE_TYPE", payload: v === "__all__" ? "" : (v as string) });
              resetPage();
            }}
          >
            <SelectTrigger className="min-w-40">
              <SelectValue placeholder={t("deletedEntries.filters.allSources")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("deletedEntries.filters.allSources")}</SelectItem>
              {SOURCE_TYPE_OPTIONS.map((type) => (
                <SelectItem key={type} value={type}>
                  {SOURCE_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DatePickerButton
            value={dateFrom}
            onChange={(v) => {
              dispatchFilter({ type: "SET_DATE_FROM", payload: v });
              resetPage();
            }}
            label={t("deletedEntries.filters.dateFrom")}
          />

          <DatePickerButton
            value={dateTo}
            onChange={(v) => {
              dispatchFilter({ type: "SET_DATE_TO", payload: v });
              resetPage();
            }}
            label={t("deletedEntries.filters.dateTo")}
          />

          <div className="relative">
            <HugeiconsIcon
              icon={Search01Icon}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                dispatchFilter({ type: "SET_SEARCH", payload: e.target.value });
                resetPage();
              }}
              placeholder={t("deletedEntries.filters.searchPlaceholder")}
              className="h-8 rounded-lg border border-input bg-transparent pl-8 pr-2.5 text-sm transition-colors dark:bg-input/30 dark:hover:bg-input/50 hover:bg-muted min-w-48"
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

      <div ref={containerRef} className="flex-1 h-full overflow-x-auto overflow-y-auto">
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
            ) : entries.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={columns.length} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <HugeiconsIcon icon={Search01Icon} className="size-10 mb-2 opacity-20" />
                      <p className="font-medium">{t("deletedEntries.empty.title")}</p>
                      <p className="text-sm opacity-70">{t("deletedEntries.empty.subtitle")}</p>
                    </div>
                  </td>
                </tr>
              </tbody>
            ) : (
              <DataTable.Body onRowClick={(row: DeletedEntry) => dispatchFilter({ type: "SET_SELECTED_ENTRY", payload: row })} />
            )}
            <DataTable.Footer columns={columns.length}>
              <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} />
            </DataTable.Footer>
          </DataTable.Table>
        </DataTable.Root>
      </div>

      <DeletedEntryDetailSheet
        entry={selectedEntry}
        open={selectedEntry !== null}
        onOpenChange={(open) => {
          if (!open) dispatchFilter({ type: "SET_SELECTED_ENTRY", payload: null });
        }}
      />
    </div>
  );
}

export const Route = createFileRoute("/_layout/deleted-entries")({
  component: DeletedEntriesPage,
  staticData: {
    titleKey: "deletedEntries.title",
    i18nNamespace: "main",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
