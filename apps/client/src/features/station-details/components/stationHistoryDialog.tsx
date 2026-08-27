import {
  AirportTowerIcon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  Clock01Icon,
  CompassIcon,
  EarthIcon,
  FullSignalIcon,
  Location01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { memo, useEffect, useId, useImperativeHandle, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getRatDetailFieldLabel } from "@/features/shared/ratCellFields";
import { authClient } from "@/lib/authClient";
import { formatFullDate, resolveAvatarUrl } from "@/lib/format";
import { getOperatorColor } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";

import { fetchStationHistory } from "../api";
import type { StationHistoryChange, StationHistoryChangeValue, StationHistoryEntry, StationHistoryValue } from "../api";
import { DialogOperatorName } from "./dialogOperatorName";
import type { FloatingDialogPanelFrameProps, StationHistoryDialogPayload } from "./floatingDialogStackTypes";

type StationHistoryDialogPanelProps = FloatingDialogPanelFrameProps & StationHistoryDialogPayload;

const KIND_ICONS: Record<StationHistoryEntry["kind"], IconSvgElement> = {
  station: AirportTowerIcon,
  location: Location01Icon,
  cells: FullSignalIcon,
  sectors: CompassIcon,
  network_ids: EarthIcon,
};

const ACTION_CHIP_CLASSES: Record<StationHistoryEntry["action"], string> = {
  create: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  update: "border-border bg-muted/50 text-muted-foreground",
  delete: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300",
};

const CELL_DETAIL_FIELD_KEYS = new Set([
  "lac",
  "cid",
  "e_gsm",
  "rnc",
  "arfcn",
  "tac",
  "enbid",
  "clid",
  "pci",
  "earfcn",
  "supports_iot",
  "nrtac",
  "gnbid",
  "gnbid_length",
  "type",
  "supports_nr_redcap",
]);

const CELL_DETAIL_LABEL_OVERRIDES: Record<string, string> = {
  gnbid_length: "gNBID length",
};

const COMMON_LABEL_KEYS: Record<string, string> = {
  station_id: "stationId",
  status: "status",
  notes: "notes",
  extra_address: "extraAddress",
  operator: "operator",
  location: "location",
  confirmed: "confirmed",
  region: "region",
  city: "city",
  address: "address",
  longitude: "longitude",
  latitude: "latitude",
  band: "band",
  networks_id: "networksId",
  networks_name: "networksName",
  cell_type: "cellType",
};

type HistoryDayGroup = { key: string; label: string; entries: StationHistoryEntry[] };
type CellChangeGroup = { label: string; changes: StationHistoryChange[] };

function isValueRecord(value: StationHistoryChangeValue): value is Record<string, StationHistoryValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function groupChangesByLabel(changes: StationHistoryChange[]): CellChangeGroup[] {
  const groups: CellChangeGroup[] = [];
  for (const change of changes) {
    const label = change.label ?? "";
    const previous = groups[groups.length - 1];
    if (previous && previous.label === label) previous.changes.push(change);
    else groups.push({ label, changes: [change] });
  }
  return groups;
}

const HistoryEntryItem = memo(function HistoryEntryItem({ entry, operatorName }: { entry: StationHistoryEntry; operatorName: string }) {
  const { t, i18n } = useTranslation(["stationDetails", "stations", "common"]);

  const fieldLabel = (field: string, rat?: string): string => {
    if (CELL_DETAIL_FIELD_KEYS.has(field)) return CELL_DETAIL_LABEL_OVERRIDES[field] ?? getRatDetailFieldLabel(rat ?? "", field);
    if (field === "rat") return "RAT";
    if (field === "mno_name") return t("common:labels.mnoName", { brand: operatorName });
    if (field === "azimuth") return t("sectors.azimuth");
    if (field === "azimuths") return t("sectors.title");
    if (field === "cell") return t("history.fields.cell");
    const commonKey = COMMON_LABEL_KEYS[field];
    if (commonKey !== undefined) return t(`common:labels.${commonKey}`);
    return field;
  };

  const formatValue = (field: string, value: StationHistoryChangeValue, rat?: string): string => {
    if (value === null || value === "") return "-";
    if (typeof value === "boolean") return value ? t("history.values.yes") : t("history.values.no");
    if (field === "status" && typeof value === "string") return t(`stations:status.${value}`, { defaultValue: value });
    if (field === "type" && typeof value === "string") return value.toUpperCase();
    if ((field === "azimuth" || field === "azimuths") && typeof value === "number") return `${value}°`;
    if (Array.isArray(value)) {
      if (value.length === 0) return "-";
      return value.map((item) => formatValue(field === "azimuths" ? "azimuth" : field, item, rat)).join(", ");
    }
    if (isValueRecord(value))
      return Object.entries(value)
        .map(([key, nested]) => `${fieldLabel(key, rat)}: ${formatValue(key, nested, rat)}`)
        .join(" · ");
    return String(value);
  };

  const renderChangeValue = (change: StationHistoryChange) => {
    if (entry.action === "create") return <span className="font-medium text-foreground">{formatValue(change.field, change.to, change.rat)}</span>;
    if (entry.action === "delete") return <span className="font-medium">{formatValue(change.field, change.from, change.rat)}</span>;
    return (
      <>
        <span className="rounded-sm bg-red-500/10 px-1 py-px text-red-700 dark:text-red-300">
          {formatValue(change.field, change.from, change.rat)}
        </span>
        <span aria-hidden className="mx-1 text-muted-foreground/50">
          <HugeiconsIcon icon={ArrowRight01Icon} className="inline size-3 align-[-2px]" />
        </span>
        <span className="rounded-sm bg-emerald-500/10 px-1 py-px font-medium text-emerald-700 dark:text-emerald-300">
          {formatValue(change.field, change.to, change.rat)}
        </span>
      </>
    );
  };

  const renderChangeTokens = (changes: StationHistoryChange[], includeCellLabel = false) => (
    <div className="text-xs leading-6 text-muted-foreground wrap-break-word">
      {changes.map((change, index) => (
        <p key={`${entry.id}-${index}`}>
          {includeCellLabel && change.label ? `${change.label} ` : ""}
          {fieldLabel(change.field, change.rat)}
          {entry.action === "update" ? " " : ": "}
          {renderChangeValue(change)}
        </p>
      ))}
    </div>
  );

  const renderCellSnapshot = (change: StationHistoryChange, key: string) => {
    const snapshot = entry.action === "create" ? change.to : change.from;
    const tokens = isValueRecord(snapshot) ? Object.entries(snapshot).filter(([field]) => field !== "rat" && field !== "band") : [];
    return (
      <div key={key} className="rounded-lg bg-muted/30 px-2.5 py-1.5">
        <p className={cn("text-xs font-semibold", entry.action === "delete" ? "text-muted-foreground" : "text-foreground")}>
          {change.label ?? fieldLabel("cell")}
        </p>
        {tokens.length > 0 && (
          <p className="mt-0.5 text-xs leading-6 text-muted-foreground wrap-break-word">
            {tokens.map(([field, value], index) => (
              <span key={field}>
                {index > 0 && <span className="mx-1.5 text-muted-foreground/50">·</span>}
                {fieldLabel(field, change.rat)}:{" "}
                <span className={cn("font-medium", entry.action === "delete" ? "" : "text-foreground")}>{formatValue(field, value, change.rat)}</span>
              </span>
            ))}
          </p>
        )}
      </div>
    );
  };

  const renderEntryChanges = () => {
    if (entry.kind === "cells" && entry.action !== "update")
      return <div className="mt-1 space-y-1">{entry.changes.map((change, index) => renderCellSnapshot(change, `${entry.id}-${index}`))}</div>;

    if (entry.kind === "cells")
      return (
        <div className="mt-1 space-y-1">
          {groupChangesByLabel(entry.changes).map((group, groupIndex) => (
            <div key={`${entry.id}-${groupIndex}`} className="rounded-lg bg-muted/30 px-2.5 py-1.5">
              {group.label !== "" && <p className="text-xs font-semibold text-foreground">{group.label}</p>}
              {renderChangeTokens(group.changes, group.label === "")}
            </div>
          ))}
        </div>
      );

    return <div className="mt-0.5">{renderChangeTokens(entry.changes)}</div>;
  };

  return (
    <article className="flex gap-2.5 py-2.5 [content-visibility:auto] [contain-intrinsic-size:auto_5rem]">
      <span
        aria-hidden
        className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border", ACTION_CHIP_CLASSES[entry.action])}
      >
        <HugeiconsIcon icon={KIND_ICONS[entry.kind]} className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h4 className="min-w-0 truncate text-sm font-medium text-foreground">{t(`history.titles.${entry.kind}_${entry.action}`)}</h4>
          <span className="flex shrink-0 items-center gap-1.5">
            {entry.author ? (
              <>
                <Avatar className="size-4">
                  <AvatarImage src={resolveAvatarUrl(entry.author.image)} />
                  <AvatarFallback className="text-[8px]">{(entry.author.name ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="max-w-48 truncate text-[11px] text-muted-foreground/80">
                  {entry.author.name} (@{entry.author.username})
                </span>
                <span className="text-[11px] text-muted-foreground/40">·</span>
              </>
            ) : null}
            <time
              dateTime={entry.createdAt}
              title={formatFullDate(entry.createdAt, i18n.language)}
              className="text-[11px] tabular-nums text-muted-foreground/80"
            >
              {new Date(entry.createdAt).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}
            </time>
          </span>
        </div>
        {renderEntryChanges()}
      </div>
    </article>
  );
});

export function StationHistoryDialogPanel({
  stationId,
  stationCode,
  operatorName,
  operatorMnc,
  onClose,
  className,
  contentClassName,
  contentRef,
  bodyRef,
  bodyContentRef,
  style,
  headerDragProps,
}: StationHistoryDialogPanelProps) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const titleId = useId();
  const headerDragClassName = headerDragProps?.className;
  const operatorColor = operatorMnc ? getOperatorColor(operatorMnc) : "#3b82f6";
  const { data: session } = authClient.useSession();
  const userRole = session?.user?.role as string | undefined;
  const isAuditLogUser = userRole === "admin";
  const isAdmin = userRole === "admin" || userRole === "editor";

  const { data, error, isPending, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } = useInfiniteQuery({
    queryKey: ["station-history", stationId],
    queryFn: ({ pageParam }) => fetchStationHistory(stationId, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 0,
  });

  const entries = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  useImperativeHandle(bodyRef, () => scrollContainerRef.current!);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = loadMoreRef.current;
    if (node === null || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (observed) => {
        if (observed.some((item) => item.isIntersecting)) void fetchNextPage();
      },
      { root: scrollContainerRef.current, rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const groups = useMemo<HistoryDayGroup[]>(() => {
    const result: HistoryDayGroup[] = [];
    for (const entry of entries) {
      const date = new Date(entry.createdAt);
      const key = date.toDateString();
      const previous = result[result.length - 1];
      if (previous && previous.key === key) previous.entries.push(entry);
      else
        result.push({
          key,
          label: date.toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" }),
          entries: [entry],
        });
    }
    return result;
  }, [entries, i18n.language]);

  return (
    <div className={cn("relative", className)} style={style} role="dialog" aria-labelledby={titleId}>
      <div
        ref={contentRef}
        className={cn(
          "relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl bg-background shadow-2xl",
          contentClassName,
        )}
      >
        <div {...headerDragProps} className={cn("shrink-0 border-b bg-background/95 backdrop-blur-sm", headerDragClassName)}>
          <div
            className="flex items-start gap-3 px-4 py-3 sm:px-6 sm:py-3.5"
            style={{ backgroundImage: `linear-gradient(115deg, ${operatorColor}24 0%, ${operatorColor}0f 34%, transparent 70%)` }}
          >
            <div id={titleId} className="min-w-0 flex-1">
              <h2 className="min-w-0 truncate text-base font-semibold leading-5 tracking-tight text-foreground">{t("history.title")}</h2>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <DialogOperatorName name={operatorName} mnc={operatorMnc} compact />
                <span className="shrink-0 font-mono text-xs font-medium text-muted-foreground">{stationCode}</span>
              </div>
            </div>
            <div className="-mt-1 -mr-2 flex shrink-0 items-center gap-1">
              {isAdmin && (
                <Link
                  to={isAuditLogUser ? "/admin/audit-logs" : "/admin/submissions"}
                  search={isAuditLogUser ? { q: String(stationId) } : { q: stationCode, page: 0 }}
                  target="_blank"
                  rel="noopener noreferrer"
                  onPointerDown={(event) => event.stopPropagation()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="hidden sm:inline">{isAuditLogUser ? t("history.openAuditLog") : t("history.openSubmissions")}</span>
                  <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-4" />
                </Link>
              )}
              <button
                type="button"
                onClick={onClose}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={t("common:actions.close")}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
              </button>
            </div>
          </div>
        </div>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar scrollbar-gutter-stable">
          <div ref={bodyContentRef} className="px-3 py-2 sm:px-4 sm:py-2.5">
            {isPending ? (
              <div className="divide-y divide-border/60" aria-hidden="true">
                {Array.from({ length: 3 }, (_, index) => (
                  <div key={index} className="flex gap-2.5 py-2.5 first:pt-1">
                    <Skeleton className="size-7 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2 pt-1">
                      <Skeleton className="h-3.5 w-44" />
                      <Skeleton className="h-3 w-full max-w-64" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error && entries.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-destructive/25 bg-destructive/5 px-6 py-10 text-center">
                <p className="text-sm font-semibold text-foreground">{t("history.error")}</p>
                <Button variant="outline" size="sm" className="mt-4" disabled={isFetching} onClick={() => void refetch()}>
                  {isFetching ? t("common:actions.loading") : t("common:actions.retry")}
                </Button>
              </div>
            ) : entries.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
                <HugeiconsIcon icon={Clock01Icon} className="size-7 text-muted-foreground" />
                <h3 className="mt-3 text-sm font-semibold text-foreground">{t("history.empty")}</h3>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{t("history.emptyHint")}</p>
              </div>
            ) : (
              <>
                {groups.map((group) => (
                  <section key={group.key} aria-label={group.label}>
                    <h3 className="sticky top-0 z-10 -mx-3 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground sm:-mx-4 sm:px-4">
                      {group.label}
                    </h3>
                    <div className="divide-y divide-border/60">
                      {group.entries.map((entry) => (
                        <HistoryEntryItem key={entry.id} entry={entry} operatorName={operatorName} />
                      ))}
                    </div>
                  </section>
                ))}
                {hasNextPage && (
                  <div ref={loadMoreRef} className="space-y-2 py-2">
                    {error !== null && <p className="text-center text-xs text-destructive">{t("history.error")}</p>}
                    <Button variant="outline" size="sm" className="w-full" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                      {isFetchingNextPage ? t("common:actions.loading") : error !== null ? t("common:actions.retry") : t("history.loadMore")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
