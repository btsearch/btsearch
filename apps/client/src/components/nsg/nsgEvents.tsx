import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { NsgEvent, NsgJsonValue } from "@/lib/nsg/types";
import { cn } from "@/lib/utils";

import { formatTime, formatValue } from "./display";
import { NsgFilter } from "./nsgControls";

const SKIP_SUMMARY_KEYS = new Set(["event", "name", "type", "timestamp", "time", "subId", "slotId", "default"]);
type EventViewState = { source: readonly NsgEvent[]; type: string; selectedId: number | null };

function previewValue(value: NsgJsonValue): string {
  if (Array.isArray(value)) return "[" + value.length + "]";
  if (typeof value === "object" && value !== null) return "{" + Object.keys(value).slice(0, 3).join(", ") + "}";
  return formatValue(value).slice(0, 80);
}

function eventSummary(event: NsgEvent): string {
  return Object.entries(event.data)
    .filter(([key]) => !SKIP_SUMMARY_KEYS.has(key))
    .slice(0, 3)
    .map(([key, value]) => key + ": " + previewValue(value))
    .join(" · ");
}

export const NsgEvents = memo(function NsgEvents({
  events,
  onSelectEvent,
  onFilterChange,
}: {
  events: readonly NsgEvent[];
  onSelectEvent: (index: number) => void;
  onFilterChange: () => void;
}) {
  const { t } = useTranslation("nsg");
  const [viewState, setViewState] = useState<EventViewState>({ source: events, type: "all", selectedId: null });
  const scrollRef = useRef<HTMLDivElement>(null);
  if (viewState.source !== events) setViewState({ source: events, type: "all", selectedId: null });

  const { type, selectedId } = viewState;
  const options = useMemo(
    () => [
      { value: "all", label: t("events.allTypes") },
      ...[...new Set(events.map((event) => event.name))].sort().map((name) => ({ value: name, label: name })),
    ],
    [events, t],
  );
  const filtered = useMemo(() => (type === "all" ? events : events.filter((event) => event.name === type)), [events, type]);
  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual requires the compiler's automatic bailout
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 72,
    getItemKey: (index) => filtered[index].id,
    overscan: 5,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b px-4 py-2">
        <NsgFilter
          label={t("events.type")}
          value={type}
          options={options}
          onChange={(value) => {
            onFilterChange();
            setViewState((current) => ({ ...current, type: value, selectedId: null }));
            scrollRef.current?.scrollTo({ top: 0 });
          }}
        />
      </div>
      <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label={t("events.title")}>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">{t("events.empty")}</p>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const event = filtered[item.index];
              const isSelected = selectedId === event.id;
              return (
                <div
                  key={event.id}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full border-b"
                  style={{ transform: "translateY(" + item.start + "px)" }}
                >
                  <button
                    type="button"
                    aria-expanded={isSelected}
                    onClick={() => {
                      setViewState((current) => ({ ...current, selectedId: isSelected ? null : event.id }));
                      onSelectEvent(event.id);
                    }}
                    title={formatTime(event.timestampMs, true)}
                    className={cn(
                      "w-full px-4 py-2.5 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      isSelected && "bg-primary/5",
                    )}
                  >
                    <span className="flex gap-2 text-xs">
                      <span className="font-mono font-semibold tabular-nums">{formatTime(event.timestampMs)}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{event.name}</span>
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-muted-foreground">{eventSummary(event) || "-"}</span>
                  </button>
                  {isSelected ? (
                    <div className="space-y-2 border-t px-4 py-2">
                      <p className="text-[10px] text-muted-foreground">
                        {formatTime(event.timestampMs, true)} · {t("events.offset", { value: event.recordOffset })}
                      </p>
                      <pre className="max-h-64 overflow-auto rounded-md bg-muted/30 p-2 text-[10px] leading-relaxed">
                        {JSON.stringify(event.data, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
