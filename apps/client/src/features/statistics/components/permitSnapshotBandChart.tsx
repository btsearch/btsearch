import type { ComponentProps, ReactNode } from "react";
import { memo, useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LabelList, Rectangle, ReferenceLine, useYAxisScale } from "recharts";

import type { PermitSnapshot } from "../api";
import type { BandComparator } from "../lib/bandOrder";
import { operatorColor, operatorDataKey, operatorSeries } from "../lib/series";
import * as BarChartImport from "@/components/evilcharts/charts/bar-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";

export type SnapshotMetric = "permits" | "stations";
export type SnapshotBand = {
  id: number;
  name: string;
  rat: string;
  rows: PermitSnapshot["rows"];
};

type SnapshotChartDatum = { operator: string; all: number; delta: number; deltaBar: number; deltaLabel: string; color: string };
type SnapshotBarShapeProps = ComponentProps<typeof Rectangle> & {
  dataKey?: string;
  index?: number;
  payload?: Partial<SnapshotChartDatum>;
};
type BarLabelViewBox = { x?: number | string; y?: number | string; height?: number | string; width?: number | string };
type SnapshotChartMode = "page" | "export";
type BarLabelProps = { value?: unknown; viewBox?: BarLabelViewBox; index?: number; data: SnapshotChartDatum[]; mode: SnapshotChartMode };

const DELTA_MIN_POINT_SIZE = 3;
const VALUE_LABEL_OFFSET = 5;
const NEGATIVE_AXIS_SHARE = 0.2;
const MIN_NEGATIVE_AXIS = 10;
const SNAPSHOT_LAYOUT = {
  page: {
    barSize: 28,
    barGap: 6,
    margin: { top: 20, left: 8, right: 8 },
    tickFontSize: 13,
    valueFontSize: 13,
    deltaFontSize: 12,
    percentFontSize: 11,
    deltaLineHeight: 13,
    deltaLabelHeight: 24,
    labelGap: 6,
    conflictDistance: 28,
    valueFill: "var(--foreground)",
    halo: { stroke: "var(--background)", strokeWidth: 3, strokeLinejoin: "round", paintOrder: "stroke" },
  },
  export: {
    barSize: 24,
    barGap: 10,
    margin: { top: 26, left: 6, right: 6, bottom: 0 },
    tickFontSize: 15,
    valueFontSize: 18,
    deltaFontSize: 15,
    percentFontSize: 13,
    deltaLineHeight: 15,
    deltaLabelHeight: 28,
    labelGap: 7,
    conflictDistance: 34,
    valueFill: "#fafafa",
    halo: { stroke: "#000000", strokeWidth: 4, strokeLinejoin: "round", paintOrder: "stroke" },
  },
} as const;
const DELTA_TONE_CLASS_NAMES = { positive: "fill-emerald-700 dark:fill-emerald-400", negative: "fill-red-600 dark:fill-red-400" } as const;
const EXPORT_COLORS = { operator: "#d4d4d8", baseline: "#52525b", positive: "#34d399", negative: "#f87171" } as const;

export function buildSnapshotBands(rows: PermitSnapshot["rows"] | undefined, compareBands: BandComparator): SnapshotBand[] {
  const bands = new Map<string, SnapshotBand>();
  const operatorOrder = new Map(operatorSeries((rows ?? []).map((row) => row.operator)).map((series, index) => [series.key, index]));

  for (const row of rows ?? []) {
    const existing = bands.get(row.band.name) ?? { id: row.band.id, name: row.band.name, rat: row.band.rat, rows: [] };
    existing.rows.push(row);
    bands.set(row.band.name, existing);
  }

  return [...bands.values()]
    .map((band) => ({
      ...band,
      rows: [...band.rows].sort(
        (a, b) =>
          (operatorOrder.get(operatorDataKey(a.operator)) ?? Number.MAX_SAFE_INTEGER) -
            (operatorOrder.get(operatorDataKey(b.operator)) ?? Number.MAX_SAFE_INTEGER) || a.operator.name.localeCompare(b.operator.name),
      ),
    }))
    .sort(compareBands);
}

