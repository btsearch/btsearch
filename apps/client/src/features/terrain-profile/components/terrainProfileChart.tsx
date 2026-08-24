import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, type TooltipContentProps, XAxis, YAxis } from "recharts";

import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

import type { TerrainProfileSample } from "../types";

type TerrainProfileChartProps = {
  samples: TerrainProfileSample[];
  bullingtonDistanceKm: number | null;
  totalPathDistanceM: number;
  onHoverSample: (sample: TerrainProfileSample | null) => void;
};

type ChartSample = TerrainProfileSample & {
  sourceSample: TerrainProfileSample;
  distanceKm: number;
  obstructionElevationM: number | null;
};

const chartConfig = {
  terrain: { color: "var(--muted-foreground)" },
  surface: { color: "var(--chart-3)" },
  lineOfSight: { color: "var(--primary)" },
  obstruction: { color: "var(--destructive)" },
} satisfies ChartConfig;

function isBlocked(sample: TerrainProfileSample | undefined) {
  return (
    sample !== undefined &&
    ((sample.surface_clearance_m !== null && sample.surface_clearance_m < 0) ||
      (sample.terrain_clearance_m !== null && sample.terrain_clearance_m < 0))
  );
}

function endpointHeightAgl(sample: TerrainProfileSample | undefined): number | null {
  if (sample === undefined || sample.line_of_sight_elevation_m === null || sample.terrain_elevation_m === null) return null;
  return Math.max(0, sample.line_of_sight_elevation_m - sample.terrain_elevation_m);
}

