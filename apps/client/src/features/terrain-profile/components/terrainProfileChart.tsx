import { useCallback, useEffect, useId, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Area, CartesianGrid, ComposedChart, type CurveProps, Line, type TooltipContentProps, XAxis, YAxis, useYAxisScale } from "recharts";

import { useTerrainFormat } from "../format";
import { type HoveredDistanceStore, getMapHoveredDistance } from "../hoveredDistance";
import { type ProfileHighlight, type ProfileSummary, type SampleRun, findNearestSampleIndex, getProfileHighlight } from "../profileSummary";
import type { ReadyTerrainProfile, TerrainSample } from "../types";
import { getTerrainPathVerdict } from "../verdict";
import { PLOT_SIZE_CLASS } from "./terrainProfileStyles";
import { getPathSummary, getVerdictSentence } from "./terrainProfileVerdict";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

type TerrainProfileChartProps = {
  profile: ReadyTerrainProfile;
  summary: ProfileSummary;
  siteId: string;
  hover: HoveredDistanceStore;
  isCompact: boolean;
};

type ChartRow = {
  distanceKm: number;
  groundMeters: number;
  surfaceMeters: number | null;
  sightLineMeters: number;
  sampleIndex: number;
};

type ElevationDomain = [number, number];

type ElevationAxis = {
  domain: ElevationDomain;
  ticks: number[];
};

type ElevationScale = ReturnType<typeof useYAxisScale>;

type Plot = {
  xs: number[];
  top: number;
  bottom: number;
  toY: (meters: number) => number;
};

type SampleTooltipProps = Partial<TooltipContentProps> & {
  samples: readonly TerrainSample[];
  summary: ProfileSummary;
  onActiveSampleChange: (sample: TerrainSample | null) => void;
};

type EndLabels = {
  station: string;
  receiver: string;
};

type LabelSpan = {
  start: number;
  end: number;
};

type EndPostProps = {
  x: number;
  groundY: number;
  tipY: number;
  label: string;
  color: string;
  isLabelOnLeft: boolean;
};

type HighlightMarkProps = {
  plot: Plot;
  highlight: ProfileHighlight;
  label: string;
  surfaceY: number;
  tipY: number;
  freeSpan: LabelSpan;
};

type ProfileMarksProps = {
  curve: CurveProps;
  samples: readonly TerrainSample[];
  summary: ProfileSummary;
  highlight: ProfileHighlight | null;
  highlightLabel: string | null;
  elevationDomain: ElevationDomain;
  fullLabels: EndLabels;
  shortLabels: EndLabels;
  prefersShortLabels: boolean;
  crosshairIndex: number | null;
  onExaggerationChange: (exaggeration: number | null) => void;
};

type ExaggerationReporterProps = {
  exaggeration: number | null;
  onChange: (exaggeration: number | null) => void;
};

type LegendItemProps = {
  label: string;
  swatchClassName: string;
};

const CHART_CONFIG = {
  terrain: { color: "var(--muted-foreground)" },
  surface: { color: "var(--chart-3)" },
  lineOfSight: { color: "var(--primary)" },
} satisfies ChartConfig;

const CHART_MARGIN = { top: 24, right: 12, bottom: 0, left: 0 };
const ELEVATION_AXIS_WIDTH = 48;
const MIN_ELEVATION_SPAN_METERS = 10;
const ELEVATION_TICK_TARGET = 4;
const ELEVATION_BOTTOM_PADDING_SHARE = 0.08;
const ELEVATION_TOP_PADDING_SHARE = 0.2;
const DISTANCE_TICK_TARGET = { regular: 5, compact: 3 };
const DISTANCE_TICK_DECIMALS = 6;
const NICE_STEP_FACTORS = [1, 2, 5, 10];
const WHOLE_EXAGGERATION_FROM = 10;
const LABEL_GAP = 9;
const LABEL_LIFT = 8;
const LABEL_DROP = 13;
const LABEL_MIN_BASELINE = 11;
const LABEL_BOTTOM_INSET = 3;
const HIGHLIGHT_LABEL_GAP = 6;
const END_LABELS_MIN_GAP = 16;
const END_DOT_RADIUS = 4;
const LABEL_FONT_SIZE = 11;
const LABEL_CHARACTER_WIDTH = 6.5;
const LABEL_HALO = { paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 3, strokeLinejoin: "round" } as const;
const TOOLTIP_VALUE_CLASS = "font-mono font-medium tabular-nums";
const EXAGGERATION_CLASS = "ms-auto min-w-[14ch] text-end font-mono text-[11px] whitespace-nowrap";

