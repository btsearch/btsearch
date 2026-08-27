import type { ComponentProps, ReactNode } from "react";
import { memo, useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LabelList, Rectangle } from "recharts";

import * as BarChartImport from "@/components/evilcharts/charts/bar-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";

import type { PermitSnapshot } from "../api";
import { compareBandNames } from "../lib/bandOrder";
import { operatorColor, operatorDataKey, operatorSeries } from "../lib/series";

export type SnapshotMetric = "permits" | "stations";
export type SnapshotBand = {
  id: number;
  name: string;
  rat: string;
  rows: PermitSnapshot["rows"];
};

type SnapshotChartDatum = { operator: string; all: number; delta: number; deltaLabel: string; color: string };
type SnapshotBarShapeProps = ComponentProps<typeof Rectangle> & {
  dataKey?: string;
  index?: number;
  payload?: Partial<SnapshotChartDatum>;
};

const PAGE_BAR_SIZE = 32;
const EXPORT_BAR_SIZE = 17;

export function buildSnapshotBands(rows: PermitSnapshot["rows"] | undefined): SnapshotBand[] {
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
    .sort((a, b) => compareBandNames(a.name, b.name));
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

function NewBarLabel({
  x,
  y,
  height,
  width,
  value,
  viewBox,
}: {
  x?: number | string;
  y?: number | string;
  height?: number | string;
  width?: number | string;
  value?: unknown;
  viewBox?: { x?: number | string; y?: number | string; height?: number | string; width?: number | string };
}) {
  const [amountLabel, percentLabel, deltaTone] = typeof value === "string" ? value.split("|") : [];
  const xValue = Number(viewBox?.x ?? x);
  const yValue = Number(viewBox?.y ?? y);
  const heightValue = Number(viewBox?.height ?? height);
  const widthValue = Number(viewBox?.width ?? width);
  if (!amountLabel || !percentLabel || !Number.isFinite(xValue) || !Number.isFinite(yValue) || !Number.isFinite(widthValue)) return null;

  const labelLift = Number.isFinite(heightValue) && heightValue < 3 ? 22 : 18;
  const labelY = Math.max(12, yValue - labelLift);
  const labelFill = deltaTone === "negative" ? "#ef4444" : "#10b981";
  return (
    <text x={xValue + widthValue / 2} y={labelY} textAnchor="middle" fill={labelFill} className="text-[10px]">
      <tspan x={xValue + widthValue / 2} dy={0}>
        {amountLabel}
      </tspan>
      <tspan x={xValue + widthValue / 2} dy={11}>
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
  mode?: "page" | "export";
}) {
  const { t, i18n } = useTranslation("statistics");
  const { EvilBarChart, Bar, XAxis, YAxis, Grid, Tooltip } = BarChartImport;
  const patternPrefix = useId().replace(/:/g, "");
  const isExport = mode === "export";
  const valueFormatter = useMemo(
    () =>
      (value: number, dataKey: string, payload: Record<string, unknown>): ReactNode => {
        if (dataKey === "delta") {
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

  const { data, config } = useMemo(() => {
    const chartData: SnapshotChartDatum[] = band.rows.map((row) => ({
      operator: row.operator.name,
      color: operatorColor(row.operator),
      ...getMetricValues(row, metric, i18n.language),
    }));
    const chartConfig = {
      all: { label: t("permitsByMonth.all"), colors: { light: ["var(--chart-1)"], dark: ["var(--chart-1)"] } },
      delta: { label: t("permitsByMonth.new"), colors: { light: ["var(--chart-2)"], dark: ["var(--chart-2)"] } },
    } satisfies Record<"all" | "delta", ChartConfig[string]>;
    return { data: chartData, config: chartConfig };
  }, [band.rows, i18n.language, metric, t]);

  const chartMinWidth = Math.max(320, data.length * (PAGE_BAR_SIZE * 2 + 12) + 72);
  const allBarShape = useMemo(() => createSnapshotBarShape(`snapshot-${patternPrefix}-${band.id}-all`, "solid"), [band.id, patternPrefix]);
  const deltaBarShape = useMemo(() => createSnapshotBarShape(`snapshot-${patternPrefix}-${band.id}-delta`, "hatched"), [band.id, patternPrefix]);

  const chart = (
    <EvilBarChart
      config={config}
      data={data}
      className={isExport ? "h-42 text-[9px]" : "h-56"}
      xDataKey="operator"
      animationType={isExport ? "none" : undefined}
      barCategoryGap={isExport ? 8 : 30}
      barGap={isExport ? 1 : 3}
      chartProps={{ margin: isExport ? { top: 20, left: 0, right: 0, bottom: 0 } : { top: 20, left: 8, right: 8 } }}
    >
      <Grid />
      <XAxis dataKey="operator" tick={isExport ? { fontSize: 9 } : undefined} />
      <YAxis width={isExport ? 46 : 54} locale={i18n.language} tick={isExport ? { fontSize: 9 } : undefined} />
      {isExport ? null : <Tooltip valueFormatter={valueFormatter} />}
      <Bar
        dataKey="all"
        barProps={{
          barSize: isExport ? EXPORT_BAR_SIZE : PAGE_BAR_SIZE,
          maxBarSize: isExport ? 20 : 40,
          shape: allBarShape,
          activeBar: allBarShape,
          children: [
            <LabelList
              key="lbl"
              dataKey="all"
              position="top"
              formatter={(value) => formatWholeNumber(value, i18n.language)}
              style={{ fontSize: isExport ? 9 : 10, fill: "var(--muted-foreground)" }}
            />,
          ],
        }}
      />
      <Bar
        dataKey="delta"
        variant="hatched"
        barProps={{
          barSize: isExport ? EXPORT_BAR_SIZE : PAGE_BAR_SIZE,
          maxBarSize: isExport ? 20 : 40,
          minPointSize: (value) => (typeof value === "number" && value !== 0 ? 3 : 0),
          shape: deltaBarShape,
          activeBar: deltaBarShape,
          children: [<LabelList key="lbl" dataKey="deltaLabel" content={<NewBarLabel />} />],
        }}
      />
    </EvilBarChart>
  );

  return (
    <div
      className={
        isExport
          ? "min-w-0 overflow-hidden border-r border-b border-white/15 bg-black px-2.5 py-2"
          : "p-4 [contain-intrinsic-size:360px] [content-visibility:auto]"
      }
    >
      <h3 className={isExport ? "mb-0.5 truncate text-xs font-semibold text-white" : "mb-3 text-sm font-medium"}>{band.name}</h3>
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
