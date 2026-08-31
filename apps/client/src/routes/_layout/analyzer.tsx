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
  Radar01Icon,
  Sorting05Icon,
  Tag01Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { type Row, type RowSelectionState, type SortingState, createColumnHelper, flexRender, useTable } from "@tanstack/react-table";
import { useCallback, useEffect, useEffectEvent, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { RequireAuth } from "@/components/auth/requireAuth";
import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DATA_TABLE_HEADER_HEIGHT, DATA_TABLE_PAGINATION_HEIGHT, DATA_TABLE_ROW_HEIGHT, DataTable } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavActionTarget } from "@/contexts/navActions";
import { TechnologySummary } from "@/features/map/components/technologySummary";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import { useFloatingDialogStack } from "@/features/station-details/components/floatingDialogStackProvider";
import { getBandName } from "@/features/station-details/frequencyCalc";
import { saveDraft } from "@/features/submissions/utils/analyzerDraftStore";
import { useHorizontalScroll } from "@/hooks/useHorizontalScroll";
import { useMeasuredListRowHeight } from "@/hooks/useMeasuredListRowHeight";
import { useIsMobile } from "@/hooks/useMobile";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { type FileFormat, type ParsedRow, detectFormat, parseFile } from "@/lib/analyzer-parsers";
import { postApiData, showApiError } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { getBandFromEARFCN, getBandFromUARFCN, getBandMhz } from "@/lib/band-utils";
import { formatDuration } from "@/lib/format";
import { type AppTableFeatures, appTableFeatures } from "@/lib/tableFeatures";
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

const WARNING_FILTER_ALIASES: Partial<Record<string, string[]>> = {
  pci_mismatch: ["pci_mismatch", "pci_missing"],
};

const ANALYZER_STATUS_FILTERS = ["all", "found", "probable", "not_found", "unsupported"] as const;
const ANALYZER_RAT_FILTERS = ["all", "GSM", "UMTS", "LTE", "NR"] as const;
const ANALYZER_WARNING_FILTERS = [
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
] as const;

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

const DESKTOP_TABLE_PAGINATION_CONFIG = {
  rowHeight: DATA_TABLE_ROW_HEIGHT,
  headerHeight: DATA_TABLE_HEADER_HEIGHT,
  paginationHeight: DATA_TABLE_PAGINATION_HEIGHT,
};
const MOBILE_TABLE_PAGINATION_CONFIG = {
  headerHeight: DATA_TABLE_HEADER_HEIGHT,
  paginationHeight: DATA_TABLE_PAGINATION_HEIGHT,
};
const MOBILE_ROW_HEIGHT_FALLBACK = 220;

const columnHelper = createColumnHelper<AppTableFeatures, AnalyzerRow>();

function rowBg(result?: AnalyzerResult): string {
  if (!result) return "hover:bg-muted/50";
  if (result.status === "not_found") return "bg-destructive/5 hover:bg-destructive/10";
  if (result.status === "probable") return "bg-amber-50/50 hover:bg-amber-50 dark:bg-amber-950/10 dark:hover:bg-amber-950/20";
  if (result.status === "found" && result.warnings.length > 0) return "bg-amber-50/30 hover:bg-amber-50/60 dark:bg-amber-950/5";
  return "hover:bg-muted/50";
}