function getNiceStep(roughStep: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const factor = NICE_STEP_FACTORS.find((candidate) => candidate * magnitude >= roughStep) ?? 10;
  return factor * magnitude;
}

function getElevationAxis(samples: readonly TerrainSample[]): ElevationAxis {
  const heights = samples.flatMap((sample) => [sample.groundMeters, sample.sightLineMeters, sample.surfaceMeters ?? sample.groundMeters]);
  const lowest = heights.length === 0 ? 0 : Math.min(...heights);
  const highest = heights.length === 0 ? MIN_ELEVATION_SPAN_METERS : Math.max(...heights);
  const span = Math.max(highest - lowest, MIN_ELEVATION_SPAN_METERS);
  const step = getNiceStep(span / ELEVATION_TICK_TARGET);
  const low = Math.floor((lowest - span * ELEVATION_BOTTOM_PADDING_SHARE) / step) * step;
  const high = Math.ceil((highest + span * ELEVATION_TOP_PADDING_SHARE) / step) * step;
  const ticks: number[] = [];
  for (let tick = low + step; tick < high; tick += step) ticks.push(tick);

  return { domain: [low, high], ticks };
}

function getDistanceTicks(totalKm: number, targetCount: number): number[] {
  if (totalKm <= 0) return [0];
  const step = getNiceStep(totalKm / targetCount);
  const lastTick = Math.floor(totalKm / step);
  return Array.from({ length: lastTick + 1 }, (_, index) => Number((index * step).toFixed(DISTANCE_TICK_DECIMALS)));
}

function toChartRow(sample: TerrainSample, sampleIndex: number): ChartRow {
  return {
    distanceKm: sample.distanceMeters / 1000,
    groundMeters: sample.groundMeters,
    surfaceMeters: sample.surfaceMeters,
    sightLineMeters: sample.sightLineMeters,
    sampleIndex,
  };
}

function isChartRow(value: unknown): value is ChartRow {
  return typeof value === "object" && value !== null && "sampleIndex" in value && "distanceKm" in value;
}

function measurePlot(points: CurveProps["points"], scale: ElevationScale, sampleCount: number, [low, high]: ElevationDomain): Plot | null {
  if (typeof scale !== "function" || points === undefined || points.length !== sampleCount || sampleCount < 2) return null;

  const xs: number[] = [];
  for (const point of points) {
    if (typeof point?.x !== "number") return null;
    xs.push(point.x);
  }

  const toPixel = scale;
  const top = toPixel(high);
  const bottom = toPixel(low);
  if (typeof top !== "number" || typeof bottom !== "number") return null;
  return { xs, top, bottom, toY: (meters) => toPixel(meters) ?? bottom };
}

function getExaggeration(plot: Plot, samples: readonly TerrainSample[], [low, high]: ElevationDomain): number | null {
  const pathMeters = samples[samples.length - 1].distanceMeters - samples[0].distanceMeters;
  const plotWidth = plot.xs[plot.xs.length - 1] - plot.xs[0];
  const plotHeight = plot.bottom - plot.top;
  if (pathMeters <= 0 || plotWidth <= 0 || plotHeight <= 0 || high <= low) return null;

  const exaggeration = plotHeight / (high - low) / (plotWidth / pathMeters);
  return exaggeration >= WHOLE_EXAGGERATION_FROM ? Math.round(exaggeration) : Math.round(exaggeration * 10) / 10;
}

function getMidpoint(plot: Plot, heights: readonly number[], leftIndex: number, rightIndex: number): string {
  const x = (plot.xs[leftIndex] + plot.xs[rightIndex]) / 2;
  const y = (plot.toY(heights[leftIndex]) + plot.toY(heights[rightIndex])) / 2;
  return `${x} ${y}`;
}

function buildRunPath(plot: Plot, heights: readonly number[], { firstIndex, lastIndex }: SampleRun): string {
  const points: string[] = [];
  if (firstIndex > 0) points.push(getMidpoint(plot, heights, firstIndex - 1, firstIndex));
  for (let index = firstIndex; index <= lastIndex; index++) points.push(`${plot.xs[index]} ${plot.toY(heights[index])}`);
  if (lastIndex < heights.length - 1) points.push(getMidpoint(plot, heights, lastIndex, lastIndex + 1));
  return `M${points.join("L")}`;
}

