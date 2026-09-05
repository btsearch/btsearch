import { Cancel01Icon, Download04Icon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/useMobile";
import { usePreferences } from "@/hooks/usePreferences";
import { getClosestNsgRouteLocation, getNsgLocationTimeMs, prepareNsgRouteLocations } from "@/lib/nsg/locations";
import { createNsgOperatorResolver, getNsgCellOperator } from "@/lib/nsg/operator";
import { getNsgReplayLocationIndex } from "@/lib/nsg/replay";
import { associateNsgSignals } from "@/lib/nsg/signal";
import { createNsgSnapshotCollection, findNearestNsgSnapshotIndex, getPrimaryNsgCell } from "@/lib/nsg/snapshots";
import type { NsgCell, NsgLocation, NsgLog, NsgProgress } from "@/lib/nsg/types";
import { cn } from "@/lib/utils";

import { formatBytes, formatDuration, formatTime, formatValue } from "./display";
import { NsgFilter } from "./nsgControls";
import { NsgDetailPanels, type NsgDetailView } from "./nsgDetailPanels";
import { NsgMobileSummary } from "./nsgMobileSummary";
import { NsgOperatorName } from "./nsgOperatorName";
import { NsgReplayControls } from "./nsgReplayControls";
import { NsgSnapshotDetails } from "./nsgSnapshot";
import { useNsgReplay } from "./useNsgReplay";

const NsgRouteMap = lazy(() => import("./nsgRouteMap"));
const EMPTY_LOCATIONS: NsgLog["locations"] = [];

type NsgExplorerProps = {
  log: NsgLog | null;
  progress: NsgProgress | null;
  error: string | null;
  onSelectFile: (file: File) => void;
  onCancel: () => void;
  onClear: () => void;
  isParsing: boolean;
};

function simKey(cell: NsgCell): string {
  return String(cell.slotId ?? "?") + ":" + String(cell.subId ?? "?");
}

function latestRegisteredCell(cells: NsgCell[], elapsedUs: number, eventIndex: number): NsgCell | undefined {
  let low = 0;
  let high = cells.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const cell = cells[middle];
    if (cell.elapsedUs < elapsedUs || (cell.elapsedUs === elapsedUs && cell.eventIndex <= eventIndex)) low = middle + 1;
    else high = middle;
  }
  return cells[low - 1];
}

