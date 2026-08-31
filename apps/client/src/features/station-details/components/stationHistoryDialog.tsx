import {
  AirportTowerIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  Clock01Icon,
  CompassIcon,
  EarthIcon,
  FullSignalIcon,
  Image01Icon,
  Location01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { memo, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getRatDetailFieldLabel } from "@/features/shared/ratCellFields";
import { authClient } from "@/lib/authClient";
import { formatFullDate, resolveAvatarUrl } from "@/lib/format";
import { getOperatorColor } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";

import { fetchStationHistory } from "../api";
import type { StationHistoryChange, StationHistoryChangeValue, StationHistoryEntry, StationHistoryPhotoReference, StationHistoryValue } from "../api";
import type { FloatingDialogPanelFrameProps, StationHistoryDialogPayload } from "./floatingDialogStackTypes";
import { StationTitle } from "./stationTitle";

type StationHistoryDialogPanelProps = FloatingDialogPanelFrameProps & StationHistoryDialogPayload;

const KIND_ICONS: Record<StationHistoryEntry["kind"], IconSvgElement> = {
  station: AirportTowerIcon,
  location: Location01Icon,
  cells: FullSignalIcon,
  sectors: CompassIcon,
  network_ids: EarthIcon,
  photos: Image01Icon,
};

const ACTION_CHIP_CLASSES: Record<StationHistoryEntry["action"], string> = {
  create: "text-emerald-700 dark:text-emerald-300",
  update: "text-blue-700 dark:text-blue-300",
  delete: "text-rose-700 dark:text-rose-300",
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
type CellChangeGroup = { label: string; rat: string; changes: StationHistoryChange[] };
type RatCellChangeGroup = { rat: string; cells: CellChangeGroup[] };
type HistoryPhotoReferenceProps = {
  value: StationHistoryChangeValue;
  isMain: boolean;
  photoReferences: ReadonlyMap<number, StationHistoryPhotoReference>;
};
type HistoryEntryItemProps = {
  entry: StationHistoryEntry;
};
type PhotoChangePresentation = {
  changes: StationHistoryChange[];
  mainFromId: number | null;
  mainToId: number | null;
};

function isValueRecord(value: StationHistoryChangeValue): value is Record<string, StationHistoryValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePhotoReferenceId(value: StationHistoryChangeValue): number | null {
  if (typeof value !== "string" || !value.startsWith("#")) return null;
  const photoId = Number(value.slice(1));
  return Number.isInteger(photoId) && photoId > 0 ? photoId : null;
}

function preparePhotoChanges(changes: StationHistoryChange[]): PhotoChangePresentation {
  const mainPhotoChange = changes.find((change) => change.field === "main_photo");
  if (mainPhotoChange === undefined) return { changes, mainFromId: null, mainToId: null };

  const mainFromId = parsePhotoReferenceId(mainPhotoChange.from);
  const mainToId = parsePhotoReferenceId(mainPhotoChange.to);
  let fromCovered = mainFromId === null;
  let toCovered = mainToId === null;
  for (const change of changes) {
    if (change.field !== "photo") continue;
    if (!fromCovered && parsePhotoReferenceId(change.from) === mainFromId) fromCovered = true;
    if (!toCovered && parsePhotoReferenceId(change.to) === mainToId) toCovered = true;
    if (fromCovered && toCovered) break;
  }

  const presentedChanges: StationHistoryChange[] = [];
  for (const change of changes) {
    if (change !== mainPhotoChange) {
      presentedChanges.push(change);
      continue;
    }
    if (fromCovered && toCovered) continue;
    presentedChanges.push({ ...change, from: fromCovered ? null : change.from, to: toCovered ? null : change.to });
  }

  return {
    changes: presentedChanges,
    mainFromId,
    mainToId,
  };
}

function HistoryPhotoReference({ value, isMain, photoReferences }: HistoryPhotoReferenceProps) {
  const { t } = useTranslation("stationDetails");
  const [previewFailed, setPreviewFailed] = useState(false);
  const photoId = parsePhotoReferenceId(value);
  if (photoId === null) return null;

  const label = t(isMain ? "history.values.mainPhotoReference" : "history.values.photoReference", { id: photoId });
  const photo = photoReferences.get(photoId);
  if (photo === undefined) return <span title={t("history.values.photoUnavailable", { id: photoId })}>{label}</span>;

  const href = `/uploads/${encodeURIComponent(photo.attachment_uuid)}.webp`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-1"
            aria-label={t("history.values.openPhoto", { id: photoId })}
          />
        }
      >
        {label}
        <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3 shrink-0" aria-hidden />
      </TooltipTrigger>
      <TooltipContent className="max-w-none p-1">
        {previewFailed ? (
          <span className="block px-2 py-1">{t("history.values.photoPreviewFailed", { id: photoId })}</span>
        ) : (
          <img
            src={href}
            alt={t("history.values.photoPreviewAlt", { id: photoId })}
            width={160}
            height={112}
            loading="lazy"
            decoding="async"
            className="h-28 w-40 rounded-sm object-cover"
            onError={() => setPreviewFailed(true)}
          />
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function groupChangesByLabel(changes: StationHistoryChange[]): CellChangeGroup[] {
  const groups: CellChangeGroup[] = [];
  for (const change of changes) {
    const label = change.label ?? "";
    const rat = change.rat ?? "";
    const previous = groups[groups.length - 1];
    if (previous && previous.label === label && previous.rat === rat) previous.changes.push(change);
    else groups.push({ label, rat, changes: [change] });
  }
  return groups;
}

function groupCellChanges(entry: StationHistoryEntry): RatCellChangeGroup[] {
  const cells =
    entry.action === "update"
      ? groupChangesByLabel(entry.changes)
      : entry.changes.map((change) => ({ label: change.label ?? "", rat: change.rat ?? "", changes: [change] }));
  const groups = new Map<string, CellChangeGroup[]>();
  for (const cell of cells) {
    const existing = groups.get(cell.rat);
    if (existing) existing.push(cell);
    else groups.set(cell.rat, [cell]);
  }
  return [...groups].map(([rat, groupedCells]) => ({ rat, cells: groupedCells }));
}

const HistoryEntryItem = memo(function HistoryEntryItem({ entry }: HistoryEntryItemProps) {
  const { t, i18n } = useTranslation(["stationDetails", "stations", "common"]);
  const photoReferences = useMemo(() => new Map((entry.photoReferences ?? []).map((photo) => [photo.id, photo])), [entry.photoReferences]);
  const cellChangeGroups = useMemo(() => (entry.kind === "cells" ? groupCellChanges(entry) : []), [entry]);
  const [cellsExpanded, setCellsExpanded] = useState(() => {
    if (entry.kind !== "cells") return true;
    return cellChangeGroups.reduce((total, group) => total + group.cells.length, 0) <= 4;
  });

  const fieldLabel = (field: string, rat?: string): string => {
    if (CELL_DETAIL_FIELD_KEYS.has(field)) return CELL_DETAIL_LABEL_OVERRIDES[field] ?? getRatDetailFieldLabel(rat ?? "", field);
    if (field === "rat") return "RAT";
    if (field === "mno_name") return t("history.fields.mnoName");
    if (field === "azimuth") return t("sectors.azimuth");
    if (field === "azimuths") return t("sectors.title");
    if (field === "cell") return t("history.fields.cell");
    if (field === "photo") return t("history.fields.photo");
    if (field === "main_photo") return t("history.fields.mainPhoto");
    const commonKey = COMMON_LABEL_KEYS[field];
    if (commonKey !== undefined) return t(`common:labels.${commonKey}`);
    return field;
  };

  const formatValue = (field: string, value: StationHistoryChangeValue, rat?: string): string => {
    if (value === null || value === "") return "-";
    if (typeof value === "boolean") return value ? t("history.values.yes") : t("history.values.no");
    if (field === "status" && typeof value === "string") return t(`stations:status.${value}`, { defaultValue: value });
    if (field === "type" && typeof value === "string") return value.toUpperCase();
    if ((field === "photo" || field === "main_photo") && typeof value === "string" && value.startsWith("#"))
      return t("history.values.photoReference", { id: value.slice(1) });
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

  const renderValue = (change: StationHistoryChange, value: StationHistoryChangeValue, isMain: boolean) => {
    if ((change.field === "photo" || change.field === "main_photo") && parsePhotoReferenceId(value) !== null)
      return <HistoryPhotoReference value={value} isMain={isMain} photoReferences={photoReferences} />;
    return formatValue(change.field, value, change.rat);
  };

  const renderChangeValue = (change: StationHistoryChange, fromIsMain = false, toIsMain = false) => {
    if (change.from === null)
      return (
        <span className="font-medium text-emerald-700 dark:text-emerald-300">
          <span className="sr-only">{t("history.values.current")}: </span>
          {renderValue(change, change.to, toIsMain)}
        </span>
      );
    if (change.to === null)
      return (
        <span className="font-medium text-rose-700 dark:text-rose-300">
          <span className="sr-only">{t("history.values.previous")}: </span>
          {renderValue(change, change.from, fromIsMain)}
        </span>
      );
    return (
      <>
        <span className="rounded-sm bg-red-500/10 px-1 py-px text-red-700 dark:text-red-300">
          <span className="sr-only">{t("history.values.previous")}: </span>
          {renderValue(change, change.from, fromIsMain)}
        </span>
        <span aria-hidden className="mx-1 text-muted-foreground/50">
          <HugeiconsIcon icon={ArrowRight01Icon} className="inline size-3 align-[-2px]" />
        </span>
        <span className="rounded-sm bg-emerald-500/10 px-1 py-px font-medium text-emerald-700 dark:text-emerald-300">
          <span className="sr-only">{t("history.values.current")}: </span>
          {renderValue(change, change.to, toIsMain)}
        </span>
      </>
    );
  };

  const renderChangeTokens = (changes: StationHistoryChange[], includeCellLabel = false) => {
    const presentation = preparePhotoChanges(changes);

    return (
      <div className="text-xs leading-6 text-muted-foreground wrap-break-word">
        {presentation.changes.map((change, index) => {
          const isPhotoChange = change.field === "photo" || change.field === "main_photo";
          const fromPhotoId = parsePhotoReferenceId(change.from);
          const toPhotoId = parsePhotoReferenceId(change.to);
          const fromIsMain = fromPhotoId !== null && (change.field === "main_photo" || fromPhotoId === presentation.mainFromId);
          const toIsMain = toPhotoId !== null && (change.field === "main_photo" || toPhotoId === presentation.mainToId);
          return (
            <p key={`${entry.id}-${index}`}>
              {includeCellLabel && change.label ? `${change.label} ` : ""}
              {isPhotoChange ? null : fieldLabel(change.field, change.rat)}
              {isPhotoChange ? null : change.from !== null && change.to !== null ? " " : ": "}
              {renderChangeValue(change, fromIsMain, toIsMain)}
            </p>
          );
        })}
      </div>
    );
  };

  const renderCellSnapshot = (change: StationHistoryChange) => {
    const snapshot = change.to ?? change.from;
    const tokens = isValueRecord(snapshot) ? Object.entries(snapshot).filter(([field]) => field !== "rat" && field !== "band") : [];
    if (tokens.length === 0) return null;
    return (
      <p className="text-xs leading-5 text-muted-foreground wrap-break-word">
        {tokens.map(([field, value], index) => (
          <span key={field}>
            {index > 0 ? <span className="mx-1.5 text-muted-foreground/50">·</span> : null}
            {fieldLabel(field, change.rat)}:{" "}
            <span className={cn("font-medium", change.to === null ? "text-rose-700 dark:text-rose-300" : "text-foreground")}>
              {formatValue(field, value, change.rat)}
            </span>
          </span>
        ))}
      </p>
    );
  };

  const renderEntryChanges = () => {
    if (entry.kind === "cells") {
      const cellCount = cellChangeGroups.reduce((total, group) => total + group.cells.length, 0);
      return (
        <details className="group mt-1.5" open={cellsExpanded} onToggle={(event) => setCellsExpanded(event.currentTarget.open)}>
          <summary className="flex min-h-7 cursor-pointer list-none items-center gap-2 rounded-md px-1 text-xs text-muted-foreground outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <span className="font-medium text-foreground">{t("history.cellCount", { count: cellCount })}</span>
            <span className="flex min-w-0 flex-1 flex-wrap gap-1">
              {cellChangeGroups.map((group) => (
                <span key={group.rat} className="rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">
                  {group.rat || t("history.otherCells")} {group.cells.length}
                </span>
              ))}
            </span>
            <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          {cellsExpanded ? (
            <div className="mt-1.5 overflow-hidden rounded-lg border border-border/70">
              {cellChangeGroups.map((ratGroup) => (
                <section key={ratGroup.rat} aria-label={ratGroup.rat || t("history.otherCells")}>
                  <div className="flex items-center justify-between bg-muted/50 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                    <span>{ratGroup.rat || t("history.otherCells")}</span>
                    <span className="tabular-nums">{t("history.cellCount", { count: ratGroup.cells.length })}</span>
                  </div>
                  <div className="divide-y divide-border/60">
                    {ratGroup.cells.map((cell, cellIndex) => {
                      const snapshot = entry.action === "update" ? null : cell.changes[0];
                      return (
                        <div
                          key={`${entry.id}-${ratGroup.rat}-${cell.label}-${cellIndex}`}
                          className="grid gap-0.5 px-2.5 py-1.5 sm:grid-cols-[minmax(11rem,14rem)_1fr] sm:gap-3"
                        >
                          <p className="text-xs font-semibold leading-5 text-foreground">{cell.label || fieldLabel("cell")}</p>
                          {snapshot ? renderCellSnapshot(snapshot) : renderChangeTokens(cell.changes, cell.label === "")}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </details>
      );
    }

    return <div className="mt-0.5">{renderChangeTokens(entry.changes)}</div>;
  };

  return (
    <article className="flex gap-2.5 py-2.5 [content-visibility:auto] [contain-intrinsic-size:auto_5rem]">
      <span aria-hidden className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center", ACTION_CHIP_CLASSES[entry.action])}>
        <HugeiconsIcon icon={KIND_ICONS[entry.kind]} className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <h4 className="min-w-0 text-sm font-medium leading-5 text-foreground">{t(`history.titles.${entry.kind}_${entry.action}`)}</h4>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {entry.author ? (
              <>
                <Avatar className="size-5 shrink-0">
                  <AvatarImage src={resolveAvatarUrl(entry.author.image)} />
                  <AvatarFallback className="text-[9px]">{(entry.author.name ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="max-w-48 truncate">
                  {entry.author.name} (@{entry.author.username})
                </span>
                <span className="text-muted-foreground/50">·</span>
              </>
            ) : null}
            <time dateTime={entry.createdAt} title={formatFullDate(entry.createdAt, i18n.language)} className="shrink-0 tabular-nums">
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
  modal = false,
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
  const operatorColor = getOperatorColor(operatorMnc ?? 0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { data: session } = authClient.useSession();
  const userRole = session?.user?.role as string | undefined;
  const isAuditLogUser = userRole === "admin";
  const isAdmin = userRole === "admin" || userRole === "editor";

  const {
    data,
    isError,
    isFetchNextPageError,
    isFetching,
    isFetchingNextPage,
    isPending,
    isRefetchError,
    isRefetching,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["station-history", stationId],
    queryFn: ({ pageParam, signal }) => fetchStationHistory(stationId, pageParam, signal),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30_000,
  });

  const pages = data?.pages;
  const entries = useMemo(() => pages?.flatMap((page) => page.data) ?? [], [pages]);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  useImperativeHandle(bodyRef, () => scrollContainerRef.current!);

  useEffect(() => {
    if (modal) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [modal]);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = loadMoreRef.current;
    if (node === null || !hasNextPage || isFetchingNextPage || isFetchNextPageError) return;
    const observer = new IntersectionObserver(
      (observed) => {
        if (observed.some((item) => item.isIntersecting)) void fetchNextPage();
      },
      { root: scrollContainerRef.current, rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

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
    <div className={cn("relative", className)} style={style} role={modal ? undefined : "dialog"} aria-labelledby={modal ? undefined : titleId}>
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
                <StationTitle
                  stationId={stationCode}
                  operator={{ name: operatorName, mnc: operatorMnc ?? 0 }}
                  stationIdClassName="text-xs text-muted-foreground"
                />
              </div>
            </div>
            <div className="-mt-1 -mr-2 flex shrink-0 items-center gap-1">
              {isRefetching && !isFetchingNextPage ? (
                <output className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-muted-foreground" />
                  <span className="sr-only sm:not-sr-only">{t("history.refreshing")}</span>
                </output>
              ) : null}
              {isAdmin && (
                <Link
                  to={isAuditLogUser ? "/admin/audit-logs" : "/admin/submissions"}
                  search={isAuditLogUser ? { q: String(stationId) } : { q: stationCode, page: 0 }}
                  target="_blank"
                  rel="noopener noreferrer"
                  onPointerDown={(event) => event.stopPropagation()}
                  aria-label={isAuditLogUser ? t("history.openAuditLog") : t("history.openSubmissions")}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="sr-only sm:not-sr-only">{isAuditLogUser ? t("history.openAuditLog") : t("history.openSubmissions")}</span>
                  <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-4" />
                </Link>
              )}
              <button
                ref={closeButtonRef}
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

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto custom-scrollbar scrollbar-gutter-stable"
          aria-busy={isPending || isFetchingNextPage}
        >
          <div ref={bodyContentRef} className="px-3 py-2 sm:px-4 sm:py-2.5">
            {isPending ? (
              <>
                <output className="sr-only">{t("common:actions.loading")}</output>
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
              </>
            ) : isError && entries.length === 0 ? (
              <div
                className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-destructive/25 bg-destructive/5 px-6 py-10 text-center"
                role="alert"
              >
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
                        <HistoryEntryItem key={entry.id} entry={entry} />
                      ))}
                    </div>
                  </section>
                ))}
                {isRefetchError && !isFetchNextPageError ? (
                  <div
                    className="my-2 flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2"
                    role="alert"
                  >
                    <p className="text-xs text-destructive">{t("history.refreshError")}</p>
                    <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
                      {t("common:actions.retry")}
                    </Button>
                  </div>
                ) : null}
                {hasNextPage ? (
                  <div ref={loadMoreRef} className="space-y-2 py-2">
                    {isFetchNextPageError ? (
                      <p className="text-center text-xs text-destructive" role="alert">
                        {t("history.loadMoreError")}
                      </p>
                    ) : null}
                    <Button variant="outline" size="sm" className="w-full" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                      {isFetchingNextPage ? t("common:actions.loading") : isFetchNextPageError ? t("common:actions.retry") : t("history.loadMore")}
                    </Button>
                  </div>
                ) : (
                  <p className="py-2 text-center text-xs text-muted-foreground">{t("history.end")}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