function SampleTooltip({ active, payload, samples, summary, onActiveSampleChange }: SampleTooltipProps) {
  const { t } = useTranslation("terrainProfile");
  const format = useTerrainFormat();
  const row = active === true ? payload?.map((entry) => entry.payload).find(isChartRow) : undefined;
  const sampleIndex = row?.sampleIndex ?? null;
  const sample = sampleIndex === null ? null : (samples[sampleIndex] ?? null);

  useEffect(() => {
    onActiveSampleChange(sample);
  }, [onActiveSampleChange, sample]);

  if (sample === null || sampleIndex === null) return null;
  const clearance = summary.clearances[sampleIndex];
  const isBlocked = clearance < 0;

  return (
    <div className="grid min-w-44 gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-2 text-xs shadow-xl">
      <div className="font-semibold tabular-nums">{t("distanceFromStation", { value: format.decimal(sample.distanceMeters / 1000, 2) })}</div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">{t("chart.legend.terrain")}</dt>
        <dd className={TOOLTIP_VALUE_CLASS}>{`${format.decimal(sample.groundMeters, 1)} m`}</dd>
        <dt className="text-muted-foreground">{t("chart.legend.surface")}</dt>
        <dd className={TOOLTIP_VALUE_CLASS}>{sample.surfaceMeters === null ? "-" : `${format.decimal(sample.surfaceMeters, 1)} m`}</dd>
        <dt className="text-muted-foreground">{t("chart.legend.lineOfSight")}</dt>
        <dd className={TOOLTIP_VALUE_CLASS}>{`${format.decimal(sample.sightLineMeters, 1)} m`}</dd>
        <dt className={isBlocked ? "font-medium text-destructive" : "text-muted-foreground"}>{t("chart.clearance")}</dt>
        <dd className={cn(TOOLTIP_VALUE_CLASS, isBlocked ? "text-destructive" : null)}>{`${format.signed(clearance, 1)} m`}</dd>
      </dl>
    </div>
  );
}

function estimateLabelWidth(label: string): number {
  return label.length * LABEL_CHARACTER_WIDTH;
}

function EndPost({ x, groundY, tipY, label, color, isLabelOnLeft }: EndPostProps) {
  return (
    <>
      <line x1={x} x2={x} y1={groundY} y2={tipY} stroke={color} strokeWidth={2} />
      <circle cx={x} cy={tipY} r={END_DOT_RADIUS} fill={color} stroke="var(--background)" strokeWidth={2} />
      <text
        x={isLabelOnLeft ? x - LABEL_GAP : x + LABEL_GAP}
        y={Math.max(tipY - LABEL_LIFT, LABEL_MIN_BASELINE)}
        textAnchor={isLabelOnLeft ? "end" : "start"}
        fontSize={LABEL_FONT_SIZE}
        fontWeight={600}
        className="fill-foreground"
        style={LABEL_HALO}
      >
        {label}
      </text>
    </>
  );
}

function HighlightMark({ plot, highlight, label, surfaceY, tipY, freeSpan }: HighlightMarkProps) {
  const lastIndex = plot.xs.length - 1;
  const x = plot.xs[highlight.index];
  const isOnRight = x > (plot.xs[0] + plot.xs[lastIndex]) / 2;
  const labelX = isOnRight ? x - HIGHLIGHT_LABEL_GAP : x + HIGHLIGHT_LABEL_GAP;
  const textAnchor = isOnRight ? "end" : "start";

  if (highlight.kind === "obstruction") {
    return (
      <>
        <line x1={x} x2={x} y1={plot.top} y2={plot.bottom} stroke="var(--destructive)" strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.6} />
        <text
          x={labelX}
          y={plot.top + LABEL_MIN_BASELINE}
          textAnchor={textAnchor}
          fontSize={LABEL_FONT_SIZE}
          fontWeight={600}
          className="fill-destructive"
          style={LABEL_HALO}
        >
          {label}
        </text>
      </>
    );
  }
  if (highlight.index === 0 || highlight.index === lastIndex) return null;

  const labelWidth = estimateLabelWidth(label);
  const labelStart = isOnRight ? labelX - labelWidth : labelX;
  const isBesideEndLabel = labelStart < freeSpan.start || labelStart + labelWidth > freeSpan.end;
  const labelBelowY = Math.min(surfaceY + LABEL_DROP, plot.bottom - LABEL_BOTTOM_INSET);
  const labelAboveY = Math.max(tipY - LABEL_LIFT, LABEL_MIN_BASELINE);

  return (
    <>
      <line x1={x} x2={x} y1={surfaceY} y2={tipY} strokeWidth={1.5} className="stroke-emerald-600 dark:stroke-emerald-400" />
      <text
        x={labelX}
        y={isBesideEndLabel ? labelBelowY : labelAboveY}
        textAnchor={textAnchor}
        fontSize={LABEL_FONT_SIZE}
        fontWeight={600}
        className="fill-emerald-700 dark:fill-emerald-400"
        style={LABEL_HALO}
      >
        {label}
      </text>
    </>
  );
}

