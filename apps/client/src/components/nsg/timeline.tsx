import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, ReferenceLine, Scatter, ScatterChart, type TooltipContentProps, XAxis, YAxis, ZAxis } from "recharts";

import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { NsgCell } from "@/lib/nsg/types";

import { getSignalIdentityFields } from "./cellPresentation";
import { formatTime, formatValue } from "./display";

type Metric = "dbm" | "rsrp" | "rssi" | "rsrq" | "sinr";
type SignalPoint = { timestamp: number; value: number; eventIndex: number; cell: NsgCell; series: string };
const COLORS = ["var(--primary)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const METRICS: Metric[] = ["dbm", "rsrp", "rssi", "rsrq", "sinr"];
const chartConfig = { signal: { color: "var(--primary)" } } satisfies ChartConfig;
const MAX_POINTS_PER_SERIES = 1200;

function isSignalPoint(value: unknown): value is SignalPoint {
  return typeof value === "object" && value !== null && "eventIndex" in value && "timestamp" in value && "cell" in value;
}

function SignalTooltip({ active, payload, unit }: Partial<TooltipContentProps> & { unit: string }) {
  const { t } = useTranslation("nsg");
  const point = payload?.map((entry) => entry.payload).find(isSignalPoint);
  if (!active || !point) return null;
  const identityFields = getSignalIdentityFields(point.cell);

  return (
    <div className="space-y-1.5 rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold tabular-nums">{formatTime(point.timestamp, true)}</p>
      <p className="text-muted-foreground">{point.series}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt>{t("chart.value")}</dt>
        <dd className="text-right font-mono">
          {point.value} {unit}
        </dd>
        {identityFields.map((field) => (
          <div key={field.key} className="contents">
            <dt>{field.label}</dt>
            <dd className="text-right font-mono">{formatValue(field.value)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground">{t("chart.select")}</p>
    </div>
  );
}

function getMetricUnit(metric: Metric): string {
  if (metric === "sinr") return "";
  if (metric === "rsrq") return "dB";
  return "dBm";
}

function downsample(points: SignalPoint[]): SignalPoint[] {
  if (points.length <= MAX_POINTS_PER_SERIES) return points;
  const sampled: SignalPoint[] = [];
  const bucketSize = Math.ceil(points.length / (MAX_POINTS_PER_SERIES / 2));
  for (let start = 0; start < points.length; start += bucketSize) {
    let minimum = points[start];
    let maximum = minimum;
    for (let index = start + 1; index < Math.min(points.length, start + bucketSize); index++) {
      const point = points[index];
      if (point.value < minimum.value) minimum = point;
      if (point.value > maximum.value) maximum = point;
    }
    if (minimum.timestamp <= maximum.timestamp) sampled.push(minimum, maximum);
    else sampled.push(maximum, minimum);
  }
  return sampled;
}

export function Timeline({
  cells,
  selectedTimestamp,
  onSelectEvent,
}: {
  cells: readonly NsgCell[];
  selectedTimestamp: number | null;
  onSelectEvent: (index: number) => void;
}) {
  const { t } = useTranslation("nsg");
  const [metric, setMetric] = useState<Metric>("dbm");
  const series = useMemo(() => {
    const groups = new Map<string, SignalPoint[]>();
    for (const cell of cells) {
      const value = cell[metric];
      if (cell.registered !== true || value === null || !Number.isFinite(value) || Math.abs(value) >= 2_147_483_647) continue;
      const name = `${cell.rat} · ${t("labels.slot")} ${formatValue(cell.slotId)} · ${t("labels.subscription")} ${formatValue(cell.subId)}`;
      const group = groups.get(name) ?? [];
      group.push({ timestamp: cell.timestampMs, value, eventIndex: cell.eventIndex, cell, series: name });
      if (!groups.has(name)) groups.set(name, group);
    }
    return [...groups].map(([name, points], index) => ({
      name,
      points: downsample(points.sort((a, b) => a.timestamp - b.timestamp)),
      count: points.length,
      color: COLORS[index % COLORS.length],
    }));
  }, [cells, metric, t]);
  const count = series.reduce((total, item) => total + item.count, 0);
  const plottedCount = series.reduce((total, item) => total + item.points.length, 0);
  const unit = getMetricUnit(metric);
  const options = METRICS.map((value) => ({ value, label: value === "dbm" ? t("chart.signal") : value.toUpperCase() }));

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border bg-card" aria-labelledby="nsg-signal-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-3">
        <div className="min-w-0 space-y-1">
          <h2 id="nsg-signal-heading" className="truncate text-sm font-semibold" title={t("chart.hint")}>
            {t("chart.title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("chart.hint")}</p>
        </div>
        <Select
          value={metric}
          items={options}
          onValueChange={(value) => {
            if (METRICS.some((item) => item === value)) setMetric(value as Metric);
          }}
        >
          <SelectTrigger size="sm" aria-label={t("chart.metric")} className="w-24 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent side="top">
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {series.length === 0 ? (
        <p id="nsg-signal-chart" className="flex h-64 items-center justify-center p-4 text-center text-sm text-muted-foreground">
          {t("chart.empty")}
        </p>
      ) : (
        <div id="nsg-signal-chart" className="space-y-1.5 p-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {series.map((item) => (
              <span key={item.name} className="flex shrink-0 items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: item.color }} />
                {item.name}
              </span>
            ))}
          </div>
          <ChartContainer
            config={chartConfig}
            className="h-64 w-full"
            style={{ aspectRatio: "auto" }}
            aria-label={t("chart.title") + (unit ? ` (${unit})` : "")}
          >
            <ScatterChart accessibilityLayer margin={{ top: 12, right: 14, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                type="number"
                dataKey="timestamp"
                name={t("chart.time")}
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value: number) => formatTime(value)}
                tickLine={false}
                axisLine={false}
                minTickGap={42}
                tickMargin={10}
              />
              <YAxis
                type="number"
                dataKey="value"
                name={unit}
                domain={["auto", "auto"]}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(value: number) => String(value)}
                label={unit ? { value: unit, position: "insideTopLeft", offset: -2, fontSize: 10 } : undefined}
              />
              <ZAxis range={[8, 8]} />
              <ChartTooltip content={<SignalTooltip unit={unit} />} cursor={{ strokeDasharray: "3 3" }} />
              {selectedTimestamp !== null ? <ReferenceLine x={selectedTimestamp} stroke="var(--muted-foreground)" strokeDasharray="4 3" /> : null}
              {series.map((item) => (
                <Scatter
                  key={item.name}
                  name={item.name}
                  data={item.points}
                  fill={item.color}
                  isAnimationActive={false}
                  onClick={(entry: unknown) => {
                    if (isSignalPoint(entry)) onSelectEvent(entry.eventIndex);
                    else if (typeof entry === "object" && entry !== null && "payload" in entry && isSignalPoint(entry.payload))
                      onSelectEvent(entry.payload.eventIndex);
                  }}
                />
              ))}
            </ScatterChart>
          </ChartContainer>
          <p className="text-xs text-muted-foreground">
            {t(plottedCount < count ? "chart.sampled" : "chart.count", { count, plotted: plottedCount })}
            {metric === "sinr" ? ` ${t("chart.sinrHint")}` : ""}
          </p>
        </div>
      )}
    </section>
  );
}