function formatWholeNumber(value: unknown, locale: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString(locale) : String(value);
}

function formatSignedDelta(value: number, locale: string): string {
  const formatted = Math.abs(value).toLocaleString(locale);
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function formatPercent(value: number, locale: string): string {
  const maximumFractionDigits = value < 0.1 ? 3 : value < 1 ? 2 : 1;
  return `${value.toLocaleString(locale, { maximumFractionDigits })}%`;
}

function getMetricValues(row: PermitSnapshot["rows"][number], metric: SnapshotMetric, locale: string) {
  const all = metric === "permits" ? row.permits : row.unique_stations;
  const delta = metric === "permits" ? row.permits_delta : row.unique_stations_delta;
  const absoluteDelta = Math.abs(delta);
  const deltaTone = delta < 0 ? "negative" : "positive";
  const deltaLabel =
    absoluteDelta > 0 && all > 0 ? `${formatSignedDelta(delta, locale)}|${formatPercent((absoluteDelta / all) * 100, locale)}|${deltaTone}` : "";
  return { all, delta, deltaLabel };
}

function createSnapshotBarShape(patternPrefix: string, variant: "solid" | "hatched") {
  return function SnapshotBarShape(props: unknown) {
    const shapeProps = props as unknown as SnapshotBarShapeProps;
    const fill = shapeProps.payload?.color ?? "var(--chart-1)";

    if (variant === "solid") return <Rectangle {...shapeProps} fill={fill} />;

    const index = typeof shapeProps.index === "number" ? shapeProps.index : 0;
    const dataKey = shapeProps.dataKey ?? "bar";
    const patternId = `${patternPrefix}-${dataKey}-${index}`;

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
  if (datum === undefined || datum.deltaLabel === "" || yScale === undefined) return false;

  const allTop = yScale(datum.all);
  const zeroY = yScale(0);
  const deltaY = yScale(datum.deltaBar);
  if (allTop === undefined || zeroY === undefined || deltaY === undefined) return false;

  const deltaTop = datum.delta > 0 ? Math.min(deltaY, zeroY - DELTA_MIN_POINT_SIZE) : zeroY;
  return deltaTop - allTop < conflictDistance;
}

function ValueBarLabel({ value, viewBox, index, data, mode, locale }: BarLabelProps & { locale: string }) {
  const layout = SNAPSHOT_LAYOUT[mode];
  const hasConflict = useLabelConflict(index === undefined ? undefined : data[index], layout.conflictDistance);
  const x = Number(viewBox?.x);
  const y = Number(viewBox?.y);
  const width = Number(viewBox?.width);
  if (![x, y, width].every(Number.isFinite)) return null;

  return (
    <text
      x={hasConflict ? x + width : x + width / 2}
      y={y - VALUE_LABEL_OFFSET}
      textAnchor={hasConflict ? "end" : "middle"}
      style={{ ...layout.halo, fontSize: layout.valueFontSize, fontWeight: 600, fill: layout.valueFill }}
    >
      {formatWholeNumber(value, locale)}
    </text>
  );
}

function DeltaBarLabel({ value, viewBox, index, data, mode }: BarLabelProps) {
  const layout = SNAPSHOT_LAYOUT[mode];
  const hasConflict = useLabelConflict(index === undefined ? undefined : data[index], layout.conflictDistance);
  const [amountLabel, percentLabel, deltaTone] = typeof value === "string" ? value.split("|") : [];
  const x = Number(viewBox?.x);
  const y = Number(viewBox?.y);
  const width = Number(viewBox?.width);
  const height = Number(viewBox?.height);
  if (!amountLabel || !percentLabel || ![x, y, width, height].every(Number.isFinite)) return null;

  const tone = deltaTone === "negative" ? "negative" : "positive";
  const percentY = Math.max(layout.deltaLabelHeight, Math.min(y, y + height) - layout.labelGap);
  const labelX = hasConflict ? x : x + width / 2;
  return (
    <text
      textAnchor={hasConflict ? "start" : "middle"}
      fill={mode === "export" ? EXPORT_COLORS[tone] : undefined}
      className={mode === "export" ? undefined : DELTA_TONE_CLASS_NAMES[tone]}
      style={layout.halo}
    >
      <tspan x={labelX} y={percentY - layout.deltaLineHeight} fontSize={layout.deltaFontSize} fontWeight={600}>
        {amountLabel}
      </tspan>
      <tspan x={labelX} y={percentY} fontSize={layout.percentFontSize}>
        {percentLabel}
      </tspan>
    </text>
  );
}

export const PermitSnapshotBandChart = memo(function PermitSnapshotBandChart({
  band,
  metric,
  mode = "page",
}: {
  band: SnapshotBand;
  metric: SnapshotMetric;
  mode?: SnapshotChartMode;
}) {
  const { t, i18n } = useTranslation("statistics");
  const { EvilBarChart, Bar, XAxis, YAxis, Grid, Tooltip } = BarChartImport;
  const patternPrefix = useId().replace(/:/g, "");
  const isExport = mode === "export";
  const layout = SNAPSHOT_LAYOUT[mode];
  const valueFormatter = useMemo(
    () =>
      (value: number, dataKey: string, payload: Record<string, unknown>): ReactNode => {
        if (dataKey === "deltaBar") {
          const delta = payload["delta"];
          const displayValue = typeof delta === "number" ? delta : value;
          if (displayValue === 0) return formatSignedDelta(displayValue, i18n.language);

          const toneClassName = displayValue < 0 ? "text-red-500" : "text-emerald-500";
          return <span className={toneClassName}>{formatSignedDelta(displayValue, i18n.language)}</span>;
        }

        return value.toLocaleString(i18n.language);
      },
    [i18n.language],
  );

  const { data, config, valueAxis } = useMemo(() => {
    const values = band.rows.map((row) => ({
      operator: row.operator.name,
      color: operatorColor(row.operator),
      ...getMetricValues(row, metric, i18n.language),
    }));
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
  }, [band.rows, i18n.language, isExport, metric, t]);

  const chartMinWidth = Math.max(320, data.length * (layout.barSize * 2 + layout.barGap + 14) + 72);
  const allBarShape = useMemo(() => createSnapshotBarShape(`snapshot-${patternPrefix}-${band.id}-all`, "solid"), [band.id, patternPrefix]);
  const deltaBarShape = useMemo(() => createSnapshotBarShape(`snapshot-${patternPrefix}-${band.id}-delta`, "hatched"), [band.id, patternPrefix]);

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
      <XAxis
        dataKey="operator"
        interval={0}
        tick={isExport ? { fontSize: layout.tickFontSize, fill: EXPORT_COLORS.operator } : { fontSize: layout.tickFontSize }}
      />
      {isExport ? (
        <YAxis hide domain={[valueAxis.min, valueAxis.max]} />
      ) : (
        <YAxis
          width={54}
          domain={[valueAxis.min, valueAxis.max]}
          ticks={valueAxis.ticks}
          tickFormatter={(value: number) => Math.round(value < 0 ? value / valueAxis.negativeScale : value).toLocaleString(i18n.language)}
        />
      )}
      <ReferenceLine y={0} stroke={isExport ? EXPORT_COLORS.baseline : undefined} />
      {isExport ? null : <Tooltip valueFormatter={valueFormatter} />}
      <Bar
        dataKey="all"
        barProps={{
          barSize: layout.barSize,
          maxBarSize: layout.barSize,
          shape: allBarShape,
          activeBar: allBarShape,
          children: [<LabelList key="lbl" dataKey="all" content={<ValueBarLabel data={data} mode={mode} locale={i18n.language} />} />],
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
          children: [<LabelList key="lbl" dataKey="deltaLabel" content={<DeltaBarLabel data={data} mode={mode} />} />],
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
      {isExport ? (
        chart
      ) : (
        <div className="scrollbar-hide overflow-x-auto overflow-y-hidden scrollbar-gutter-stable">
          <div style={{ minWidth: chartMinWidth }}>{chart}</div>
        </div>
      )}
    </div>
  );
});