function ExaggerationReporter({ exaggeration, onChange }: ExaggerationReporterProps) {
  useEffect(() => {
    onChange(exaggeration);
  }, [exaggeration, onChange]);

  return null;
}

function ProfileMarks({
  curve,
  samples,
  summary,
  highlight,
  highlightLabel,
  elevationDomain,
  fullLabels,
  shortLabels,
  prefersShortLabels,
  crosshairIndex,
  onExaggerationChange,
}: ProfileMarksProps) {
  const scale = useYAxisScale();
  const plot = measurePlot(curve.points, scale, samples.length, elevationDomain);
  if (plot === null) return <ExaggerationReporter exaggeration={null} onChange={onExaggerationChange} />;

  const lastIndex = samples.length - 1;
  const station = samples[0];
  const receiver = samples[lastIndex];
  const stationX = plot.xs[0];
  const receiverX = plot.xs[lastIndex];
  const fullLabelsWidth = estimateLabelWidth(fullLabels.station) + estimateLabelWidth(fullLabels.receiver) + LABEL_GAP * 2 + END_LABELS_MIN_GAP;
  const labels = prefersShortLabels || receiverX - stationX < fullLabelsWidth ? shortLabels : fullLabels;
  const freeSpan: LabelSpan = {
    start: stationX + LABEL_GAP + estimateLabelWidth(labels.station),
    end: receiverX - LABEL_GAP - estimateLabelWidth(labels.receiver),
  };

  return (
    <g aria-hidden="true" pointerEvents="none">
      <ExaggerationReporter exaggeration={getExaggeration(plot, samples, elevationDomain)} onChange={onExaggerationChange} />
      {summary.blockedRuns.map((run) => (
        <path
          key={run.firstIndex}
          d={buildRunPath(plot, summary.obstructingHeights, run)}
          fill="none"
          stroke="var(--destructive)"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {highlight === null || highlightLabel === null ? null : (
        <HighlightMark
          plot={plot}
          highlight={highlight}
          label={highlightLabel}
          surfaceY={plot.toY(summary.obstructingHeights[highlight.index])}
          tipY={plot.toY(samples[highlight.index].sightLineMeters)}
          freeSpan={freeSpan}
        />
      )}
      <EndPost
        x={stationX}
        groundY={plot.toY(station.groundMeters)}
        tipY={plot.toY(station.sightLineMeters)}
        label={labels.station}
        color="var(--foreground)"
        isLabelOnLeft={false}
      />
      <EndPost
        x={receiverX}
        groundY={plot.toY(receiver.groundMeters)}
        tipY={plot.toY(receiver.sightLineMeters)}
        label={labels.receiver}
        color="var(--primary)"
        isLabelOnLeft
      />
      {crosshairIndex === null ? null : (
        <line
          x1={plot.xs[crosshairIndex]}
          x2={plot.xs[crosshairIndex]}
          y1={plot.top}
          y2={plot.bottom}
          strokeWidth={1}
          strokeDasharray="3 3"
          className="stroke-muted-foreground"
        />
      )}
    </g>
  );
}

function LegendItem({ label, swatchClassName }: LegendItemProps) {
  return (
    <li className="flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className={cn("block w-4 shrink-0", swatchClassName)} />
      <span>{label}</span>
    </li>
  );
}

function ProfileLegend({ exaggeration }: { exaggeration: number | null }) {
  const { t } = useTranslation("terrainProfile");
  const format = useTerrainFormat();

  return (
    <div className="flex items-center gap-3 text-xs leading-4 text-muted-foreground">
      <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1" aria-label={t("chart.legend.label")}>
        <LegendItem label={t("chart.legend.terrain")} swatchClassName="h-2 rounded-sm bg-muted-foreground/40" />
        <LegendItem label={t("chart.legend.surface")} swatchClassName="h-0.5 bg-chart-3" />
        <LegendItem label={t("chart.legend.lineOfSight")} swatchClassName="h-0.5 bg-primary" />
        <LegendItem label={t("chart.legend.obstruction")} swatchClassName="h-[3px] rounded-full bg-destructive" />
      </ul>
      {exaggeration === null ? null : (
        <span className={EXAGGERATION_CLASS}>{t("chart.exaggeration", { value: format.compact(exaggeration, 1) })}</span>
      )}
    </div>
  );
}

export default function TerrainProfileChart({ profile, summary, siteId, hover, isCompact }: TerrainProfileChartProps) {
  const { t } = useTranslation("terrainProfile");
  const format = useTerrainFormat();
  const descriptionId = useId();
  const mapHoveredDistance = useSyncExternalStore(hover.subscribe, () => getMapHoveredDistance(hover));
  const [exaggeration, setExaggeration] = useState<number | null>(null);

  const reportActiveSample = useCallback(
    (sample: TerrainSample | null) => {
      if (sample === null) hover.release("chart");
      else hover.set({ distanceMeters: sample.distanceMeters, source: "chart" });
    },
    [hover],
  );

  useEffect(() => () => hover.release("chart"), [hover]);

  const { result, antenna, receiver } = profile;
  const { samples } = result;
  const verdict = getTerrainPathVerdict(result);
  const highlight = getProfileHighlight(result, summary, verdict);
  const axis = getElevationAxis(samples);
  const totalKm = result.distanceMeters / 1000;
  const distanceTicks = getDistanceTicks(totalKm, isCompact ? DISTANCE_TICK_TARGET.compact : DISTANCE_TICK_TARGET.regular);
  const rows = samples.map(toChartRow);
  const crosshairIndex = mapHoveredDistance === null ? null : findNearestSampleIndex(samples, mapHoveredDistance);
  const description = `${getVerdictSentence(verdict, t)}. ${getPathSummary(result, format, t)}`;
  const shortLabels: EndLabels = { station: siteId, receiver: t("receiver.title") };
  const fullLabels: EndLabels = {
    station: t("chart.endpoints.site", { siteId, height: format.decimal(antenna.heightMeters, 1) }),
    receiver: t("chart.endpoints.receiver", { height: format.decimal(receiver.heightMeters, 1) }),
  };
  let highlightLabel: string | null = null;
  if (highlight?.kind === "obstruction") highlightLabel = t("chart.obstacleAt", { distance: format.decimal(highlight.distanceMeters / 1000, 2) });
  if (highlight?.kind === "clearance") highlightLabel = `${format.decimal(highlight.clearanceMeters, 1)} m`;

  return (
    <div className={cn("flex flex-col gap-2", isCompact ? null : "flex-1")}>
      <ProfileLegend exaggeration={exaggeration} />
      <p id={descriptionId} className="sr-only">
        {description}
      </p>
      <div className={cn("relative", isCompact ? PLOT_SIZE_CLASS.compact : PLOT_SIZE_CLASS.regular)}>
        <ChartContainer
          config={CHART_CONFIG}
          className="absolute inset-0"
          style={{ aspectRatio: "auto" }}
          role="group"
          aria-label={t("chart.label")}
          aria-describedby={descriptionId}
        >
          <ComposedChart accessibilityLayer data={rows} margin={CHART_MARGIN} onMouseLeave={() => hover.release("chart")}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="distanceKm"
              type="number"
              domain={[0, totalKm]}
              ticks={distanceTicks}
              tickFormatter={(value: number) => (value === 0 ? "0" : `${format.compact(value, 3)} km`)}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              minTickGap={24}
            />
            <YAxis
              domain={axis.domain}
              ticks={axis.ticks}
              tickFormatter={(value: number) => `${format.compact(value, 0)} m`}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              width={ELEVATION_AXIS_WIDTH}
            />
            <ChartTooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={<SampleTooltip samples={samples} summary={summary} onActiveSampleChange={reportActiveSample} />}
            />
            <Area
              type="linear"
              dataKey="groundMeters"
              stroke="var(--color-terrain)"
              strokeWidth={1.25}
              fill="var(--color-terrain)"
              fillOpacity={0.24}
              activeDot={false}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="surfaceMeters"
              stroke="var(--color-surface)"
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="sightLineMeters"
              stroke="var(--color-lineOfSight)"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="sightLineMeters"
              stroke="none"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              legendType="none"
              tooltipType="none"
              shape={(curve: CurveProps) => (
                <ProfileMarks
                  curve={curve}
                  samples={samples}
                  summary={summary}
                  highlight={highlight}
                  highlightLabel={highlightLabel}
                  elevationDomain={axis.domain}
                  fullLabels={fullLabels}
                  shortLabels={shortLabels}
                  prefersShortLabels={isCompact}
                  crosshairIndex={crosshairIndex}
                  onExaggerationChange={setExaggeration}
                />
              )}
            />
          </ComposedChart>
        </ChartContainer>
      </div>
    </div>
  );
}
