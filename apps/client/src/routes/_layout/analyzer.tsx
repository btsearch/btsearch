import {
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  File02Icon,
  FilterIcon,
  FullSignalIcon,
  LinkSquare01Icon,
  Location01Icon,
  Sorting05Icon,
  Tag01Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import {
  type Row,
  type RowSelectionState,
  type SortingState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { RequireAuth } from "@/components/auth/requireAuth";
import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import { RatBadge } from "@/components/rat-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavActionTarget } from "@/contexts/navActions";
import { useFloatingDialogStack } from "@/features/station-details/components/floatingDialogStackProvider";
import { saveDraft } from "@/features/submissions/utils/analyzerDraftStore";
import { useHorizontalScroll } from "@/hooks/useHorizontalScroll";
import { useIsMobile } from "@/hooks/useMobile";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { type FileFormat, type ParsedRow, detectFormat, parseFile } from "@/lib/analyzer-parsers";
import { postApiData, showApiError } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { getBandFromEARFCN, getBandFromUARFCN, getBandMhz } from "@/lib/band-utils";
import { formatDuration } from "@/lib/format";
import { getOperatorColor } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";
import type { Operator, Region } from "@/types/station";

type AnalyzerLocation = {
  id: number;
  city: string | null;
  address: string | null;
  longitude: number;
  latitude: number;
  updatedAt: string;
  createdAt: string;
  region: Region | null;
};

type AnalyzerStation = {
  id: number;
  station_id: string;
  notes: string | null;
  extra_address: string | null;
  updatedAt: string;
  createdAt: string;
  is_confirmed: boolean | null;
  operator: Operator;
  location: AnalyzerLocation;
};

type MatchedCell =
  | {
      rat: "GSM";
      cell_id: number;
      sector_id: number | null;
      band_id: number;
      notes: string | null;
      lac: number;
      cid: number;
      is_confirmed: boolean | undefined;
    }
  | {
      rat: "UMTS";
      cell_id: number;
      sector_id: number | null;
      band_id: number;
      notes: string | null;
      rnc: number;
      cid: number;
      lac: number | null;
      arfcn: number | null;
      is_confirmed: boolean | undefined;
    }
  | {
      rat: "LTE";
      cell_id: number;
      sector_id: number | null;
      band_id: number;
      notes: string | null;
      enbid: number;
      clid: number | null;
      tac: number | null;
      pci: number | null;
      earfcn: number | null;
      is_confirmed: boolean | undefined;
    }
  | { rat: "NR"; cell_id: number; band_id: number };

export type AnalyzerResult = {
  status: "found" | "probable" | "not_found" | "unsupported";
  station?: AnalyzerStation;
  cell?: MatchedCell;
  warnings: string[];
};

type AnalyzerRow = {
  parsedRow: ParsedRow;
  index: number;
  result?: AnalyzerResult;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_CELLS = 20_000;

const MNC_NAMES: Record<number, string> = {
  26001: "Plus",
  26002: "T-Mobile",
  26003: "Orange",
  26006: "Play",
  26034: "NetWorks",
};

const ACTIONABLE_WARNINGS = new Set(["lac_mismatch", "tac_mismatch", "pci_mismatch", "pci_missing", "uarfcn_mismatch", "earfcn_mismatch"]);

const MISMATCH_WARNINGS = new Set([
  "lac_mismatch",
  "tac_mismatch",
  "pci_mismatch",
  "pci_missing",
  "rnc_mismatch",
  "uarfcn_mismatch",
  "earfcn_mismatch",
]);

const WARNING_FILTER_ALIASES: Partial<Record<string, string[]>> = {
  pci_mismatch: ["pci_mismatch", "pci_missing"],
};

const WARNING_I18N_KEY: Record<string, string> = {
  enbid_only: "warning.enbidOnly",
};

function isNotConfirmedCell(result: AnalyzerResult | undefined): boolean {
  return !!(result?.cell && result.cell.rat !== "NR" && result.cell.is_confirmed === false);
}

function isNotFoundCell(result: AnalyzerResult | undefined): boolean {
  return result?.status === "not_found";
}

function getMatchedCellNote(cell: MatchedCell | undefined): string | null {
  if (!cell || cell.rat === "NR") return null;
  const note = cell.notes?.trim();
  return note ? note : null;
}

const SORT_ASC_STYLE = { transform: "scaleY(-1)" };

const DESKTOP_TABLE_PAGINATION_CONFIG = { rowHeight: 60, headerHeight: 40, paginationHeight: 49 };
const MOBILE_TABLE_PAGINATION_CONFIG = { rowHeight: 76, headerHeight: 40, paginationHeight: 49 };

const columnHelper = createColumnHelper<AnalyzerRow>();

function rowBg(result?: AnalyzerResult): string {
  if (!result) return "hover:bg-muted/50";
  if (result.status === "not_found") return "bg-destructive/5 hover:bg-destructive/10";
  if (result.status === "probable") return "bg-amber-50/60 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20";
  if (result.status === "found" && result.warnings.length > 0) return "bg-amber-50/40 dark:bg-amber-900/5";
  return "hover:bg-muted/50";
}

function isRowSelectable(row: Row<AnalyzerRow>): boolean {
  const rawRow = row.original;
  if (!rawRow.result) return false;
  const { status, warnings, cell } = rawRow.result as AnalyzerResult;
  if (cell?.rat === "NR" || status === "not_found" || status === "unsupported") return false;
  if (!warnings) return false;
  if (status === "found") return warnings.some((warning) => ACTIONABLE_WARNINGS.has(warning));
  if (status === "probable") return warnings.includes("enbid_only") || warnings.includes("rnc_mismatch");
  return false;
}

type AnalyzerState = {
  isDragging: boolean;
  parsedRows: ParsedRow[] | null;
  results: AnalyzerResult[] | null;
  fileName: string | null;
  fileSize: number;
  fileFormat: FileFormat | null;
  statusFilter: string;
  ratFilter: string;
  warningFilter: string;
  operatorFilter: string;
  bandFilter: string[];
  rowSelection: RowSelectionState;
};

type AnalyzerAction =
  | { type: "SET_DRAGGING"; payload: boolean }
  | { type: "SET_FILE"; payload: { name: string; size: number } }
  | { type: "SET_PARSED"; payload: { rows: ParsedRow[]; format: FileFormat } | null }
  | { type: "SET_RESULTS"; payload: AnalyzerResult[] }
  | { type: "SET_STATUS_FILTER"; payload: string | null }
  | { type: "SET_RAT_FILTER"; payload: string | null }
  | { type: "SET_WARNING_FILTER"; payload: string | null }
  | { type: "SET_OPERATOR_FILTER"; payload: string | null }
  | { type: "SET_BAND_FILTER"; payload: string[] }
  | { type: "SET_ROW_SELECTION"; payload: RowSelectionState }
  | { type: "CLEAR_SELECTION" }
  | { type: "CLEAR_FILTERS" };

const initialState: AnalyzerState = {
  isDragging: false,
  parsedRows: null,
  results: null,
  fileName: null,
  fileSize: 0,
  fileFormat: null,
  statusFilter: "all",
  ratFilter: "all",
  warningFilter: "all",
  operatorFilter: "all",
  bandFilter: [],
  rowSelection: {},
};

function analyzerReducer(state: AnalyzerState, action: AnalyzerAction): AnalyzerState {
  switch (action.type) {
    case "SET_DRAGGING":
      return { ...state, isDragging: action.payload };
    case "SET_FILE":
      return { ...state, fileName: action.payload.name, fileSize: action.payload.size, results: null };
    case "SET_PARSED":
      return action.payload
        ? { ...state, parsedRows: action.payload.rows, fileFormat: action.payload.format }
        : { ...state, parsedRows: null, fileFormat: null };
    case "SET_RESULTS":
      return { ...state, results: action.payload };
    case "SET_STATUS_FILTER":
      return { ...state, statusFilter: action.payload ?? "all" };
    case "SET_RAT_FILTER":
      return { ...state, ratFilter: action.payload ?? "all" };
    case "SET_WARNING_FILTER":
      return { ...state, warningFilter: action.payload ?? "all" };
    case "SET_OPERATOR_FILTER":
      return { ...state, operatorFilter: action.payload ?? "all" };
    case "SET_BAND_FILTER":
      return { ...state, bandFilter: action.payload };
    case "SET_ROW_SELECTION":
      return { ...state, rowSelection: action.payload };
    case "CLEAR_SELECTION":
      return { ...state, rowSelection: {} };
    case "CLEAR_FILTERS":
      return { ...state, statusFilter: "all", ratFilter: "all", warningFilter: "all", operatorFilter: "all", bandFilter: [] };
  }
}

function BandFilterButton({
  value,
  onChange,
  bands,
  t,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  bands: { band: number; rat: "LTE" | "UMTS" }[];
  t: ReturnType<typeof useTranslation<["cellAnalyzer", "common"]>>["t"];
}) {
  const [open, setOpen] = useState(false);

  function toggle(key: string) {
    onChange(value.includes(key) ? value.filter((b) => b !== key) : [...value, key]);
  }

  const label = value.length === 0 ? t("filter.allBands") : t("filter.bandsCount", { count: value.length });
  const groups = (["LTE", "UMTS"] as const).map((rat) => ({ rat, items: bands.filter((b) => b.rat === rat) })).filter((g) => g.items.length > 0);

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
      <PopoverContent align="start" className="w-56 p-0 max-h-80 overflow-y-auto">
        {value.length > 0 && (
          <div className="px-3 py-2 border-b flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t("filter.bandsCount", { count: value.length })}</span>
            <button type="button" onClick={() => onChange([])} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {t("common:actions.clear")}
            </button>
          </div>
        )}
        {groups.map(({ rat, items }, i) => (
          <div key={rat}>
            {i > 0 && <div className="h-px bg-border mx-1" />}
            <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{rat}</div>
            {items.map(({ band }) => {
              const key = `${rat}-${band}`;
              const mhz = getBandMhz(band);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/50 transition-colors text-left"
                >
                  <Checkbox checked={value.includes(key)} className="pointer-events-none" />
                  <span className="text-xs font-mono">B{band}</span>
                  {mhz && <span className="text-xs text-muted-foreground">{mhz} MHz</span>}
                </button>
              );
            })}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function AnalyzerPage() {
  const { t } = useTranslation(["cellAnalyzer", "common", "stations"]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [state, dispatch] = useReducer(analyzerReducer, initialState);
  const { openStationDialog } = useFloatingDialogStack();
  const [sorting, setSorting] = useState<SortingState>([]);
  const analyzeStartRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finalDuration, setFinalDuration] = useState<number | null>(null);
  const { isDragging, parsedRows, results, fileName, fileSize, fileFormat, statusFilter, ratFilter, warningFilter, operatorFilter, bandFilter } =
    state;
  const { data: session } = authClient.useSession();
  const stationCap = ["editor", "admin"].includes(session?.user?.role ?? "") ? 50 : 25;

  const isMobile = useIsMobile();
  const scrollRef = useHorizontalScroll<HTMLDivElement>();
  const { containerRef, pagination, setPagination, pageSizeOptions } = useTablePagination(
    isMobile ? MOBILE_TABLE_PAGINATION_CONFIG : DESKTOP_TABLE_PAGINATION_CONFIG,
  );
  const navActionTarget = useNavActionTarget();
  const showFloatingMobileFilters = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef(node);
      containerRef(node);
    },
    [containerRef, scrollRef],
  );

  const resetPage = useCallback(() => setPagination((p) => ({ ...p, pageIndex: 0 })), [setPagination]);

  const handleFile = useCallback(
    (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(t("errors.fileTooLarge"));
        return;
      }

      dispatch({ type: "SET_FILE", payload: { name: file.name, size: file.size } });

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const format = detectFormat(file.name, text);
        const rows = parseFile(format, text);
        if (rows.length === 0) {
          toast.error(t("errors.noValidRows"));
          dispatch({ type: "SET_PARSED", payload: null });
          return;
        }
        const truncated = rows.slice(0, MAX_CELLS);
        if (rows.length > MAX_CELLS) {
          toast.warning(t("errors.truncated", { count: MAX_CELLS }));
        }
        dispatch({ type: "SET_PARSED", payload: { rows: truncated, format } });
        resetPage();
      };
      reader.readAsText(file, "utf-8");
    },
    [t, resetPage],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dispatch({ type: "SET_DRAGGING", payload: false });
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const parsedRowsRef = useRef(parsedRows);
  parsedRowsRef.current = parsedRows;

  const mutationFn = useCallback(async () => {
    const cells = parsedRowsRef.current!.map(({ description: _d, rawLine: _r, ...cell }) => cell);
    return postApiData<AnalyzerResult[], { cells: typeof cells }>("analyzer", { cells });
  }, []);

  const onAnalyzeSuccess = useCallback(
    (data: AnalyzerResult[]) => {
      if (analyzeStartRef.current) setFinalDuration(Date.now() - analyzeStartRef.current);
      dispatch({ type: "SET_RESULTS", payload: data });
      resetPage();
    },
    [resetPage],
  );

  const { mutate: handleAnalyze, isPending: isLoading } = useMutation({
    mutationFn,
    onMutate: () => {
      analyzeStartRef.current = Date.now();
      setElapsed(0);
      setFinalDuration(null);
    },
    onSuccess: onAnalyzeSuccess,
    onError: showApiError,
  });

  useEffect(() => {
    if (!isLoading) return;
    const id = setInterval(() => {
      if (analyzeStartRef.current) setElapsed(Date.now() - analyzeStartRef.current);
    }, 500);
    return () => clearInterval(id);
  }, [isLoading]);

  const stats = useMemo(() => {
    if (!results) return null;
    let found = 0,
      probable = 0,
      notFound = 0,
      unsupported = 0;
    for (const r of results) {
      if (r.status === "found") found++;
      else if (r.status === "probable") probable++;
      else if (r.status === "not_found") notFound++;
      else unsupported++;
    }
    return { found, probable, notFound, unsupported };
  }, [results]);

  const warningLabels = useMemo(
    () => ({
      all: t("common:status.all"),
      any: t("filter.anyWarning"),
      lac_mismatch: "LAC · GSM/UMTS",
      tac_mismatch: "TAC · LTE",
      pci_mismatch: "PCI · LTE",
      pci_missing: t("warning.pciMissing"),
      rnc_mismatch: "RNC · UMTS",
      uarfcn_mismatch: "UARFCN · UMTS",
      earfcn_mismatch: "EARFCN · LTE",
      enbid_only: t("warning.enbidOnly"),
      not_confirmed: t("warning.notConfirmed"),
      not_found: t("warning.notFound"),
      mismatchGroup: t("filter.mismatchGroup"),
      otherGroup: t("filter.otherGroup"),
    }),
    [t],
  );

  const hasActiveFilters =
    statusFilter !== "all" || ratFilter !== "all" || warningFilter !== "all" || operatorFilter !== "all" || bandFilter.length > 0;

  const statusLabels = useMemo(
    () => ({
      all: t("common:status.all"),
      found: t("status.found"),
      probable: t("status.probable"),
      not_found: t("status.notFound"),
      unsupported: t("status.unsupported"),
    }),
    [t],
  );

  const ratLabels = useMemo(
    () => ({
      all: t("common:status.all"),
      GSM: "GSM",
      UMTS: "UMTS",
      LTE: "LTE",
      NR: "NR",
    }),
    [t],
  );

  const availableMncs = useMemo(() => {
    if (!parsedRows) return [];
    const seen = new Set<number>();
    for (const row of parsedRows) seen.add(row.mnc);
    return [...seen].sort((a, b) => {
      const nameA = MNC_NAMES[a] ?? String(a);
      const nameB = MNC_NAMES[b] ?? String(b);
      return nameA.localeCompare(nameB);
    });
  }, [parsedRows]);

  const availableBands = useMemo(() => {
    if (!parsedRows) return [];
    const seen = new Set<string>();
    const result: { band: number; rat: "LTE" | "UMTS" }[] = [];
    for (const row of parsedRows) {
      if (row.rat === "LTE" && row.earfcn !== undefined) {
        const band = getBandFromEARFCN(row.earfcn);
        if (band !== null) {
          const key = `LTE-${band}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push({ band, rat: "LTE" });
          }
        }
      } else if (row.rat === "UMTS" && row.uarfcn !== undefined) {
        const band = getBandFromUARFCN(row.uarfcn);
        if (band !== null) {
          const key = `UMTS-${band}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push({ band, rat: "UMTS" });
          }
        }
      }
    }
    result.sort((a, b) => a.rat.localeCompare(b.rat) || a.band - b.band);
    return result;
  }, [parsedRows]);

  const tableData = useMemo<AnalyzerRow[]>(() => {
    if (!parsedRows) return [];
    return parsedRows.reduce<AnalyzerRow[]>((acc, row, index) => {
      if (ratFilter !== "all" && row.rat !== ratFilter) return acc;
      if (operatorFilter !== "all" && String(row.mnc) !== operatorFilter) return acc;
      if (bandFilter.length > 0) {
        let bandKey: string | null = null;
        if (row.rat === "LTE" && row.earfcn !== undefined) {
          const band = getBandFromEARFCN(row.earfcn);
          if (band !== null) bandKey = `LTE-${band}`;
        } else if (row.rat === "UMTS" && row.uarfcn !== undefined) {
          const band = getBandFromUARFCN(row.uarfcn);
          if (band !== null) bandKey = `UMTS-${band}`;
        }
        if (bandKey === null || !bandFilter.includes(bandKey)) return acc;
      }
      const result = results?.[index];
      if (statusFilter !== "all" && results) {
        if (!result || result.status !== statusFilter) return acc;
      }
      if (warningFilter !== "all" && results) {
        if (!result) return acc;
        if (warningFilter === "any") {
          if (result.warnings.length === 0 && !isNotConfirmedCell(result) && !isNotFoundCell(result)) return acc;
        } else if (warningFilter === "not_confirmed") {
          if (!isNotConfirmedCell(result)) return acc;
        } else if (warningFilter === "not_found") {
          if (!isNotFoundCell(result)) return acc;
        } else {
          const matches = WARNING_FILTER_ALIASES[warningFilter] ?? [warningFilter];
          if (!matches.some((w) => result.warnings.includes(w))) return acc;
        }
      }

      acc.push({ parsedRow: row, index, result });
      return acc;
    }, []);
  }, [parsedRows, results, statusFilter, ratFilter, warningFilter, operatorFilter, bandFilter]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "select",
        header: ({ table }) => {
          const allSelected = table.getIsAllPageRowsSelected();
          const checked = allSelected || table.getIsSomePageRowsSelected();
          return <Checkbox checked={checked} onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)} />;
        },
        size: 40,
        cell: ({ row }) => (
          <Checkbox checked={row.getIsSelected()} disabled={!row.getCanSelect()} onCheckedChange={(value) => row.toggleSelected(!!value)} />
        ),
      }),
      columnHelper.display({
        id: "num",
        header: "#",
        size: 40,
        cell: ({ row }) => <span className="text-muted-foreground text-xs tabular-nums">{row.original.index + 1}</span>,
      }),
      columnHelper.accessor((r) => r.parsedRow.rat, {
        id: "rat",
        header: "Standard",
        size: 80,
        cell: ({ getValue }) => <RatBadge rat={getValue()} showTechName />,
      }),
      columnHelper.accessor((r) => r, {
        id: "band",
        header: t("common:labels.band"),
        size: 90,
        cell: ({ getValue }) => {
          const { parsedRow: row, result } = getValue();
          let band: number | null = null;
          if (row.rat === "LTE" && row.earfcn !== undefined) band = getBandFromEARFCN(row.earfcn);
          else if (row.rat === "UMTS" && row.uarfcn !== undefined) band = getBandFromUARFCN(row.uarfcn);
          const isNotConfirmed = isNotConfirmedCell(result);
          if (band === null && !isNotConfirmed) return <span className="text-muted-foreground text-xs">-</span>;
          const mhz = band !== null ? getBandMhz(band) : null;
          return (
            <div className="flex items-center gap-1">
              {band !== null && (
                <span className="text-xs font-mono">
                  {mhz && <span className="font-semibold">{mhz}</span>}
                  <span className="opacity-75">
                    {mhz ? " " : ""}(b{band})
                  </span>
                </span>
              )}
              {isNotConfirmed && (
                <Tooltip>
                  <TooltipTrigger>
                    <span className="inline-flex items-center justify-center size-5 rounded-md bg-destructive/10 text-destructive cursor-help">
                      <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("stations:cells.cellNotConfirmed")}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor((r) => r.parsedRow, {
        id: "operator",
        header: t("common:labels.operator"),
        size: 140,
        cell: ({ getValue }) => {
          const row = getValue();
          const name = MNC_NAMES[row.mnc];
          const color = getOperatorColor(row.mnc);
          return (
            <div className="flex items-center gap-1.5">
              <div className="size-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: color }} />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium leading-tight">{name ?? row.mnc}</span>
                {name && <span className="font-mono text-[10px] text-muted-foreground leading-tight">({row.mnc})</span>}
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor((r) => r.parsedRow, {
        id: "identifiers",
        header: ({ column }) => {
          const sorted = column.getIsSorted();
          return (
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-foreground -ml-1 px-1 py-0.5 rounded transition-colors"
              onClick={column.getToggleSortingHandler()}
            >
              {t("table.identifiers")}
              <HugeiconsIcon
                icon={Sorting05Icon}
                className={cn("size-3.5 transition-colors", sorted ? "text-foreground" : "text-muted-foreground/40")}
                style={sorted === "asc" ? SORT_ASC_STYLE : undefined}
              />
            </button>
          );
        },
        size: 180,
        sortingFn: (rowA, rowB) => {
          const a = rowA.original.parsedRow;
          const b = rowB.original.parsedRow;
          if (a.rat === "LTE" && b.rat === "LTE") return a.enbid - b.enbid;
          if (a.rat === "GSM" && b.rat === "GSM") {
            const lacDiff = a.lac - b.lac;
            return lacDiff !== 0 ? lacDiff : a.cid - b.cid;
          }
          if (a.rat === "UMTS" && b.rat === "UMTS") {
            const lacDiff = a.lac - b.lac;
            return lacDiff !== 0 ? lacDiff : (a.rnc ?? 0) - (b.rnc ?? 0);
          }
          return 0;
        },
        cell: ({ getValue, row }) => {
          const cell = getValue();
          const warnings = row.original.result?.warnings ?? [];

          const matched = row.original.result?.cell;

          const ids: { label: string; value: number | null; dbValue?: number | null; warn?: boolean; missing?: boolean }[] = (() => {
            switch (cell.rat) {
              case "GSM":
                return [
                  { label: "LAC", value: cell.lac, dbValue: matched?.rat === "GSM" ? matched.lac : null, warn: warnings.includes("lac_mismatch") },
                  { label: "CID", value: cell.cid },
                ];
              case "UMTS":
                return [
                  { label: "RNC", value: cell.rnc, dbValue: matched?.rat === "UMTS" ? matched.rnc : null, warn: warnings.includes("rnc_mismatch") },
                  { label: "LAC", value: cell.lac, dbValue: matched?.rat === "UMTS" ? matched.lac : null, warn: warnings.includes("lac_mismatch") },
                  { label: "CID", value: cell.cid },
                  ...(cell.uarfcn !== undefined
                    ? [
                        {
                          label: "UARFCN",
                          value: cell.uarfcn,
                          dbValue: matched?.rat === "UMTS" ? matched.arfcn : null,
                          warn: warnings.includes("uarfcn_mismatch"),
                        },
                      ]
                    : []),
                ];
              case "LTE":
                return [
                  { label: "eNBID", value: cell.enbid },
                  { label: "CLID", value: cell.clid },
                  { label: "TAC", value: cell.tac, dbValue: matched?.rat === "LTE" ? matched.tac : null, warn: warnings.includes("tac_mismatch") },
                  {
                    label: "PCI",
                    value: cell.pci,
                    dbValue: matched?.rat === "LTE" ? matched.pci : null,
                    warn: warnings.includes("pci_mismatch"),
                    missing: warnings.includes("pci_missing"),
                  },
                  ...(cell.earfcn !== undefined
                    ? [
                        {
                          label: "EARFCN",
                          value: cell.earfcn,
                          dbValue: matched?.rat === "LTE" ? matched.earfcn : null,
                          warn: warnings.includes("earfcn_mismatch"),
                        },
                      ]
                    : []),
                ];
              case "NR":
                return cell.arfcn !== undefined ? [{ label: "ARFCN", value: cell.arfcn }] : [];
            }
          })();

          const extraWarnings = warnings.filter((w) => !MISMATCH_WARNINGS.has(w));

          if (ids.length === 0 && extraWarnings.length === 0) return <span className="text-muted-foreground text-xs">-</span>;

          return (
            <div className="flex flex-wrap items-center gap-1">
              {ids.map(({ label, value, dbValue, warn, missing }) => {
                let stateClass = "bg-muted px-1.5 py-0.5 text-muted-foreground";
                if (warn) stateClass = "bg-destructive/10 text-destructive px-1.5 py-0.5";
                else if (missing) stateClass = "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-200 px-1.5 py-0.5";
                return (
                  <span key={label} className={cn("inline-flex items-center rounded-md text-[11px] font-medium", stateClass)}>
                    <span className="mr-0.5 opacity-60">{label}</span>
                    {warn && dbValue !== null && dbValue !== undefined && (
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="inline-flex items-center">
                            <span className="font-mono font-semibold underline decoration-dotted">{dbValue}</span>
                            <HugeiconsIcon icon={ArrowRight01Icon} className="mx-0.5 size-3 opacity-50" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{t("warning.dbValue")}</TooltipContent>
                      </Tooltip>
                    )}
                    {missing ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="font-mono font-semibold underline decoration-dotted cursor-help">{value}</span>
                        </TooltipTrigger>
                        <TooltipContent>{t("warning.pciMissingFromDb")}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="font-mono font-semibold">{value}</span>
                    )}
                  </span>
                );
              })}
              {extraWarnings.map((w) => (
                <span
                  key={w}
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400"
                >
                  <HugeiconsIcon icon={AlertCircleIcon} className="size-3 shrink-0" />
                  {t(WARNING_I18N_KEY[w] ?? w)}
                </span>
              ))}
            </div>
          );
        },
      }),
      columnHelper.accessor((r) => r.parsedRow.description, {
        id: "description",
        header: t("table.description"),
        size: 260,
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground line-clamp-2" title={getValue()}>
            {getValue() || "-"}
          </span>
        ),
      }),
      columnHelper.accessor((r) => r.result, {
        id: "location",
        header: t("table.location"),
        size: 240,
        cell: ({ getValue }) => {
          const result = getValue();
          if (!result) return <span className="text-muted-foreground text-xs">-</span>;
          if (result.status === "unsupported") return <span className="text-muted-foreground text-xs italic">{t("status.unsupported")}</span>;
          if (result.status === "not_found") return <span className="text-destructive font-semibold text-sm">{t("status.notFound")}</span>;

          const loc = result.station?.location;
          const locationText = loc?.city || loc?.address ? [loc.city, loc.address].filter(Boolean).join(", ") : "-";
          const regionText = loc?.region?.name;
          const matchedNote = getMatchedCellNote(result.cell);

          return (
            <div className="text-emerald-700 dark:text-emerald-400 text-sm font-medium">
              {locationText}
              {matchedNote ? <span className="font-normal"> - {matchedNote}</span> : null}
              {regionText && <span className="text-muted-foreground font-normal text-xs"> · {regionText}</span>}
            </div>
          );
        },
      }),
      columnHelper.accessor((r) => r.result, {
        id: "station",
        header: t("common:labels.station"),
        size: 160,
        cell: ({ getValue }) => {
          const result = getValue();
          const station = result?.station;
          if (!station) return <span className="text-muted-foreground text-xs">-</span>;
          return (
            <div className="flex items-center gap-1.5 flex-nowrap">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                onClick={() => openStationDialog(station.id, "internal")}
              >
                <HugeiconsIcon icon={Tag01Icon} className="size-3 shrink-0" />
                <span className="font-mono">{station.station_id}</span>
              </button>
              {station.location && (
                <Link
                  to="/"
                  hash={`map=16/${station.location.latitude}/${station.location.longitude}~f~L${station.location.id}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <HugeiconsIcon icon={Location01Icon} className="size-3 shrink-0" />
                  <span className="font-mono">{station.location.id}</span>
                </Link>
              )}
              {result?.status === "probable" && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  {t("status.probable")}
                </span>
              )}
            </div>
          );
        },
      }),
    ],
    [openStationDialog, t],
  );

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination, sorting, rowSelection: state.rowSelection },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    enableRowSelection: isRowSelectable,
    onRowSelectionChange: (updater) =>
      dispatch({ type: "SET_ROW_SELECTION", payload: typeof updater === "function" ? updater(state.rowSelection) : updater }),
  });

  const selectedCount = Object.keys(state.rowSelection).length;
  const uniqueStationCount = useMemo(() => {
    if (selectedCount === 0) return 0;
    return new Set(
      table
        .getSelectedRowModel()
        .rows.map((row) => row.original.result?.station?.id)
        .filter(Boolean),
    ).size;
  }, [table, selectedCount]);

  function handleNavigationToReview() {
    const draftId = saveDraft({
      selectedRows: table
        .getSelectedRowModel()
        .rows.filter((row) => row.original.result !== undefined)
        .map(({ original: { index, parsedRow, result } }) => {
          const { description: _d, rawLine: _r, ...storedRow } = parsedRow;
          return { index, parsedRow: storedRow, result: result! };
        }),
      metadata: {
        fileName: state.fileName,
        fileFormat: state.fileFormat,
      },
      parsedCount: state.parsedRows?.length ?? 0,
    });
    const href = router.buildLocation({ to: "/submission/from-analyzer", search: { draft: draftId } }).href;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  useEffect(() => {
    if (selectedCount === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") table.resetRowSelection();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedCount, table]);

  const analyzerMobileFilterRail = (
    <div className="flex items-center gap-1">
      <MobileFilterChip active={statusFilter !== "all"} icon={CheckmarkCircle02Icon} label={t("filter.status")}>
        <MobileFilterPanelTitle>{t("filter.status")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          {(["all", "found", "probable", "not_found", "unsupported"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                dispatch({ type: "SET_STATUS_FILTER", payload: status });
                resetPage();
              }}
              className={cn(
                "h-8 rounded-md px-2 text-left text-sm transition-colors",
                statusFilter === status ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              {status === "all" ? t("common:status.all") : statusLabels[status]}
            </button>
          ))}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={ratFilter !== "all"} icon={FullSignalIcon} label="Standard">
        <MobileFilterPanelTitle>Standard</MobileFilterPanelTitle>
        <div className="grid gap-1">
          {(["all", "GSM", "UMTS", "LTE", "NR"] as const).map((rat) => (
            <button
              key={rat}
              type="button"
              onClick={() => {
                dispatch({ type: "SET_RAT_FILTER", payload: rat });
                resetPage();
              }}
              className={cn(
                "h-8 rounded-md px-2 text-left text-sm transition-colors",
                ratFilter === rat ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              {rat === "all" ? t("common:status.all") : rat}
            </button>
          ))}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={operatorFilter !== "all"} icon={FilterIcon} label={t("common:labels.operator")}>
        <MobileFilterPanelTitle>{t("common:labels.operator")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "SET_OPERATOR_FILTER", payload: "all" });
              resetPage();
            }}
            className={cn(
              "h-8 rounded-md px-2 text-left text-sm transition-colors",
              operatorFilter === "all" ? "bg-primary/10 text-primary" : "hover:bg-muted",
            )}
          >
            {t("common:status.all")}
          </button>
          {availableMncs.map((mnc) => (
            <button
              key={mnc}
              type="button"
              onClick={() => {
                dispatch({ type: "SET_OPERATOR_FILTER", payload: String(mnc) });
                resetPage();
              }}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                operatorFilter === String(mnc) ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: getOperatorColor(mnc) }} />
              <span>{MNC_NAMES[mnc] ?? mnc}</span>
            </button>
          ))}
        </div>
      </MobileFilterChip>

      {availableBands.length > 0 ? (
        <MobileFilterChip active={bandFilter.length > 0} count={bandFilter.length} icon={Tag01Icon} label={t("filter.band")}>
          <MobileFilterPanelTitle>{t("filter.band")}</MobileFilterPanelTitle>
          <div className="grid max-h-64 gap-1 overflow-y-auto">
            {availableBands.map(({ rat, band }) => {
              const key = `${rat}-${band}`;
              const selected = bandFilter.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    dispatch({ type: "SET_BAND_FILTER", payload: selected ? bandFilter.filter((value) => value !== key) : [...bandFilter, key] });
                    resetPage();
                  }}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                    selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                >
                  <span className="font-mono">
                    {rat} B{band}
                  </span>
                  {getBandMhz(band) ? <span className="text-muted-foreground">{getBandMhz(band)} MHz</span> : null}
                </button>
              );
            })}
          </div>
        </MobileFilterChip>
      ) : null}

      <MobileFilterChip active={warningFilter !== "all"} icon={AlertCircleIcon} label={t("filter.warning")}>
        <MobileFilterPanelTitle>{t("filter.warning")}</MobileFilterPanelTitle>
        <div className="grid max-h-64 gap-1 overflow-y-auto">
          {(
            [
              "all",
              "any",
              "lac_mismatch",
              "tac_mismatch",
              "rnc_mismatch",
              "pci_mismatch",
              "uarfcn_mismatch",
              "earfcn_mismatch",
              "not_found",
              "pci_missing",
              "enbid_only",
              "not_confirmed",
            ] as const
          ).map((warning) => (
            <button
              key={warning}
              type="button"
              onClick={() => {
                dispatch({ type: "SET_WARNING_FILTER", payload: warning });
                resetPage();
              }}
              className={cn(
                "h-8 rounded-md px-2 text-left text-sm transition-colors",
                warningFilter === warning ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              {warning === "all" ? t("common:status.all") : warning === "any" ? t("filter.anyWarning") : warningLabels[warning]}
            </button>
          ))}
        </div>
      </MobileFilterChip>

      {hasActiveFilters ? (
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "CLEAR_FILTERS" });
            resetPage();
          }}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("common:actions.clear")}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
        </button>
      ) : null}
    </div>
  );

  return (
    <RequireAuth>
      <div className={cn("flex-1 p-4", parsedRows ? "flex flex-col gap-4 min-h-0 overflow-hidden" : "overflow-y-auto space-y-4")}>
        <div className="flex flex-col gap-4 shrink-0">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{t("nav:items.analyzer")}</h1>
            <p className="text-muted-foreground text-sm">{t("page.description")}</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".ntm,.csv,.txt,.clf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          {parsedRows ? (
            <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
              <HugeiconsIcon icon={File02Icon} className="size-5 text-muted-foreground shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate">{fileName}</span>
                <span className="text-xs text-muted-foreground">
                  {t("file.rowCount", { count: parsedRows.length })} · {formatFileSize(fileSize)} ·{" "}
                  {fileFormat === "netmonitor" ? "NetMonitor" : "NetMonster"}
                </span>
              </div>
              <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => fileInputRef.current?.click()}>
                {t("file.changeFile")}
              </Button>
            </div>
          ) : (
            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
                isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/20 hover:border-primary/60 hover:bg-primary/5",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                dispatch({ type: "SET_DRAGGING", payload: true });
              }}
              onDragLeave={() => dispatch({ type: "SET_DRAGGING", payload: false })}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
              }}
            >
              <HugeiconsIcon icon={Upload04Icon} className="size-10 mx-auto mb-3 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">{t("file.dropHint")}</p>
                <p className="text-sm text-muted-foreground">{t("file.constraints")}</p>
              </div>
            </div>
          )}

          {parsedRows && (
            <div className="flex items-center gap-4 flex-wrap">
              <Button onClick={() => handleAnalyze()} disabled={isLoading || !parsedRows?.length} size="lg">
                {isLoading ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    {t("button.analyzing")}
                    <span className="opacity-70 text-xs tabular-nums">{formatDuration(elapsed)}</span>
                  </>
                ) : (
                  t("button.analyze", { count: parsedRows.length })
                )}
              </Button>

              {stats && (
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                    <span className="size-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                    {stats.found} {t("stats.found")}
                  </span>
                  {stats.probable > 0 && (
                    <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                      <span className="size-2 rounded-full bg-amber-600 dark:bg-amber-400" />
                      {stats.probable} {t("stats.probable")}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 text-destructive">
                    <span className="size-2 rounded-full bg-destructive" />
                    {stats.notFound} {t("stats.notFound")}
                  </span>
                  {stats.unsupported > 0 && (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-2 rounded-full bg-muted-foreground" />
                      {stats.unsupported} {t("stats.unsupported")}
                    </span>
                  )}
                  {finalDuration !== null ? <span className="text-muted-foreground tabular-nums">{formatDuration(finalDuration)}</span> : null}
                </div>
              )}
            </div>
          )}
        </div>

        {selectedCount > 0
          ? createPortal(
              <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom-5 duration-200">
                <div
                  className="flex items-center justify-between border-t-2 border-primary bg-background px-4 py-3 shadow-sm sm:py-2"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => table.resetRowSelection()}
                      className="flex shrink-0 items-center justify-center rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      aria-label={t("cellAnalyzer:selection.clearSelection")}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} className="h-3.5 w-3.5" />
                    </button>
                    <span className="flex h-4 min-w-6 shrink-0 items-center justify-center rounded-sm bg-primary px-1.5 text-xs font-bold text-primary-foreground tabular-nums">
                      {selectedCount}
                    </span>
                    <span className="shrink-0 text-sm font-medium text-foreground">
                      {t("cellAnalyzer:selection.rowsSelected", { count: selectedCount })}
                    </span>
                    <Separator orientation="vertical" className="h-4 shrink-0" />
                    <span className="shrink-0 text-sm font-normal text-muted-foreground">
                      {uniqueStationCount === 0
                        ? t("cellAnalyzer:selection.noStationsResolved")
                        : t("cellAnalyzer:selection.uniqueStationCount", { count: uniqueStationCount })}
                    </span>
                    {uniqueStationCount > stationCap ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-destructive">
                        <HugeiconsIcon icon={AlertCircleIcon} className="h-3.5 w-3.5" />
                        {t("cellAnalyzer:selection.stationCapWarning", { count: stationCap })}
                      </span>
                    ) : null}
                  </div>
                  {uniqueStationCount === 0 || uniqueStationCount > stationCap ? (
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="ml-auto shrink-0 pl-4">
                          <Button size="sm" disabled onClick={handleNavigationToReview}>
                            {t("cellAnalyzer:selection.reviewBatch")} <HugeiconsIcon icon={LinkSquare01Icon} className="ml-1.5 h-3.5 w-3.5" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {uniqueStationCount === 0
                          ? t("cellAnalyzer:selection.reviewBatchDisabledNoStations")
                          : t("cellAnalyzer:selection.reviewBatchDisabledOverLimit", { count: stationCap })}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Button size="sm" onClick={handleNavigationToReview} className="ml-auto shrink-0">
                      {t("cellAnalyzer:selection.reviewBatch")} <HugeiconsIcon icon={LinkSquare01Icon} className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>,
              document.body,
            )
          : null}

        {parsedRows && (
          <div className={cn("flex flex-wrap items-end gap-2 shrink-0", showFloatingMobileFilters && "max-md:hidden")}>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground px-0.5">{t("filter.status")}</span>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  dispatch({ type: "SET_STATUS_FILTER", payload: v });
                  resetPage();
                }}
                disabled={!results}
              >
                <SelectTrigger className="min-w-40">
                  <SelectValue>{statusLabels[statusFilter as keyof typeof statusLabels] ?? statusFilter}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common:status.all")}</SelectItem>
                  <SelectItem value="found">{t("status.found")}</SelectItem>
                  <SelectItem value="probable">{t("status.probable")}</SelectItem>
                  <SelectItem value="not_found">{t("status.notFound")}</SelectItem>
                  <SelectItem value="unsupported">{t("status.unsupported")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground px-0.5">Standard</span>
              <Select
                value={ratFilter}
                onValueChange={(v) => {
                  dispatch({ type: "SET_RAT_FILTER", payload: v });
                  resetPage();
                }}
              >
                <SelectTrigger className="min-w-32">
                  <SelectValue>{ratLabels[ratFilter as keyof typeof ratLabels] ?? ratFilter}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common:status.all")}</SelectItem>
                  <SelectItem value="GSM">GSM</SelectItem>
                  <SelectItem value="UMTS">UMTS</SelectItem>
                  <SelectItem value="LTE">LTE</SelectItem>
                  <SelectItem value="NR">NR</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground px-0.5">Operator</span>
              <Select
                value={operatorFilter}
                onValueChange={(v) => {
                  dispatch({ type: "SET_OPERATOR_FILTER", payload: v });
                  resetPage();
                }}
                disabled={availableMncs.length <= 1}
              >
                <SelectTrigger className="min-w-36">
                  <SelectValue>
                    {operatorFilter === "all" ? t("common:status.all") : (MNC_NAMES[Number(operatorFilter)] ?? operatorFilter)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common:status.all")}</SelectItem>
                  {availableMncs.map((mnc) => (
                    <SelectItem key={mnc} value={String(mnc)}>
                      <div className="flex items-center gap-2">
                        <div className="size-2 rounded-[2px] shrink-0" style={{ backgroundColor: getOperatorColor(mnc) }} />
                        {MNC_NAMES[mnc] ?? mnc}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {availableBands.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground px-0.5">{t("filter.band")}</span>
                <BandFilterButton
                  value={bandFilter}
                  onChange={(v) => {
                    dispatch({ type: "SET_BAND_FILTER", payload: v });
                    resetPage();
                  }}
                  bands={availableBands}
                  t={t}
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground px-0.5">{t("filter.warning")}</span>
              <Select
                value={warningFilter}
                onValueChange={(v) => {
                  dispatch({ type: "SET_WARNING_FILTER", payload: v });
                  resetPage();
                }}
                disabled={!results}
              >
                <SelectTrigger className="min-w-40">
                  <SelectValue>{warningLabels[warningFilter as keyof typeof warningLabels] ?? warningFilter}</SelectValue>
                </SelectTrigger>
                <SelectContent className="min-w-56">
                  <SelectItem value="all">{t("common:status.all")}</SelectItem>
                  <SelectItem value="any">{t("filter.anyWarning")}</SelectItem>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>{warningLabels.mismatchGroup}</SelectLabel>
                    <SelectItem value="lac_mismatch">{warningLabels.lac_mismatch}</SelectItem>
                    <SelectItem value="tac_mismatch">{warningLabels.tac_mismatch}</SelectItem>
                    <SelectItem value="rnc_mismatch">{warningLabels.rnc_mismatch}</SelectItem>
                    <SelectItem value="pci_mismatch">{warningLabels.pci_mismatch}</SelectItem>
                    <SelectItem value="uarfcn_mismatch">{warningLabels.uarfcn_mismatch}</SelectItem>
                    <SelectItem value="earfcn_mismatch">{warningLabels.earfcn_mismatch}</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>{warningLabels.otherGroup}</SelectLabel>
                    <SelectItem value="not_found">{warningLabels.not_found}</SelectItem>
                    <SelectItem value="pci_missing">{warningLabels.pci_missing}</SelectItem>
                    <SelectItem value="enbid_only">{warningLabels.enbid_only}</SelectItem>
                    <SelectItem value="not_confirmed">{warningLabels.not_confirmed}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  dispatch({ type: "CLEAR_FILTERS" });
                  resetPage();
                }}
                className="text-muted-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3" data-icon="inline-start" />
                {t("common:actions.clear")}
              </Button>
            )}
          </div>
        )}

        <div
          ref={mergedRef}
          className={cn(
            "flex-1 min-h-0 overflow-auto transition-opacity",
            showFloatingMobileFilters && "max-md:mb-10",
            !parsedRows && "hidden",
            isLoading && "opacity-50 pointer-events-none",
          )}
        >
          <DataTable.Root table={table}>
            <DataTable.Table className="w-max min-w-full">
              <DataTable.Header />
              <tbody className="[&_tr:last-child]:border-0">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className={cn("h-15 border-b transition-colors", rowBg(row.original.result))}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-2 py-1 align-middle overflow-hidden" style={{ width: cell.column.getSize() }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <DataTable.Footer columns={columns.length}>
                <DataTablePagination table={table} totalItems={tableData.length} pageSizeOptions={pageSizeOptions} />
              </DataTable.Footer>
            </DataTable.Table>
          </DataTable.Root>
        </div>
        {navActionTarget &&
          createPortal(
            showFloatingMobileFilters && parsedRows ? (
              <div className="max-md:w-[calc(100vw-1.5rem)] max-md:min-w-0 max-md:gap-1">
                <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden md:hidden">
                  <div className="w-max">{analyzerMobileFilterRail}</div>
                </div>
              </div>
            ) : null,
            navActionTarget,
          )}
      </div>
    </RequireAuth>
  );
}

export const Route = createFileRoute("/_layout/analyzer")({
  component: AnalyzerPage,
  staticData: {
    titleKey: "items.analyzer",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
