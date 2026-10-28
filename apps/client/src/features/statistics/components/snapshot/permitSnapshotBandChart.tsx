import type { CSSProperties, ComponentProps, ReactNode } from "react";
import { memo, useCallback, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LabelList, Rectangle, ReferenceLine, useYAxisScale } from "recharts";

import type { SnapshotBand, SnapshotRow } from "../../lib/chartData";
import {
  COMPACT_AXIS_TICK_MARGIN,
  COMPACT_FONT_SIZE,
  SNAPSHOT_LAYOUT,
  type SnapshotChartMode,
  type SnapshotLayout,
  fitPageGeometry,
} from "./snapshotLayout";
import { Bar, EvilBarChart, Grid, Tooltip, XAxis, YAxis } from "@/components/evilcharts/charts/bar-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";

export type SnapshotMetric = "permits" | "stations";

type PermitSnapshotBandChartProps = { band: SnapshotBand; metric: SnapshotMetric; mode?: SnapshotChartMode };
type SnapshotChartDatum = { operator: string; all: number; delta: number; deltaBar: number; color: string };
type SnapshotBarShapeProps = ComponentProps<typeof Rectangle> & {
  dataKey?: string;
  index?: number;
  payload?: Partial<SnapshotChartDatum>;
};
type BarLabelViewBox = { x?: number | string; y?: number | string; height?: number | string; width?: number | string };
type BarLabelProps = { viewBox?: BarLabelViewBox; index?: number; data: SnapshotChartDatum[]; layout: SnapshotLayout; locale: string };

const DELTA_MIN_POINT_SIZE = 3;
const FALLBACK_BAR_COLOR = "var(--chart-1)";
const VALUE_LABEL_OFFSET = 5;
const NEGATIVE_AXIS_SHARE = 0.2;
const MIN_NEGATIVE_AXIS = 10;
const DELTA_TONE_CLASS_NAMES = { positive: "fill-emerald-700 dark:fill-emerald-400", negative: "fill-red-600 dark:fill-red-400" } as const;
const EXPORT_COLORS = { operator: "#d4d4d8", baseline: "#52525b", positive: "#34d399", negative: "#f87171" } as const;