function formatMeters(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)} m`;
}

function isChartSample(value: unknown): value is ChartSample {
  return typeof value === "object" && value !== null && "sourceSample" in value && "distanceKm" in value;
}

function ProfileTooltip({ active, payload }: Partial<TooltipContentProps>) {
  const { t } = useTranslation("terrainProfile");
  const sample = payload?.map((entry) => entry.payload).find(isChartSample);
  if (!active || sample === undefined) return null;

  const clearanceM = sample.surface_clearance_m ?? sample.terrain_clearance_m;
  const blocked = isBlocked(sample);

  return (
    <div className="grid min-w-44 gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-2 text-xs shadow-xl">
      <div className="font-semibold tabular-nums">{t("chart.distance", { value: sample.distanceKm.toFixed(2) })}</div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">{t("chart.series.terrainElevationM")}</dt>
        <dd className="font-mono font-medium tabular-nums">{formatMeters(sample.terrain_elevation_m)}</dd>
        <dt className="text-muted-foreground">{t("chart.series.surfaceElevationM")}</dt>
        <dd className="font-mono font-medium tabular-nums">{formatMeters(sample.surface_elevation_m)}</dd>
        <dt className="text-muted-foreground">{t("chart.series.lineOfSightElevationM")}</dt>
        <dd className="font-mono font-medium tabular-nums">{formatMeters(sample.line_of_sight_elevation_m)}</dd>
        <dt className={cn("text-muted-foreground", blocked && "font-medium text-destructive")}>{t("chart.clearance")}</dt>
        <dd className={cn("font-mono font-medium tabular-nums", blocked && "text-destructive")}>{formatMeters(clearanceM)}</dd>
      </dl>
    </div>
  );
}

function LegendItem({ color, label, kind }: { color: string; label: string; kind: "fill" | "line" }) {
  return (
    <li className="flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden="true"
        className={cn("block w-4", kind === "fill" && "h-2 rounded-sm", kind === "line" && "h-0.5")}
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </li>
  );
}

export default function TerrainProfileChart({ samples, bullingtonDistanceKm, totalPathDistanceM, onHoverSample }: TerrainProfileChartProps) {
  const { t } = useTranslation("terrainProfile");
  const profile = useMemo(() => {
    const totalDistanceM = samples.reduce((maximum, sample) => Math.max(maximum, sample.distance_m), 0);
    const data = [...samples].reverse().map<ChartSample>((sample, displayIndex) => {
      const sourceIndex = samples.length - displayIndex - 1;
      const extendsObstruction = [sourceIndex - 1, sourceIndex, sourceIndex + 1].some((index) => isBlocked(samples[index]));

      return {
        ...sample,
        sourceSample: sample,
        distanceKm: (totalDistanceM - sample.distance_m) / 1000,
        obstructionElevationM: extendsObstruction ? (sample.surface_elevation_m ?? sample.terrain_elevation_m) : null,
      };
    });
    const elevations = data.flatMap((sample) =>
      [sample.terrain_elevation_m, sample.surface_elevation_m, sample.line_of_sight_elevation_m].filter((value): value is number => value !== null),
    );
    const minimumElevationM = elevations.length === 0 ? 0 : Math.min(...elevations);
    const maximumElevationM = elevations.length === 0 ? 1 : Math.max(...elevations);
    const domainPaddingM = Math.max(2, (maximumElevationM - minimumElevationM) * 0.08);

    return {
      data,
      totalDistanceKm: totalDistanceM / 1000,
      yDomain: [Math.floor(minimumElevationM - domainPaddingM), Math.ceil(maximumElevationM + domainPaddingM)] as [number, number],
      receiverHeightAglM: endpointHeightAgl(samples.at(-1)),
      stationHeightAglM: endpointHeightAgl(samples[0]),
    };
  }, [samples]);
  const receiverSample = profile.data[0];
  const stationSample = profile.data.at(-1);
  const lastHoveredIndexRef = useRef<number | null>(null);

  return (
    <div className="flex h-80 w-full flex-col">
      <p className="sr-only" id="terrain-profile-chart-description">
        {t("chart.description")}
      </p>
      <div className="mb-2 grid gap-1 px-1">
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label={t("chart.legend.label")}>
          <LegendItem color="var(--muted-foreground)" label={t("chart.legend.terrain")} kind="fill" />
          <LegendItem color="var(--chart-3)" label={t("chart.legend.surface")} kind="line" />
          <LegendItem color="var(--primary)" label={t("chart.legend.lineOfSight")} kind="line" />
          <LegendItem color="var(--destructive)" label={t("chart.legend.obstruction")} kind="line" />
        </ul>
      </div>
      <ChartContainer
        config={chartConfig}
        className="min-h-0 w-full flex-1"
        style={{ aspectRatio: "auto" }}
        role="img"
        aria-label={t("chart.label")}
        aria-describedby="terrain-profile-chart-description"
      >
        <ComposedChart
          accessibilityLayer
          data={profile.data}
          margin={{ top: 28, right: 48, bottom: 4, left: 4 }}
          onMouseMove={(state) => {
            const rawIndex = state?.activeTooltipIndex;
            const index = typeof rawIndex === "number" ? rawIndex : Number(rawIndex);
            const nextIndex = Number.isInteger(index) ? index : null;
            if (lastHoveredIndexRef.current === nextIndex) return;
            lastHoveredIndexRef.current = nextIndex;
            onHoverSample(nextIndex === null ? null : (profile.data[nextIndex]?.sourceSample ?? null));
          }}
          onMouseLeave={() => {
            lastHoveredIndexRef.current = null;
            onHoverSample(null);
          }}
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="distanceKm"
            type="number"
            domain={[0, profile.totalDistanceKm]}
            tickFormatter={(value: number) => `${value === 0 ? "0" : value.toFixed(value < 10 ? 1 : 0)} km`}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            minTickGap={24}
          />
          <YAxis
            domain={profile.yDomain}
            tickFormatter={(value: number) => `${Math.round(value)} m`}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            width={48}
            allowDecimals={false}
          />
          <ChartTooltip cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }} content={<ProfileTooltip />} />
          <Area
            type="monotone"
            dataKey="terrain_elevation_m"
            stroke="var(--color-terrain)"
            strokeWidth={1.25}
            fill="var(--color-terrain)"
            fillOpacity={0.24}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="surface_elevation_m"
            stroke="var(--color-surface)"
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="line_of_sight_elevation_m"
            stroke="var(--color-lineOfSight)"
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="obstructionElevationM"
            stroke="var(--color-obstruction)"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={{ r: 1.75, fill: "var(--color-obstruction)", strokeWidth: 0 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          {bullingtonDistanceKm !== null && totalPathDistanceM > 0 ? (
            <ReferenceLine
              x={(totalPathDistanceM - bullingtonDistanceKm * 1000) / 1000}
              stroke="var(--destructive)"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              strokeWidth={1}
            />
          ) : null}
          {receiverSample?.line_of_sight_elevation_m !== null && receiverSample?.line_of_sight_elevation_m !== undefined ? (
            <ReferenceDot
              x={0}
              y={receiverSample.line_of_sight_elevation_m}
              r={4}
              fill="var(--color-lineOfSight)"
              stroke="var(--background)"
              strokeWidth={2}
              label={{
                value: t("chart.endpoints.receiver", {
                  height: profile.receiverHeightAglM === null ? "—" : profile.receiverHeightAglM.toFixed(1),
                }),
                position: "insideTopLeft",
                fill: "var(--foreground)",
                fontWeight: 600,
                fontSize: 11,
                offset: 8,
              }}
            />
          ) : null}
          {stationSample?.line_of_sight_elevation_m !== null && stationSample?.line_of_sight_elevation_m !== undefined ? (
            <ReferenceDot
              x={profile.totalDistanceKm}
              y={stationSample.line_of_sight_elevation_m}
              r={4}
              fill="var(--foreground)"
              stroke="var(--background)"
              strokeWidth={2}
              label={{
                value: t("chart.endpoints.station", {
                  height: profile.stationHeightAglM === null ? "—" : profile.stationHeightAglM.toFixed(1),
                }),
                position: "insideTopRight",
                fill: "var(--foreground)",
                fontWeight: 600,
                fontSize: 11,
                offset: 8,
              }}
            />
          ) : null}
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}
