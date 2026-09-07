import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { NsgSnapshot } from "@/lib/nsg/snapshots";
import type { NsgCell, NsgLog } from "@/lib/nsg/types";
import { cn } from "@/lib/utils";

import { formatTime } from "./display";
import { Events } from "./events";
import { MeasurementHistory } from "./measurements";
import { Signaling } from "./signaling";
import { SnapshotDetails } from "./snapshot";
import { Timeline } from "./timeline";

export type DetailView = "cells" | "history" | "events" | "signaling" | "recording";

function isDetailView(value: string): value is DetailView {
  return value === "cells" || value === "history" || value === "events" || value === "signaling" || value === "recording";
}

type DetailPanelsProps = {
  activeView: DetailView;
  compact: boolean;
  filterKey: string;
  log: NsgLog;
  cells: readonly NsgCell[];
  snapshots: readonly NsgSnapshot[];
  snapshot: NsgSnapshot | null;
  selectedIndex: number;
  selectedTimestamp: number | null;
  expanded: boolean;
  onViewChange: (view: DetailView) => void;
  onExpandedChange: (expanded: boolean) => void;
  onSelectEvent: (eventIndex: number) => void;
  onSelectTimestamp: (timestampMs: number) => void;
  onPauseReplay: () => void;
};

export function DetailPanels({
  activeView,
  compact,
  filterKey,
  log,
  cells,
  snapshots,
  snapshot,
  selectedIndex,
  selectedTimestamp,
  expanded,
  onViewChange,
  onExpandedChange,
  onSelectEvent,
  onSelectTimestamp,
  onPauseReplay,
}: DetailPanelsProps) {
  const { t } = useTranslation("nsg");
  const expansionLabel = t(expanded ? "tabs.collapse" : "tabs.expand");

  return (
    <Collapsible open={expanded} onOpenChange={onExpandedChange} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center border-b">
        <Tabs
          value={activeView}
          onValueChange={(value) => {
            if (!isDetailView(value)) return;
            onViewChange(value);
            if (!compact && !expanded) onExpandedChange(true);
          }}
          className="min-w-0 flex-1 px-3 py-1"
        >
          <TabsList variant="line" className={cn("w-full", compact && "custom-scrollbar justify-start overflow-x-auto")}>
            {compact ? <TabsTrigger value="cells">{t("mobile.cells")}</TabsTrigger> : null}
            <TabsTrigger value="history">{compact ? t("mobile.history") : t("tabs.measurements")}</TabsTrigger>
            <TabsTrigger value="events">{t("tabs.events")}</TabsTrigger>
            <TabsTrigger value="signaling">{t("tabs.signaling")}</TabsTrigger>
            <TabsTrigger value="recording">{t("tabs.metadata")}</TabsTrigger>
          </TabsList>
        </Tabs>
        {!compact ? (
          <CollapsibleTrigger
            type="button"
            className="mr-2 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={expansionLabel}
            title={expansionLabel}
          >
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className={cn("size-3.5 transition-transform motion-reduce:transition-none", expanded && "rotate-180")}
              aria-hidden="true"
            />
          </CollapsibleTrigger>
        ) : null}
      </div>
      <CollapsibleContent className="flex min-h-0 flex-1 flex-col [&[hidden]:not([hidden='until-found'])]:hidden">
        {activeView === "cells" ? (
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {snapshot ? <SnapshotDetails snapshot={snapshot} /> : <p className="px-4 py-3 text-sm text-muted-foreground">{t("snapshot.empty")}</p>}
          </div>
        ) : null}
        {activeView === "history" ? (
          <MeasurementHistory key={filterKey} snapshots={snapshots} selectedIndex={selectedIndex} onSelect={onSelectEvent} />
        ) : null}
        {activeView === "events" ? <Events events={log.events} onSelectEvent={onSelectEvent} onFilterChange={onPauseReplay} /> : null}
        {activeView === "signaling" ? (
          <Signaling
            key={`${log.sourceName}:${log.sourceBytes}:${log.startTimestampUs}`}
            records={log.signaling}
            totalCount={log.signalingRecordCount}
            truncated={log.signalingTruncated}
            onSelectTimestamp={onSelectTimestamp}
            onFilterChange={onPauseReplay}
          />
        ) : null}
        {activeView === "recording" ? (
          <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 text-xs">
            <p className="font-mono">
              {formatTime(log.startTimestampMs, true)}
              <br />
              {formatTime(log.endTimestampMs, true)}
            </p>
            <p className="leading-relaxed text-muted-foreground">{t("metadata.records", { count: log.events.length, records: log.recordCount })}</p>
            <details className="border-t pt-3">
              <summary className="cursor-pointer font-medium">{t("chart.title")}</summary>
              <div className="mt-2">
                <Timeline cells={cells} selectedTimestamp={selectedTimestamp} onSelectEvent={onSelectEvent} />
              </div>
            </details>
            <details className="border-t pt-3">
              <summary className="cursor-pointer font-medium">{t("metadata.header")}</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/30 p-2 text-[10px]">{log.headerXml}</pre>
            </details>
            <details className="border-t pt-3">
              <summary className="cursor-pointer font-medium">{t("metadata.eventTypes")}</summary>
              <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-1">
                {Object.entries(log.eventTypeCounts).map(([name, count]) => (
                  <div key={name} className="contents">
                    <dt className="truncate font-mono">{name}</dt>
                    <dd className="tabular-nums">{count.toLocaleString()}</dd>
                  </div>
                ))}
              </dl>
            </details>
            {log.timeRegressions > 0 ? (
              <p className="text-muted-foreground">{t("metadata.timeRegressions", { count: log.timeRegressions })}</p>
            ) : null}
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