function useElementWidth() {
  const [width, setWidth] = useState<number | null>(null);

  const ref = useCallback((element: HTMLDivElement | null) => {
    if (element === null) return;

    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

function toAxisValue(value: number, negativeScale: number): number {
  return Math.round(value < 0 ? value / negativeScale : value);
}

function formatShortNumber(value: number, locale: string): string {
  const plain = value.toLocaleString(locale);
  const compact = value.toLocaleString(locale, { notation: "compact", maximumFractionDigits: 1 });
  return compact.length < plain.length ? compact : plain;
}

function formatSignedDelta(value: number, locale: string): string {
  const formatted = Math.abs(value).toLocaleString(locale);
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function countPercentDigits(value: number): number {
  if (value < 0.1) return 3;
  if (value < 1) return 2;
  return 1;
}

function formatDeltaPercent(value: number, locale: string): string {
  return `${value.toLocaleString(locale, { maximumFractionDigits: countPercentDigits(value) })}%`;
}

function getMetricValues(row: SnapshotRow, metric: SnapshotMetric): { all: number; delta: number } {
  if (metric === "permits") return { all: row.permits, delta: row.added.permits };
  return { all: row.sites, delta: row.added.sites };
}

function hasDeltaLabel(datum: SnapshotChartDatum): boolean {
  return datum.delta !== 0 && datum.all > 0;
}

function renderSolidBar(props: unknown) {
  const shapeProps = props as SnapshotBarShapeProps;
  return <Rectangle {...shapeProps} fill={shapeProps.payload?.color ?? FALLBACK_BAR_COLOR} />;
}

function createHatchedBar(patternPrefix: string) {
  return function renderHatchedBar(props: unknown) {
    const shapeProps = props as SnapshotBarShapeProps;
    const fill = shapeProps.payload?.color ?? FALLBACK_BAR_COLOR;
    const patternId = `${patternPrefix}-${shapeProps.dataKey ?? "bar"}-${shapeProps.index ?? 0}`;

    return (
      <g>
        <defs>
          <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={fill} opacity={0.16} />
            <path d="M 0 0 L 0 6" stroke={fill} strokeWidth={2} />
          </pattern>
        </defs>
        <Rectangle {...shapeProps} fill={`url(#${patternId})`} stroke={fill} strokeWidth={1} />
      </g>
    );
  };
}

function renderTooltipSwatch(dataKey: string, payload: Record<string, unknown>): ReactNode {
  const color = typeof payload.color === "string" ? payload.color : FALLBACK_BAR_COLOR;
  const style: CSSProperties =
    dataKey === "deltaBar"
      ? {
          border: `1px solid ${color}`,
          backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
          backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 6px)`,
        }
      : { backgroundColor: color };

  return <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[2px]" style={style} />;
}

function roundUpToNice(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5].find((factor) => factor * magnitude >= value) ?? 10) * magnitude;
}

function getTickStep(maxValue: number): number {
  if (maxValue <= 0) return 1;
  const rawStep = maxValue / 4;
  const halfMagnitude = 10 ** Math.floor(Math.log10(rawStep)) / 2;
  return Math.ceil(Math.ceil(rawStep / halfMagnitude) * halfMagnitude);
}

function getValueAxis(values: { all: number; delta: number }[], fitToData: boolean) {
  const maxValue = Math.max(0, ...values.flatMap((value) => [value.all, value.delta]));
  const minDelta = Math.min(0, ...values.map((value) => value.delta));
  const step = getTickStep(maxValue);
  const max = fitToData ? Math.max(1, maxValue) : Math.max(step, Math.ceil(maxValue / step) * step);
  const positiveTicks = Array.from({ length: Math.floor(max / step) + 1 }, (_, index) => index * step);
  if (minDelta === 0) return { min: 0, max, ticks: positiveTicks, negativeScale: 1 };

  const negativeFloor = Math.max(MIN_NEGATIVE_AXIS, roundUpToNice(-minDelta));
  const min = (-max * NEGATIVE_AXIS_SHARE) / (1 - NEGATIVE_AXIS_SHARE);
  return { min, max, ticks: [min, ...positiveTicks], negativeScale: -min / negativeFloor };
}

function useLabelConflict(datum: SnapshotChartDatum | undefined, conflictDistance: number): boolean {
  const yScale = useYAxisScale();
  if (datum === undefined || !hasDeltaLabel(datum) || yScale === undefined) return false;

  const allTop = yScale(datum.all);
  const zeroY = yScale(0);
  const deltaY = yScale(datum.deltaBar);
  if (allTop === undefined || zeroY === undefined || deltaY === undefined) return false;

  const deltaTop = datum.delta > 0 ? Math.min(deltaY, zeroY - DELTA_MIN_POINT_SIZE) : zeroY;
  return deltaTop - allTop < conflictDistance;
}

function ValueBarLabel({ viewBox, index, data, layout, locale }: BarLabelProps) {
  const datum = index === undefined ? undefined : data[index];
  const hasConflict = useLabelConflict(datum, layout.conflictDistance);
  const x = Number(viewBox?.x);
  const y = Number(viewBox?.y);
  const width = Number(viewBox?.width);
  if (datum === undefined || ![x, y, width].every(Number.isFinite)) return null;

  return (
    <text
      x={hasConflict ? x + width : x + width / 2}
      y={y - VALUE_LABEL_OFFSET}
      textAnchor={hasConflict ? "end" : "middle"}
      style={{ ...layout.halo, fontSize: layout.valueFontSize, fontWeight: 600, fill: layout.valueFill }}
    >
      {datum.all.toLocaleString(locale)}
    </text>
  );
}

function DeltaBarLabel({ viewBox, index, data, layout, locale, isExport }: BarLabelProps & { isExport: boolean }) {
  const datum = index === undefined ? undefined : data[index];
  const hasConflict = useLabelConflict(datum, layout.conflictDistance);
  const x = Number(viewBox?.x);
  const y = Number(viewBox?.y);
  const width = Number(viewBox?.width);
  const height = Number(viewBox?.height);
  if (datum === undefined || !hasDeltaLabel(datum) || ![x, y, width, height].every(Number.isFinite)) return null;

  const tone = datum.delta < 0 ? "negative" : "positive";
  const percentY = Math.max(layout.deltaLabelHeight, Math.min(y, y + height) - layout.labelGap);
  const labelX = hasConflict ? x : x + width / 2;
  return (
    <text
      textAnchor={hasConflict ? "start" : "middle"}
      fill={isExport ? EXPORT_COLORS[tone] : undefined}
      className={isExport ? undefined : DELTA_TONE_CLASS_NAMES[tone]}
      style={layout.halo}
    >
      <tspan x={labelX} y={percentY - layout.deltaLineHeight} fontSize={layout.deltaFontSize} fontWeight={600}>
        {formatSignedDelta(datum.delta, locale)}
      </tspan>
      <tspan x={labelX} y={percentY} fontSize={layout.percentFontSize}>
        {formatDeltaPercent((Math.abs(datum.delta) / datum.all) * 100, locale)}
      </tspan>
    </text>
  );
}

export const PermitSnapshotBandChart = memo(function PermitSnapshotBandChart({ band, metric, mode = "page" }: PermitSnapshotBandChartProps) {
  const { t, i18n } = useTranslation("statistics");
  const patternPrefix = useId().replace(/:/g, "");
  const { ref: chartAreaRef, width: chartAreaWidth } = useElementWidth();
  const isExport = mode === "export";
  const valueFormatter = useCallback(
    (value: number, dataKey: string, payload: Record<string, unknown>): ReactNode => {
      if (dataKey !== "deltaBar") return value.toLocaleString(i18n.language);

      const delta = typeof payload.delta === "number" ? payload.delta : value;
      const formattedDelta = formatSignedDelta(delta, i18n.language);
      if (delta === 0) return formattedDelta;
      return <span className={delta < 0 ? "text-red-500" : "text-emerald-500"}>{formattedDelta}</span>;
    },
    [i18n.language],
  );

  const { data, config, valueAxis } = useMemo(() => {
    const values = band.rows.map((row) => ({ operator: row.operator.name, color: row.operator.color, ...getMetricValues(row, metric) }));
    const axis = getValueAxis(values, isExport);
    const chartData: SnapshotChartDatum[] = values.map((value) => ({
      ...value,
      deltaBar: value.delta < 0 ? value.delta * axis.negativeScale : value.delta,
    }));
    const chartConfig = {
      all: { label: t("common:status.all"), colors: { light: ["var(--chart-1)"], dark: ["var(--chart-1)"] } },
      deltaBar: { label: t("common:labels.new"), colors: { light: ["var(--chart-2)"], dark: ["var(--chart-2)"] } },
    } satisfies Record<"all" | "deltaBar", ChartConfig[string]>;
    return { data: chartData, config: chartConfig, valueAxis: axis };
  }, [band.rows, isExport, metric, t]);

  const formatCompactAxisValue = (value: number) => formatShortNumber(toAxisValue(value, valueAxis.negativeScale), i18n.language);
  const pageGeometry = fitPageGeometry(chartAreaWidth, data.length, valueAxis.ticks.map(formatCompactAxisValue));
  const layout = isExport ? SNAPSHOT_LAYOUT.export : pageGeometry.layout;
  const operatorTick = pageGeometry.isCompact
    ? { style: { fontSize: layout.tickFontSize }, width: pageGeometry.operatorLabelWidth, maxLines: 1 }
    : { fontSize: layout.tickFontSize };
  const deltaBarShape = useMemo(() => createHatchedBar(`snapshot-${patternPrefix}-delta`), [patternPrefix]);

  const chart = (
    <EvilBarChart
      config={config}
      data={data}
      className={isExport ? "aspect-auto" : "h-56"}
      xDataKey="operator"
      animationType={isExport ? "none" : undefined}
      barCategoryGap={isExport ? 8 : 30}
      barGap={layout.barGap}
      chartProps={{ margin: layout.margin }}
    >
      {isExport ? null : <Grid />}
      <XAxis dataKey="operator" interval={0} tick={isExport ? { fontSize: layout.tickFontSize, fill: EXPORT_COLORS.operator } : operatorTick} />
      {isExport ? (
        <YAxis hide domain={[valueAxis.min, valueAxis.max]} />
      ) : (
        <YAxis
          width={pageGeometry.axisWidth}
          tickMargin={pageGeometry.isCompact ? COMPACT_AXIS_TICK_MARGIN : undefined}
          tick={pageGeometry.isCompact ? { fontSize: COMPACT_FONT_SIZE } : undefined}
          domain={[valueAxis.min, valueAxis.max]}
          ticks={valueAxis.ticks}
          tickFormatter={
            pageGeometry.isCompact
              ? formatCompactAxisValue
              : (value: number) => toAxisValue(value, valueAxis.negativeScale).toLocaleString(i18n.language)
          }
        />
      )}
      <ReferenceLine y={0} stroke={isExport ? EXPORT_COLORS.baseline : undefined} />
      {isExport ? null : <Tooltip valueFormatter={valueFormatter} renderIndicator={renderTooltipSwatch} />}
      <Bar
        dataKey="all"
        barProps={{
          barSize: layout.barSize,
          maxBarSize: layout.barSize,
          shape: renderSolidBar,
          activeBar: renderSolidBar,
          children: [<LabelList key="lbl" dataKey="all" content={<ValueBarLabel data={data} layout={layout} locale={i18n.language} />} />],
        }}
      />
      <Bar
        dataKey="deltaBar"
        variant="hatched"
        barProps={{
          barSize: layout.barSize,
          maxBarSize: layout.barSize,
          minPointSize: (value) => (typeof value === "number" && value !== 0 ? DELTA_MIN_POINT_SIZE : 0),
          shape: deltaBarShape,
          activeBar: deltaBarShape,
          children: [
            <LabelList
              key="lbl"
              dataKey="delta"
              content={<DeltaBarLabel data={data} layout={layout} locale={i18n.language} isExport={isExport} />}
            />,
          ],
        }}
      />
    </EvilBarChart>
  );

  return (
    <div
      className={
        isExport
          ? "flex min-w-0 flex-1 flex-col overflow-hidden border-r border-b border-white/15 bg-black px-3 py-2.5"
          : "p-4 [contain-intrinsic-size:360px] [content-visibility:auto]"
      }
    >
      <h3 className={isExport ? "mb-1 truncate text-[22px] leading-6 font-semibold text-white" : "mb-3 text-sm font-semibold"}>{band.name}</h3>
      {isExport ? chart : <div ref={chartAreaRef}>{chart}</div>}
    </div>
  );
});
