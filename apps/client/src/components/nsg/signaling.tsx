import { ArrowDown02Icon, ArrowUp02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, memo, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { GenerationTag } from "@/features/shared/RatGenerationLabel";
import { bytesToHex } from "@/lib/nsg/qualcommSignaling";
import type { NsgJsonValue, NsgSignalingRecord } from "@/lib/nsg/types";
import { cn } from "@/lib/utils";

import { Filter } from "./controls";
import { formatTime, formatTimeWithMilliseconds, formatValue } from "./display";

type SignalingFilter = Readonly<{ rat: string; layer: string }>;
type TreeEntry = readonly [string, NsgJsonValue];

function channelLabel(record: NsgSignalingRecord): string {
  return record.rat === "NR" ? "NR-ARFCN" : "EARFCN";
}

function pduValue(record: NsgSignalingRecord): string | number | null {
  return record.pduType ?? record.pduId;
}

function treeLeaf(value: NsgJsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? "null";
}

function treeEntries(value: NsgJsonValue): TreeEntry[] | null {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item]);
  if (typeof value === "object" && value !== null) return Object.entries(value);
  return null;
}

function TreeNode({ label, value, depth }: { label: string; value: NsgJsonValue; depth: number }) {
  const entries = treeEntries(value);
  const [open, setOpen] = useState(depth === 0);

  if (entries === null)
    return (
      <div className="grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] gap-2 py-0.5 pl-3">
        <span className="truncate text-muted-foreground" title={label}>
          {label}
        </span>
        <span className="break-all font-mono text-foreground">{treeLeaf(value)}</span>
      </div>
    );

  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="border-l border-border/70 pl-2">
      <summary className="cursor-pointer py-0.5 text-muted-foreground marker:text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        <span className="ml-1.5 font-mono text-[9px]">{Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}</span>
      </summary>
      {open ? (
        <div className="ml-1">
          {entries.map(([key, item]) => (
            <TreeNode key={key} label={key} value={item} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </details>
  );
}

function FieldTree({ value }: { value: NsgJsonValue }) {
  const entries = treeEntries(value);
  let content: ReactNode;
  if (entries === null) content = <span className="break-all">{treeLeaf(value)}</span>;
  else if (entries.length === 0) content = <span>-</span>;
  else content = entries.map(([key, item]) => <TreeNode key={key} label={key} value={item} depth={0} />);

  return <div className="custom-scrollbar max-h-72 overflow-auto rounded-md bg-muted/30 p-2 font-mono text-[10px] leading-relaxed">{content}</div>;
}

function Direction({ direction, label }: { direction: NsgSignalingRecord["direction"]; label: string }) {
  let icon: IconSvgElement | null = null;
  if (direction === "UL") icon = ArrowUp02Icon;
  else if (direction === "DL") icon = ArrowDown02Icon;

  return (
    <span
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm border font-mono text-[10px] text-muted-foreground"
      aria-label={label}
      title={label}
    >
      {icon ? <HugeiconsIcon icon={icon} className="size-3" aria-hidden="true" /> : "?"}
    </span>
  );
}

const SignalingDetails = memo(function SignalingDetails({ record, id }: { record: NsgSignalingRecord; id: string }) {
  const { t } = useTranslation("nsg");
  const payloadHex = useMemo(() => bytesToHex(record.payload), [record.payload]);

  return (
    <div id={id} className="space-y-3 border-t px-4 py-3 text-xs">
      <p className="rounded-md bg-muted/30 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">{t("signaling.transportFallback")}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <dt className="text-[10px] text-muted-foreground">{t("signaling.logCode")}</dt>
          <dd className="font-mono">{formatValue(record.logCode)}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted-foreground">{t("signaling.version")}</dt>
          <dd className="font-mono">{formatValue(record.version)}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted-foreground">RB ID</dt>
          <dd className="font-mono">{formatValue(record.rbid)}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted-foreground">{t("signaling.recordOffset")}</dt>
          <dd className="font-mono">{formatValue(record.recordOffset)}</dd>
        </div>
      </dl>
      <div>
        <h3 className="mb-1 text-[10px] font-medium text-muted-foreground">{t("signaling.metadata")}</h3>
        <FieldTree value={record.metadata} />
      </div>
      <div>
        <h3 className="mb-1 text-[10px] font-medium text-muted-foreground">{t("signaling.rawPayload")}</h3>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/30 p-2 font-mono text-[10px] leading-relaxed select-text">
          {payloadHex || "-"}
        </pre>
      </div>
    </div>
  );
});

export const Signaling = memo(function Signaling({
  records,
  totalCount,
  truncated,
  onSelectTimestamp,
  onFilterChange,
}: {
  records: readonly NsgSignalingRecord[];
  totalCount: number;
  truncated: boolean;
  onSelectTimestamp: (timestampMs: number) => void;
  onFilterChange: () => void;
}) {
  const { t } = useTranslation("nsg");
  const [filter, setFilter] = useState<SignalingFilter>({ rat: "all", layer: "all" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ratOptions = useMemo(
    () => [
      { value: "all", label: t("filters.allTechnologies") },
      ...[...new Set(records.map((record) => record.rat))].sort().map((rat) => ({ value: rat, label: rat })),
    ],
    [records, t],
  );
  const layerOptions = useMemo(
    () => [
      { value: "all", label: t("signaling.allLayers") },
      ...[...new Set(records.map((record) => record.layer))].sort().map((layer) => ({ value: layer, label: layer })),
    ],
    [records, t],
  );
  const filtered = useMemo(
    () =>
      records.filter((record) => (filter.rat === "all" || record.rat === filter.rat) && (filter.layer === "all" || record.layer === filter.layer)),
    [records, filter],
  );
  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual requires the compiler's automatic bailout
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 82,
    getItemKey: (index) => filtered[index].id,
    overscan: 5,
  });

  function updateFilter(key: keyof SignalingFilter, value: string): void {
    onFilterChange();
    setFilter((current) => ({ ...current, [key]: value }));
    setSelectedId(null);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-2 gap-2 border-b px-4 py-2">
        <Filter label={t("signaling.technology")} value={filter.rat} options={ratOptions} onChange={(value) => updateFilter("rat", value)} />
        <Filter label={t("signaling.layer")} value={filter.layer} options={layerOptions} onChange={(value) => updateFilter("layer", value)} />
      </div>
      {truncated ? (
        <p className="shrink-0 border-b bg-amber-500/5 px-4 py-2 text-[11px] text-muted-foreground" role="status">
          {t("signaling.truncated", { shown: records.length, count: totalCount })}
        </p>
      ) : null}
      <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label={t("signaling.title")}>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">{t("signaling.empty")}</p>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const record = filtered[item.index];
              const isSelected = selectedId === record.id;
              const title = record.pduType ?? t("signaling.transportMessage", { rat: record.rat, layer: record.layer });
              const detailsId = `nsg-signaling-${record.id}`;
              return (
                <div
                  key={record.id}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full border-b"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <button
                    type="button"
                    aria-expanded={isSelected}
                    aria-controls={detailsId}
                    onClick={() => {
                      const opening = !isSelected;
                      setSelectedId(opening ? record.id : null);
                      onSelectTimestamp(record.timestampMs);
                    }}
                    title={formatTime(record.timestampMs, true)}
                    className={cn(
                      "w-full px-4 py-2.5 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      isSelected && "bg-primary/5",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-xs">
                      <GenerationTag className="bg-foreground/15 text-foreground">{record.rat}</GenerationTag>
                      <Direction direction={record.direction} label={t(`signaling.direction.${record.direction}`)} />
                      <span className="min-w-0 flex-1 truncate font-semibold" title={title}>
                        {title}
                      </span>
                      <time dateTime={new Date(record.timestampMs).toISOString()} className="shrink-0 font-mono font-semibold tabular-nums">
                        {formatTimeWithMilliseconds(record.timestampMs)}
                      </time>
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
                      <span>{record.layer}</span>
                      <span>
                        {t("signaling.channel")}: {formatValue(record.channel)}
                      </span>
                      <span>
                        {t("signaling.pdu")}: {formatValue(pduValue(record))}
                      </span>
                      <span>PCI: {formatValue(record.pci)}</span>
                      <span>
                        {channelLabel(record)}: {formatValue(record.channelNumber)}
                      </span>
                      <span className="ml-auto">{t("signaling.bytes", { count: record.payloadBytes })}</span>
                    </span>
                  </button>
                  {isSelected ? <SignalingDetails record={record} id={detailsId} /> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