function isRowSelectable(row: Row<AppTableFeatures, AnalyzerRow>): boolean {
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
      return { ...state, fileName: action.payload.name, fileSize: action.payload.size, results: null, rowSelection: {} };
    case "SET_PARSED":
      return action.payload
        ? { ...state, parsedRows: action.payload.rows, fileFormat: action.payload.format, rowSelection: {} }
        : { ...state, parsedRows: null, fileFormat: null, rowSelection: {} };
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
        disabled={bands.length === 0 && value.length === 0}
        className={cn(
          "h-8 rounded-lg border bg-transparent px-2.5 text-sm transition-colors flex items-center gap-2 min-w-42.5",
          "border-input dark:bg-input/30 dark:hover:bg-input/50 hover:bg-muted",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
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

type AnalyzerTranslation = ReturnType<typeof useTranslation<["cellAnalyzer", "common", "stations"]>>["t"];

type IdentifierItem = {
  label: string;
  value: number | null;
  dbValue?: number | null;
  warn?: boolean;
  missing?: boolean;
};

function getBandDetails(row: ParsedRow): { value: string; name: string | null } | null {
  let band: number | null = null;
  if (row.rat === "LTE" && row.earfcn !== undefined) band = getBandFromEARFCN(row.earfcn);
  else if (row.rat === "UMTS" && row.uarfcn !== undefined) band = getBandFromUARFCN(row.uarfcn);
  if (band === null) return null;
  const value = getBandMhz(band);
  if (value === null) return null;
  return { value, name: getBandName(row.rat, Number(value)) };
}

function getIdentifierItems({ parsedRow: cell, result }: AnalyzerRow): IdentifierItem[] {
  const warnings = result?.warnings ?? [];
  const matched = result?.cell;

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
}

function IdentifierChips({ analyzerRow, compact = false, t }: { analyzerRow: AnalyzerRow; compact?: boolean; t: AnalyzerTranslation }) {
  const items = getIdentifierItems(analyzerRow);
  if (items.length === 0) return <span className="text-xs text-muted-foreground">-</span>;

  return (
    <div className={cn("flex items-center gap-1", compact ? "flex-nowrap overflow-hidden" : "flex-wrap")}>
      {items.map(({ label, value, dbValue, warn, missing }) => (
        <span
          key={label}
          className={cn(
            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium",
            warn && "bg-destructive/10 text-destructive",
            missing && !warn && "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
            !warn && !missing && "bg-muted text-muted-foreground",
          )}
        >
          <span className="mr-1 opacity-65">{label}</span>
          {warn && dbValue !== null && dbValue !== undefined ? (
            <Tooltip>
              <TooltipTrigger>
                <span className="inline-flex items-center">
                  <span className="font-mono font-semibold underline decoration-dotted underline-offset-2">{dbValue}</span>
                  <HugeiconsIcon icon={ArrowRight01Icon} className="mx-0.5 size-3 opacity-60" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{t("warning.dbValue")}</TooltipContent>
            </Tooltip>
          ) : null}
          {missing ? (
            <Tooltip>
              <TooltipTrigger>
                <span className="cursor-help font-mono font-semibold underline decoration-dotted underline-offset-2">{value}</span>
              </TooltipTrigger>
              <TooltipContent>{t("warning.pciMissingFromDb")}</TooltipContent>
            </Tooltip>
          ) : (
            <span className="font-mono font-semibold tabular-nums">{value ?? "-"}</span>
          )}
        </span>
      ))}
    </div>
  );
}

function ParsedIdentityCell({ analyzerRow, compact = false, t }: { analyzerRow: AnalyzerRow; compact?: boolean; t: AnalyzerTranslation }) {
  const { parsedRow, result } = analyzerRow;
  const operatorName = MNC_NAMES[parsedRow.mnc] ?? String(parsedRow.mnc);
  const band = getBandDetails(parsedRow);

  return (
    <div className="min-w-0 space-y-1">
      <div className={cn("flex min-w-0 items-center gap-2", compact ? "overflow-hidden" : "flex-wrap")}>
        <DialogOperatorName name={operatorName} mnc={parsedRow.mnc} compact />
        <div className="flex min-w-0 shrink-0 items-center gap-1 whitespace-nowrap">
          <TechnologySummary bands={[`${parsedRow.rat}${band?.value ?? ""}`]} className="mt-0 pl-0" />
          {band?.name ? <span className="text-[11px] text-muted-foreground">({band.name})</span> : null}
        </div>
        {isNotConfirmedCell(result) ? (
          <Tooltip>
            <TooltipTrigger aria-label={t("stations:cells.cellNotConfirmed")}>
              <span className="inline-flex size-5 cursor-help items-center justify-center rounded-md bg-destructive/10 text-destructive">
                <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>{t("stations:cells.cellNotConfirmed")}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <IdentifierChips analyzerRow={analyzerRow} compact={compact} t={t} />
    </div>
  );
}

function AnalyzerStatusBadge({ result, t }: { result: AnalyzerResult | undefined; t: AnalyzerTranslation }) {
  const status = result?.status;
  let label = t("status.notAnalyzed");
  if (status) label = t(`status.${status === "not_found" ? "notFound" : status}`);
  let icon = AlertCircleIcon;
  if (status === "found") icon = CheckmarkCircle02Icon;
  else if (status === "not_found") icon = Cancel01Icon;

  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold",
        status === "found" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
        status === "probable" && "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
        status === "not_found" && "bg-destructive/10 text-destructive",
        (status === "unsupported" || status === undefined) && "bg-muted text-muted-foreground",
      )}
    >
      <HugeiconsIcon icon={icon} className="size-3" />
      {label}
    </span>
  );
}

function getWarningLabel(warning: string, warningLabels: Record<string, string>, t: AnalyzerTranslation): string {
  return warningLabels[warning] ?? t(WARNING_I18N_KEY[warning] ?? warning);
}

function MatchResultCell({
  analyzerRow,
  compact = false,
  warningLabels,
  t,
}: {
  analyzerRow: AnalyzerRow;
  compact?: boolean;
  warningLabels: Record<string, string>;
  t: AnalyzerTranslation;
}) {
  const result = analyzerRow.result;
  const loc = result?.station?.location;
  const regionText = loc?.region?.name;
  const locationText = loc?.city || loc?.address ? [loc.city, loc.address].filter(Boolean).join(", ") : null;
  const matchedNote = getMatchedCellNote(result?.cell);
  const warningKeys = result ? [...new Set(result.warnings)] : [];
  if (isNotConfirmedCell(result) && !warningKeys.includes("not_confirmed")) warningKeys.push("not_confirmed");
  const warningTexts = warningKeys.map((warning) => getWarningLabel(warning, warningLabels, t));

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <AnalyzerStatusBadge result={result} t={t} />
        {regionText ? <span className="truncate text-[11px] text-muted-foreground">{regionText}</span> : null}
        {compact && warningTexts.length > 0 ? (
          <Tooltip>
            <TooltipTrigger aria-label={warningTexts.join("; ")}>
              <span className="inline-flex h-5 shrink-0 cursor-help items-center gap-1 rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <HugeiconsIcon icon={AlertCircleIcon} className="size-3" />
                {warningTexts.length}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-80">
              <ul className="grid gap-1">
                {warningTexts.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {result && (result.status === "found" || result.status === "probable") ? (
        <p
          className="truncate text-xs font-medium text-emerald-800 dark:text-emerald-300"
          title={[locationText, matchedNote].filter(Boolean).join(" - ")}
        >
          {locationText ?? "-"}
          {matchedNote ? <span className="font-normal"> - {matchedNote}</span> : null}
        </p>
      ) : null}
      {!compact && warningTexts.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {warningTexts.map((warning) => (
            <span
              key={warning}
              className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              <HugeiconsIcon icon={AlertCircleIcon} className="size-3 shrink-0" />
              {warning}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SourceDescriptionCell({ row }: { row: ParsedRow }) {
  return (
    <div className="min-w-0">
      <p className="line-clamp-2 text-xs leading-4 text-foreground/80" title={row.description || row.rawLine}>
        {row.description || "-"}
      </p>
    </div>
  );
}

function StationActionsCell({
  result,
  openStationDialog,
  t,
}: {
  result: AnalyzerResult | undefined;
  openStationDialog: (stationId: number, source: "internal") => void;
  t: AnalyzerTranslation;
}) {
  const station = result?.station;
  if (!station) return <span className="text-xs text-muted-foreground">{t("table.noStation")}</span>;

  return (
    <div className="min-w-0 space-y-1">
      <button
        type="button"
        className="group flex max-w-full cursor-pointer items-center gap-1.5 text-left"
        onClick={() => openStationDialog(station.id, "internal")}
      >
        <span className="shrink-0 font-mono text-sm font-medium text-foreground tabular-nums group-hover:underline group-focus-visible:underline">
          {station.station_id}
        </span>
      </button>
      <div className="flex flex-nowrap items-center gap-1">
        <Button type="button" variant="outline" size="xs" onClick={() => openStationDialog(station.id, "internal")}>
          <HugeiconsIcon icon={Tag01Icon} className="size-3" data-icon="inline-start" />
          {t("table.openStation")}
        </Button>
        <Link
          to="/"
          hash={`map=16/${station.location.latitude}/${station.location.longitude}~f~L${station.location.id}`}
          target="_blank"
          className={buttonVariants({ variant: "ghost", size: "xs" })}
        >
          <HugeiconsIcon icon={Location01Icon} className="size-3" data-icon="inline-start" />
          {t("table.showOnMap")}
        </Link>
      </div>
    </div>
  );
}

function AnalyzerMobileRow({
  row,
  warningLabels,
  t,
  openStationDialog,
}: {
  row: Row<AppTableFeatures, AnalyzerRow>;
  warningLabels: Record<string, string>;
  t: AnalyzerTranslation;
  openStationDialog: (stationId: number, source: "internal") => void;
}) {
  const analyzerRow = row.original;

  return (
    <article className={cn("space-y-2 p-2.5 transition-colors", rowBg(analyzerRow.result))}>
      <div className="flex items-start gap-3">
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={t("selection.selectRow", { number: analyzerRow.index + 1 })}
        />
        <span className="pt-0.5 text-xs text-muted-foreground tabular-nums">#{analyzerRow.index + 1}</span>
        <div className="min-w-0 flex-1">
          <ParsedIdentityCell analyzerRow={analyzerRow} t={t} />
        </div>
      </div>

      {analyzerRow.parsedRow.description ? (
        <div className="border-t pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("table.sourceDescription")}</p>
          <SourceDescriptionCell row={analyzerRow.parsedRow} />
        </div>
      ) : null}

      <div className="grid gap-2 border-t pt-2 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("table.matchResult")}</p>
          <MatchResultCell analyzerRow={analyzerRow} warningLabels={warningLabels} t={t} />
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("common:labels.station")}</p>
          <StationActionsCell result={analyzerRow.result} openStationDialog={openStationDialog} t={t} />
        </div>
      </div>
    </article>
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
  const [hasAnalysisError, setHasAnalysisError] = useState(false);
  const { isDragging, parsedRows, results, fileName, fileSize, fileFormat, statusFilter, ratFilter, warningFilter, operatorFilter, bandFilter } =
    state;
  const { data: session } = authClient.useSession();
  const stationCap = ["editor", "admin"].includes(session?.user?.role ?? "") ? 50 : 25;

  const isMobile = useIsMobile();
  const scrollRef = useHorizontalScroll<HTMLDivElement>();
  const { listRef, rowHeight: mobileRowHeight } = useMeasuredListRowHeight(MOBILE_ROW_HEIGHT_FALLBACK);
  const desktopPagination = useTablePagination(DESKTOP_TABLE_PAGINATION_CONFIG);
  const mobilePagination = useTablePagination({ ...MOBILE_TABLE_PAGINATION_CONFIG, rowHeight: mobileRowHeight });
  const { containerRef, pagination, setPagination, pageSizeOptions } = isMobile ? mobilePagination : desktopPagination;
  const navActionTarget = useNavActionTarget();
  const hasFloatingMobileActions = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  const resetPage = useCallback(() => setPagination((p) => ({ ...p, pageIndex: 0 })), [setPagination]);

  const handleFile = useCallback(
    (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(t("errors.fileTooLarge"));
        return;
      }

      setHasAnalysisError(false);
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

  const mutationFn = useCallback(async () => {
    const cells = parsedRows!.map(({ description: _d, rawLine: _r, ...cell }) => cell);
    return postApiData<AnalyzerResult[], { cells: typeof cells }>("analyzer", { cells });
  }, [parsedRows]);

  const onAnalyzeSuccess = useCallback(
    (data: AnalyzerResult[]) => {
      if (analyzeStartRef.current) setFinalDuration(Date.now() - analyzeStartRef.current);
      setHasAnalysisError(false);
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
      setHasAnalysisError(false);
    },
    onSuccess: onAnalyzeSuccess,
    onError: (error) => {
      setHasAnalysisError(true);
      showApiError(error);
    },
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
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: "select",
          header: ({ table }) => {
            const allSelected = table.getIsAllPageRowsSelected();
            const checked = allSelected || table.getIsSomePageRowsSelected();
            return (
              <Checkbox
                checked={checked}
                onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                aria-label={t("selection.selectAllVisible")}
              />
            );
          },
          size: 64,
          cell: ({ row }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={row.getIsSelected()}
                disabled={!row.getCanSelect()}
                onCheckedChange={(value) => row.toggleSelected(!!value)}
                aria-label={t("selection.selectRow", { number: row.original.index + 1 })}
              />
              <span className="text-xs text-muted-foreground tabular-nums">{row.original.index + 1}</span>
            </div>
          ),
        }),
        columnHelper.accessor((r) => r.parsedRow, {
          id: "identity",
          header: ({ column }) => {
            const sorted = column.getIsSorted();
            return (
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-foreground -ml-1 px-1 py-0.5 rounded transition-colors"
                onClick={column.getToggleSortingHandler()}
              >
                {t("table.parsedCell")}
                <HugeiconsIcon
                  icon={Sorting05Icon}
                  className={cn("size-3.5 transition-colors", sorted ? "text-foreground" : "text-muted-foreground/40")}
                  style={sorted === "asc" ? SORT_ASC_STYLE : undefined}
                />
              </button>
            );
          },
          size: 360,
          sortFn: (rowA, rowB) => {
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
          cell: ({ row }) => <ParsedIdentityCell analyzerRow={row.original} compact t={t} />,
        }),
        columnHelper.accessor((r) => r.parsedRow, {
          id: "description",
          header: t("table.sourceDescription"),
          size: 220,
          cell: ({ getValue }) => <SourceDescriptionCell row={getValue()} />,
        }),
        columnHelper.accessor((r) => r, {
          id: "match",
          header: t("table.matchResult"),
          size: 330,
          cell: ({ getValue }) => <MatchResultCell analyzerRow={getValue()} compact warningLabels={warningLabels} t={t} />,
        }),
        columnHelper.accessor((r) => r.result, {
          id: "station",
          header: t("common:labels.station"),
          size: 240,
          cell: ({ getValue }) => <StationActionsCell result={getValue()} openStationDialog={openStationDialog} t={t} />,
        }),
      ]),
    [openStationDialog, t, warningLabels],
  );

  const table = useTable({
    features: appTableFeatures,
    data: tableData,
    columns,
    getRowId: (row) => String(row.index),
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

  const resetSelectedRows = useEffectEvent(() => table.resetRowSelection());

  useEffect(() => {
    if (selectedCount === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") resetSelectedRows();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedCount]);

  const analyzerMobileFilterRail = isMobile ? (
    <div className="flex items-center gap-1">
      <MobileFilterChip
        active={statusFilter !== "all"}
        count={statusFilter !== "all" ? 1 : 0}
        icon={CheckmarkCircle02Icon}
        label={t("filter.status")}
      >
        <MobileFilterPanelTitle>{t("filter.status")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          {ANALYZER_STATUS_FILTERS.map((status) => (
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

      <MobileFilterChip active={warningFilter !== "all"} count={warningFilter !== "all" ? 1 : 0} icon={AlertCircleIcon} label={t("filter.warning")}>
        <MobileFilterPanelTitle>{t("filter.warning")}</MobileFilterPanelTitle>
        <div className="grid max-h-64 gap-1 overflow-y-auto">
          {ANALYZER_WARNING_FILTERS.map((warning) => (
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
              {warningLabels[warning]}
            </button>
          ))}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={ratFilter !== "all"} count={ratFilter !== "all" ? 1 : 0} icon={FullSignalIcon} label={t("common:labels.standard")}>
        <MobileFilterPanelTitle>{t("common:labels.standard")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          {ANALYZER_RAT_FILTERS.map((rat) => (
            <button
              key={rat}
              type="button"
              onClick={() => {
                dispatch({ type: "SET_RAT_FILTER", payload: rat });
                resetPage();
              }}
              className={cn("h-8 rounded-md px-2 text-left text-sm", ratFilter === rat ? "bg-primary/10 text-primary" : "hover:bg-muted")}
            >
              {rat === "all" ? t("common:status.all") : rat}
            </button>
          ))}
        </div>
      </MobileFilterChip>

      <MobileFilterChip
        active={operatorFilter !== "all"}
        count={operatorFilter !== "all" ? 1 : 0}
        icon={FilterIcon}
        label={t("common:labels.operator")}
      >
        <MobileFilterPanelTitle>{t("common:labels.operator")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "SET_OPERATOR_FILTER", payload: "all" });
              resetPage();
            }}
            className={cn("h-8 rounded-md px-2 text-left text-sm", operatorFilter === "all" ? "bg-primary/10 text-primary" : "hover:bg-muted")}
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
                "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm",
                operatorFilter === String(mnc) ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              <DialogOperatorName name={MNC_NAMES[mnc] ?? String(mnc)} mnc={mnc} compact />
            </button>
          ))}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={bandFilter.length > 0} count={bandFilter.length} icon={Radar01Icon} label={t("filter.band")}>
        <MobileFilterPanelTitle>{t("filter.band")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "SET_BAND_FILTER", payload: [] });
              resetPage();
            }}
            className={cn("h-8 rounded-md px-2 text-left text-sm", bandFilter.length === 0 ? "bg-primary/10 text-primary" : "hover:bg-muted")}
          >
            {t("filter.allBands")}
          </button>
          {availableBands.map(({ rat, band }) => {
            const key = `${rat}-${band}`;
            const selected = bandFilter.includes(key);
            const mhz = getBandMhz(band);
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  dispatch({ type: "SET_BAND_FILTER", payload: selected ? bandFilter.filter((value) => value !== key) : [...bandFilter, key] });
                  resetPage();
                }}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm",
                  selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="font-mono">
                  {rat} B{band}
                </span>
                {mhz ? <span className="text-muted-foreground">{mhz} MHz</span> : null}
              </button>
            );
          })}
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
  ) : null;

  let selectionDisabledReason: string | null = null;
  if (uniqueStationCount === 0) selectionDisabledReason = t("selection.reviewBatchDisabledNoStations");
  else if (uniqueStationCount > stationCap) selectionDisabledReason = t("selection.reviewBatchDisabledOverLimit", { count: stationCap });

  const selectionBar =
    selectedCount > 0 ? (
      <div
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1.5"
        role="status"
        aria-live="polite"
      >
        <button
          type="button"
          onClick={() => table.resetRowSelection()}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("selection.clearSelection")}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
        </button>
        <span className="flex h-5 min-w-6 shrink-0 items-center justify-center rounded bg-primary px-1.5 text-xs font-bold text-primary-foreground tabular-nums">
          {selectedCount}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{t("selection.rowsSelected", { count: selectedCount })}</p>
          {selectionDisabledReason ? null : (
            <p className="truncate text-[11px] text-muted-foreground">{t("selection.uniqueStationCount", { count: uniqueStationCount })}</p>
          )}
        </div>
        <Button size="sm" onClick={handleNavigationToReview} disabled={selectionDisabledReason !== null} className="shrink-0">
          {t("selection.reviewBatch")}
          <HugeiconsIcon icon={LinkSquare01Icon} className="size-3.5" data-icon="inline-end" />
        </Button>
        {selectionDisabledReason ? (
          <p className="basis-full pl-9 text-[11px] leading-4 text-destructive" role="note" tabIndex={0}>
            {selectionDisabledReason}
          </p>
        ) : null}
      </div>
    ) : null;

  let statusAnnouncement = "";
  if (isLoading) statusAnnouncement = t("statusAnnouncement.analyzing");
  else if (results) statusAnnouncement = t("statusAnnouncement.complete", { count: results.length });

  return (
    <RequireAuth>
      <div className={cn("flex-1 p-3 md:p-4", parsedRows ? "flex min-h-0 flex-col gap-3 overflow-hidden" : "space-y-4 overflow-y-auto")}>
        <div className="flex shrink-0 flex-col gap-3">
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
            <div className="overflow-hidden rounded-lg border bg-card">
              <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <HugeiconsIcon icon={File02Icon} className="size-5" />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">{fileName}</span>
                    <span className="text-xs text-muted-foreground">
                      {t("file.rowCount", { count: parsedRows.length })} · {formatFileSize(fileSize)} ·{" "}
                      {fileFormat === "netmonitor" ? "NetMonitor" : "NetMonster"}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    {t("file.changeFile")}
                  </Button>
                  <Button
                    onClick={() => handleAnalyze()}
                    disabled={isLoading || parsedRows.length === 0}
                    size="sm"
                    className="min-w-44 justify-center"
                  >
                    {isLoading ? (
                      <>
                        <Spinner data-icon="inline-start" />
                        {t("button.analyzing")}
                        <span className="text-xs opacity-75 tabular-nums">{formatDuration(elapsed)}</span>
                      </>
                    ) : (
                      t("button.analyze", { count: parsedRows.length })
                    )}
                  </Button>
                </div>
              </div>
              {stats ? (
                <div className="flex flex-wrap items-center gap-1.5 border-t bg-muted/20 px-3 py-2" aria-label={t("stats.summary")}>
                  {(
                    [
                      ["found", stats.found, "text-emerald-800 dark:text-emerald-300"],
                      ["probable", stats.probable, "text-amber-900 dark:text-amber-200"],
                      ["not_found", stats.notFound, "text-destructive"],
                      ["unsupported", stats.unsupported, "text-muted-foreground"],
                    ] as const
                  ).map(([status, count, colorClass]) =>
                    count > 0 || status === "found" || status === "not_found" ? (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          dispatch({ type: "SET_STATUS_FILTER", payload: statusFilter === status ? "all" : status });
                          resetPage();
                        }}
                        className={cn(
                          "rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-muted",
                          colorClass,
                          statusFilter === status && "bg-background shadow-sm ring-1 ring-border",
                        )}
                        aria-pressed={statusFilter === status}
                      >
                        <span className="font-bold tabular-nums">{count}</span> {t(`stats.${status === "not_found" ? "notFound" : status}`)}
                      </button>
                    ) : null,
                  )}
                  {finalDuration !== null ? (
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {t("stats.completedIn", { duration: formatDuration(finalDuration) })}
                    </span>
                  ) : null}
                </div>
              ) : null}
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
                if (e.key !== "Enter" && e.key !== " ") return;
                if (e.key === " ") e.preventDefault();
                fileInputRef.current?.click();
              }}
            >
              <HugeiconsIcon icon={Upload04Icon} className="size-10 mx-auto mb-3 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">{t("file.dropHint")}</p>
                <p className="text-sm text-muted-foreground">{t("file.constraints")}</p>
              </div>
            </div>
          )}

          {hasAnalysisError ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2" role="alert">
              <HugeiconsIcon icon={AlertCircleIcon} className="size-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{t("errors.analysisFailed")}</p>
                <p className="text-xs text-muted-foreground">{t("errors.analysisFailedHint")}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleAnalyze()} disabled={isLoading}>
                {t("common:actions.retry")}
              </Button>
            </div>
          ) : null}

          <p className="sr-only" role="status" aria-live="polite">
            {statusAnnouncement}
          </p>
        </div>

        {parsedRows && !isMobile ? (
          <div className="flex shrink-0 flex-wrap items-end gap-2 rounded-lg border bg-card p-2">
            <div className="flex min-w-36 flex-1 flex-col gap-1 sm:flex-none">
              <span className="px-0.5 text-xs font-medium text-muted-foreground">{t("filter.status")}</span>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  dispatch({ type: "SET_STATUS_FILTER", payload: value });
                  resetPage();
                }}
                disabled={!results}
              >
                <SelectTrigger className="w-full sm:min-w-40">
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

            <div className="flex min-w-40 flex-1 flex-col gap-1 sm:flex-none">
              <span className="px-0.5 text-xs font-medium text-muted-foreground">{t("filter.warning")}</span>
              <Select
                value={warningFilter}
                onValueChange={(value) => {
                  dispatch({ type: "SET_WARNING_FILTER", payload: value });
                  resetPage();
                }}
                disabled={!results}
              >
                <SelectTrigger className="w-full sm:min-w-44">
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

            <div className="flex min-w-32 flex-1 flex-col gap-1 sm:flex-none">
              <span className="px-0.5 text-xs font-medium text-muted-foreground">{t("common:labels.standard")}</span>
              <Select
                value={ratFilter}
                onValueChange={(value) => {
                  dispatch({ type: "SET_RAT_FILTER", payload: value });
                  resetPage();
                }}
              >
                <SelectTrigger className="w-full sm:min-w-32">
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

            <div className="flex min-w-40 flex-1 flex-col gap-1 sm:flex-none">
              <span className="px-0.5 text-xs font-medium text-muted-foreground">{t("common:labels.operator")}</span>
              <Select
                value={operatorFilter}
                onValueChange={(value) => {
                  dispatch({ type: "SET_OPERATOR_FILTER", payload: value });
                  resetPage();
                }}
                disabled={availableMncs.length <= 1}
              >
                <SelectTrigger className="w-full sm:min-w-40">
                  <SelectValue>
                    {operatorFilter === "all" ? t("common:status.all") : (MNC_NAMES[Number(operatorFilter)] ?? operatorFilter)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common:status.all")}</SelectItem>
                  {availableMncs.map((mnc) => (
                    <SelectItem key={mnc} value={String(mnc)}>
                      <DialogOperatorName name={MNC_NAMES[mnc] ?? String(mnc)} mnc={mnc} compact labelClassName="text-sm font-normal" />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-42.5 flex-1 flex-col gap-1 sm:flex-none">
              <span className="px-0.5 text-xs font-medium text-muted-foreground">{t("filter.band")}</span>
              <BandFilterButton
                value={bandFilter}
                onChange={(value) => {
                  dispatch({ type: "SET_BAND_FILTER", payload: value });
                  resetPage();
                }}
                bands={availableBands}
                t={t}
              />
            </div>

            {hasActiveFilters ? (
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
            ) : null}
          </div>
        ) : null}

        {parsedRows && isMobile && !hasFloatingMobileActions ? (
          <div className="min-w-0 shrink-0 overflow-x-auto overflow-y-hidden rounded-lg border bg-card p-1.5">
            {selectionBar ?? <div className="w-max">{analyzerMobileFilterRail}</div>}
          </div>
        ) : null}

        {selectionBar && !isMobile ? selectionBar : null}

        <div
          ref={containerRef}
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden transition-opacity",
            hasFloatingMobileActions && "mb-10",
            !parsedRows && "hidden",
            isLoading && "pointer-events-none opacity-55",
          )}
          aria-busy={isLoading}
        >
          {isMobile ? (
            <div className="max-h-full overflow-y-auto">
              <div className="overflow-hidden rounded-t-lg border border-b-0 bg-card">
                <div className="flex h-10 items-center gap-2 border-b bg-muted/20 px-2">
                  <Checkbox
                    checked={table.getIsAllPageRowsSelected() || table.getIsSomePageRowsSelected()}
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                    aria-label={t("selection.selectAllVisible")}
                  />
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors hover:bg-muted",
                      table.getColumn("identity")?.getIsSorted() ? "text-foreground" : "text-muted-foreground",
                    )}
                    onClick={() => table.getColumn("identity")?.toggleSorting()}
                    aria-label={t("table.sortByIdentity")}
                  >
                    {t("table.parsedCell")}
                    <HugeiconsIcon
                      icon={Sorting05Icon}
                      className="size-3.5"
                      style={table.getColumn("identity")?.getIsSorted() === "asc" ? SORT_ASC_STYLE : undefined}
                    />
                  </button>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{t("table.visibleCount", { count: tableData.length })}</span>
                </div>
                {tableData.length === 0 ? (
                  <div className="flex min-h-40 items-center justify-center px-4 text-center text-sm text-muted-foreground" role="status">
                    {t("table.noResults")}
                  </div>
                ) : (
                  <ul ref={listRef} className="divide-y">
                    {table.getRowModel().rows.map((row) => (
                      <li key={row.id}>
                        <AnalyzerMobileRow row={row} warningLabels={warningLabels} t={t} openStationDialog={openStationDialog} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <DataTable.PaginationFooter>
                <DataTablePagination table={table} totalItems={tableData.length} pageSizeOptions={pageSizeOptions} showRowsPerPage={false} />
              </DataTable.PaginationFooter>
            </div>
          ) : (
            <div className="h-full">
              <div ref={scrollRef} className="max-h-[calc(100%-49px)] overflow-auto">
                <div className="min-w-295">
                  <DataTable.Root table={table} className="block rounded-b-none border-b-0">
                    <DataTable.Table>
                      <DataTable.Header />
                      {tableData.length === 0 ? (
                        <tbody>
                          <DataTable.Empty columns={columns.length}>
                            <span className="text-sm text-muted-foreground" role="status">
                              {t("table.noResults")}
                            </span>
                          </DataTable.Empty>
                        </tbody>
                      ) : (
                        <tbody className="[&_tr:last-child]:border-0">
                          {table.getRowModel().rows.map((row) => (
                            <tr key={row.id} className={cn("h-16 border-b transition-colors", rowBg(row.original.result))}>
                              {row.getVisibleCells().map((cell) => (
                                <td key={cell.id} className="h-16 overflow-hidden px-2 py-1 align-middle" style={{ width: cell.column.getSize() }}>
                                  <div className="flex h-14 items-center overflow-hidden">
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                  </div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      )}
                    </DataTable.Table>
                  </DataTable.Root>
                </div>
              </div>
              <DataTable.PaginationFooter>
                <DataTablePagination table={table} totalItems={tableData.length} pageSizeOptions={pageSizeOptions} />
              </DataTable.PaginationFooter>
            </div>
          )}
        </div>
        {hasFloatingMobileActions && navActionTarget && parsedRows
          ? createPortal(
              <div className="w-[calc(100vw-1.5rem)] min-w-0">
                {selectionBar ?? (
                  <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
                    <div className="w-max">{analyzerMobileFilterRail}</div>
                  </div>
                )}
              </div>,
              navActionTarget,
            )
          : null}
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