export default function NsgExplorer({ log, progress, error, onSelectFile, onCancel, onClear, isParsing }: NsgExplorerProps) {
  const { t } = useTranslation(["nsg", "common"]);
  const { preferences } = usePreferences();
  const isMobile = useIsMobile();
  const [isCompact, setIsCompact] = useState(isMobile);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const detailsButtonRef = useRef<HTMLButtonElement>(null);
  const [sim, setSim] = useState("all");
  const [rat, setRat] = useState("all");
  const [view, setView] = useState<NsgDetailView>("history");
  const [isExporting, setIsExporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [loadedLog, setLoadedLog] = useState(log);
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (detailsOpen && !isCompact) setDetailsOpen(false);

  if (loadedLog !== log) {
    setLoadedLog(log);
    setSim("all");
    setRat("all");
    setView("history");
    setDetailsOpen(false);
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setIsCompact(entry.contentRect.width < 1000);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const operatorResolver = useMemo(() => createNsgOperatorResolver(log?.events ?? []), [log]);
  const { simCells, registeredBySim } = useMemo(() => {
    const sims = new Map<string, NsgCell>();
    const registered = new Map<string, NsgCell[]>();
    for (const cell of log?.cells ?? []) {
      const key = simKey(cell);
      const previous = sims.get(key);
      if (!previous || (previous.registered !== true && cell.registered === true)) sims.set(key, cell);
      if (cell.registered === true) {
        const group = registered.get(key);
        if (group) group.push(cell);
        else registered.set(key, [cell]);
      }
    }
    for (const group of registered.values())
      group.sort((a, b) => a.elapsedUs - b.elapsedUs || a.eventIndex - b.eventIndex || a.cellIndex - b.cellIndex);
    return { simCells: sims, registeredBySim: registered };
  }, [log]);
  const ratOptions = useMemo(
    () => [
      { value: "all", label: t("filters.allTechnologies") },
      ...[...new Set(log?.cells.map((cell) => cell.rat) ?? [])].sort().map((value) => ({ value, label: value })),
    ],
    [log, t],
  );
  const cells = useMemo(
    () => (log?.cells ?? []).filter((cell) => (sim === "all" || simKey(cell) === sim) && (rat === "all" || cell.rat === rat)),
    [log, sim, rat],
  );
  const snapshotCollection = useMemo(() => createNsgSnapshotCollection(cells), [cells]);
  const { snapshots } = snapshotCollection;
  const {
    clock: replayClock,
    selectedEventIndex,
    selectedIndex,
    snapshot,
    selectedTimestamp,
    playheadMs,
    isPlaying,
    selectEvent,
    clearSelection,
    pause: pauseReplay,
    toggle: toggleReplay,
    stop: resetReplay,
  } = useNsgReplay({ log, snapshotCollection, isParsing });
  const primary = snapshot ? getPrimaryNsgCell(snapshot.cells) : undefined;
  const operatorMoment = log?.events[selectedEventIndex ?? snapshot?.eventIndex ?? 0];
  const simOptions = [
    { value: "all", label: t("filters.allSims"), operator: null },
    ...[...simCells].map(([value, cell]) => {
      const elapsedUs =
        playheadMs !== null && log ? Math.round((playheadMs - log.startTimestampMs) * 1000) : (operatorMoment?.elapsedUs ?? cell.elapsedUs);
      const eventIndex = playheadMs !== null && log ? log.events.length : (operatorMoment?.id ?? cell.eventIndex);
      const measured =
        primary?.registered === true && simKey(primary) === value && (playheadMs !== null || primary.eventIndex === eventIndex)
          ? primary
          : latestRegisteredCell(registeredBySim.get(value) ?? [], elapsedUs, eventIndex);
      const operator = measured
        ? getNsgCellOperator(measured)
        : operatorResolver.get({ slotId: cell.slotId, subId: cell.subId, rat: cell.rat, elapsedUs, eventIndex });
      return {
        value,
        operator,
        label: t("labels.slot") + " " + formatValue(cell.slotId) + " / " + formatValue(cell.subId),
        content: (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <NsgOperatorName operator={operator} labelClassName="text-sm leading-5" />
            <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
              {formatValue(cell.slotId)} / {formatValue(cell.subId)}
            </span>
          </span>
        ),
      };
    }),
  ];
  const recordedLocations = log?.locations ?? EMPTY_LOCATIONS;
  const locations = useMemo(() => prepareNsgRouteLocations(recordedLocations), [recordedLocations]);
  const selectedLocation = useMemo(() => {
    if (playheadMs !== null) return locations[getNsgReplayLocationIndex(locations, playheadMs)] ?? null;
    return selectedTimestamp === null ? (locations[0] ?? null) : getClosestNsgRouteLocation(locations, selectedTimestamp);
  }, [locations, selectedTimestamp, playheadMs]);
  const signalSimKey = sim === "all" ? String(primary ? simKey(primary) : "?:?") : sim;
  const selectedOperator = simOptions.find((option) => option.value === signalSimKey)?.operator ?? null;
  const signalTrail = useMemo(() => {
    const [slot, subscription] = signalSimKey.split(":");
    const signalSim =
      slot === "?" && subscription === "?"
        ? null
        : {
            slotId: slot === "?" ? null : Number(slot),
            subId: subscription === "?" ? null : Number(subscription),
          };
    return associateNsgSignals(locations, cells, signalSim);
  }, [locations, cells, signalSimKey]);
  const signalSnapshots = useMemo(
    () => snapshots.filter((item) => item.cells.some((cell) => simKey(cell) === signalSimKey)),
    [snapshots, signalSimKey],
  );
  const selectMapLocation = useCallback(
    (location: NsgLocation) => {
      const timestamp = getNsgLocationTimeMs(location);
      if (timestamp === null) return;
      const candidates = signalSnapshots.length > 0 ? signalSnapshots : snapshots;
      const nearest = candidates[findNearestNsgSnapshotIndex(candidates, timestamp)];
      selectEvent(nearest?.eventIndex ?? location.eventIndex);
    },
    [signalSnapshots, snapshots, selectEvent],
  );

  function updateFilter(setter: (value: string) => void, value: string) {
    clearSelection();
    setter(value);
  }

  async function exportCsv() {
    if (!log) return;
    setIsExporting(true);
    try {
      const { createNsgCellsCsv } = await import("@/lib/nsg/csv");
      const url = URL.createObjectURL(new Blob([createNsgCellsCsv(log, cells)], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = log.sourceName.replace(/\.(?:log(?:\.gz)?|gz)$/i, "") + "-cells.csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error(t("export.failed"));
    } finally {
      setIsExporting(false);
    }
  }

  const activeView = !isCompact && view === "cells" ? "history" : view;
  const filters = (
    <div className={cn("grid shrink-0 grid-cols-2 gap-2 border-b px-4", isCompact ? "py-1.5" : "py-2")}>
      <NsgFilter label={t("filters.sim")} value={sim} options={simOptions} onChange={(value) => updateFilter(setSim, value)} />
      <NsgFilter label={t("filters.technology")} value={rat} options={ratOptions} onChange={(value) => updateFilter(setRat, value)} />
    </div>
  );
  const replayControls = (
    <NsgReplayControls
      compact={isCompact}
      parsing={isParsing}
      playing={isPlaying}
      playheadMs={playheadMs}
      snapshots={snapshots}
      selectedIndex={selectedIndex}
      snapshot={snapshot}
      detailsButtonRef={detailsButtonRef}
      onToggle={toggleReplay}
      onSelectEvent={selectEvent}
      onOpenDetails={() => {
        pauseReplay();
        setDetailsOpen(true);
      }}
    />
  );
  const detailPanels = log ? (
    <NsgDetailPanels
      activeView={activeView}
      compact={isCompact}
      filterKey={sim + ":" + rat}
      log={log}
      cells={cells}
      snapshots={snapshots}
      snapshot={snapshot}
      selectedIndex={selectedIndex}
      selectedTimestamp={selectedTimestamp}
      onViewChange={setView}
      onSelectEvent={selectEvent}
      onPauseReplay={pauseReplay}
    />
  ) : null;

  return (
    <div ref={containerRef} className="@container h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        className={cn(
          "grid h-full min-h-0",
          isCompact
            ? "grid-rows-[auto_minmax(0,1fr)_auto]"
            : "grid-rows-[minmax(12rem,36%)_minmax(0,1fr)] @min-[1000px]:grid-cols-[30rem_minmax(0,1fr)] @min-[1000px]:grid-rows-1",
        )}
      >
        <aside
          className={cn(
            "flex min-h-0 min-w-0 flex-col bg-background",
            isCompact ? "order-1" : "order-2 border-t @min-[1000px]:order-1 @min-[1000px]:border-t-0 @min-[1000px]:border-r",
            dragging && "ring-2 ring-inset ring-primary",
          )}
          aria-label={t("page.title")}
          onDragOver={(event) => {
            event.preventDefault();
            if (!isParsing) setDragging(true);
          }}
          onDragLeave={(event) => {
            if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file && !isParsing) {
              resetReplay();
              onSelectFile(file);
            }
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".log,.gz,application/gzip,application/x-gzip"
            className="hidden"
            aria-label={t("import.select")}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                resetReplay();
                onSelectFile(file);
              }
              event.target.value = "";
            }}
          />
          {log !== null ? (
            <header className={cn("flex shrink-0 items-center gap-2 border-b bg-muted/30 px-4", isCompact ? "py-0" : "py-2.5")}>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-sm font-semibold" title={log?.sourceName}>
                  {log?.sourceName ?? t("page.title")}
                </h1>
                {log && !isCompact ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatBytes(log.sourceBytes)} · {formatDuration(log.durationSeconds * 1000)} · {t("history.cells", { count: log.cells.length })}
                  </p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className={isCompact ? "size-11" : undefined}
                aria-label={t("import.select")}
                title={t("import.select")}
                disabled={isParsing}
                onClick={() => {
                  pauseReplay();
                  inputRef.current?.click();
                }}
              >
                <HugeiconsIcon icon={Upload04Icon} />
              </Button>
              {log ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={isCompact ? "size-11" : undefined}
                  aria-label={t("export.csv")}
                  title={t("export.csv")}
                  disabled={isExporting || cells.length === 0}
                  onClick={() => void exportCsv()}
                >
                  {isExporting ? <Spinner /> : <HugeiconsIcon icon={Download04Icon} />}
                </Button>
              ) : null}
              {log && !isParsing ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={isCompact ? "size-11" : undefined}
                  aria-label={t("import.clear")}
                  title={t("import.clear")}
                  onClick={() => {
                    resetReplay();
                    onClear();
                  }}
                >
                  <HugeiconsIcon icon={Cancel01Icon} />
                </Button>
              ) : null}
            </header>
          ) : null}

          {isParsing ? (
            <div className="shrink-0 space-y-2 border-b px-4 py-3" role="status">
              <div className="flex items-center gap-2 text-xs">
                <Spinner className="size-3.5" />
                <span className="flex-1">{t("import.parsing")}</span>
                <Button variant="ghost" size="xs" className={isCompact ? "h-11" : undefined} onClick={onCancel}>
                  {t("common:actions.cancel")}
                </Button>
              </div>
              <progress
                value={progress?.bytesRead ?? 0}
                max={Math.max(1, progress?.totalBytes ?? 0)}
                aria-label={t("import.progress")}
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted accent-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
              />
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {formatBytes(progress?.bytesRead ?? 0)} / {formatBytes(progress?.totalBytes ?? 0)} · {(progress?.percent ?? 0).toFixed(1)}%
              </p>
            </div>
          ) : null}
          {error ? (
            <div className="shrink-0 space-y-1 border-b bg-destructive/5 px-4 py-3" role="alert">
              <p className="text-xs font-medium text-destructive">{t("import.failed")}</p>
              <p className="text-xs text-muted-foreground">{t("import.retry")}</p>
            </div>
          ) : null}

          {!log ? (
            <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
              <div className="space-y-2">
                <h2 className="text-sm font-semibold">{t("import.drop")}</h2>
                <p className="text-xs leading-relaxed text-muted-foreground">{t("import.hint")}</p>
                <Button className={isCompact ? "h-11" : undefined} disabled={isParsing} onClick={() => inputRef.current?.click()}>
                  <HugeiconsIcon icon={Upload04Icon} data-icon="inline-start" />
                  {t("import.select")}
                </Button>
              </div>
            </div>
          ) : isCompact ? (
            <NsgMobileSummary snapshot={snapshot} />
          ) : (
            <>
              {filters}
              <section className="shrink-0 border-b" aria-label={t("snapshot.title")}>
                {replayControls}
                {snapshot ? (
                  <div className="custom-scrollbar max-h-60 overflow-y-auto overscroll-contain @min-[1000px]:h-[min(52dvh,32rem)] @min-[1000px]:max-h-none @min-[1000px]:overflow-hidden">
                    <NsgSnapshotDetails snapshot={snapshot} />
                  </div>
                ) : (
                  <p className="px-4 py-2 text-xs text-muted-foreground">{t("snapshot.empty")}</p>
                )}
              </section>
              {detailPanels}
            </>
          )}
        </aside>
        <section
          key="nsg-map"
          className={cn("relative min-h-0 min-w-0 overflow-hidden", isCompact ? "order-2" : "order-1 @min-[1000px]:order-2")}
          aria-label={t("map.title")}
        >
          <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
            <NsgRouteMap
              compact={isCompact}
              points={locations}
              selected={selectedLocation}
              signalTrail={signalTrail}
              selectedOperator={selectedOperator}
              playheadMs={playheadMs}
              replayClock={replayClock}
              replayCells={snapshot?.cells ?? []}
              onSelectLocation={selectMapLocation}
              hasLog={log !== null}
            />
          </Suspense>
        </section>
        {isCompact && log ? (
          <footer
            className={cn(
              "order-3 border-t bg-background",
              preferences.navMode === "floating" ? "pb-[calc(2rem+var(--floating-nav-bottom-padding,0.5rem))]" : "pb-[env(safe-area-inset-bottom)]",
            )}
          >
            {replayControls}
          </footer>
        ) : null}
      </div>
      {isCompact && log ? (
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[85dvh] gap-0 overflow-hidden rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)] data-[side=bottom]:h-[85dvh] **:data-[slot=tabs-list]:min-h-11 **:data-[slot=tabs-trigger]:min-h-11"
            showCloseButton={false}
            finalFocus={detailsButtonRef}
          >
            <SheetHeader className="shrink-0 border-b bg-muted/30 px-4 py-1">
              <div className="flex items-center gap-2">
                <SheetTitle className="min-w-0 flex-1 text-sm">{t("mobile.details")}</SheetTitle>
                <span className="font-mono text-xs tabular-nums">{formatTime(playheadMs ?? snapshot?.timestampMs)}</span>
                <SheetClose render={<Button variant="ghost" size="icon" className="size-11" aria-label={t("mobile.close")} />}>
                  <HugeiconsIcon icon={Cancel01Icon} />
                </SheetClose>
              </div>
            </SheetHeader>
            {filters}
            {detailPanels}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
