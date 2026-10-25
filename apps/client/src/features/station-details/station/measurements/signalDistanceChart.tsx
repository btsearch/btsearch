import { formatDistance } from "@/lib/format";

export type DistanceRing = {
  fromMeters: number;
  toMeters: number;
  value: number;
};

type ChartScale = {
  top: number;
  span: number;
  ticks: readonly number[];
};

type SignalDistanceChartProps = {
  caption: string;
  summary: string;
  rings: readonly DistanceRing[];
  maxMeters: number;
  scale: ChartScale;
  formatValue: (value: number) => string;
  language: string;
};

export const LEVEL_CHART_SCALE: ChartScale = { top: -55, span: 70, ticks: [-60, -80, -100, -120] };
export const SINR_CHART_SCALE: ChartScale = { top: 25, span: 30, ticks: [20, 10, 0] };

const WIDTH = 300;
const HEIGHT = 120;
const PLOT_LEFT = 34;
const PLOT_RIGHT = WIDTH - 8;
const PLOT_TOP = 8;
const PLOT_HEIGHT = 92;
const AXIS_Y = PLOT_TOP + PLOT_HEIGHT;
const VALUE_LABEL_X = 28;
const VALUE_LABEL_SHIFT = 3.5;
const DISTANCE_LABEL_Y = 114;
const DISTANCE_STEPS_METERS = [250, 500, 1000, 2000, 5000, 10000, 20000, 50000];
const MAX_DISTANCE_INTERVALS = 4;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function pickDistanceStep(maxMeters: number): number {
  return DISTANCE_STEPS_METERS.find((step) => maxMeters / step <= MAX_DISTANCE_INTERVALS) ?? DISTANCE_STEPS_METERS[DISTANCE_STEPS_METERS.length - 1];
}

export function SignalDistanceChart({ caption, summary, rings, maxMeters, scale, formatValue, language }: SignalDistanceChartProps) {
  const xOf = (meters: number) => round(PLOT_LEFT + (meters / maxMeters) * (PLOT_RIGHT - PLOT_LEFT));
  const yOf = (value: number) => {
    const share = Math.min(1, Math.max(0, (scale.top - value) / scale.span));
    return round(PLOT_TOP + share * PLOT_HEIGHT);
  };
  const step = pickDistanceStep(maxMeters);
  const distanceTicks = Array.from({ length: Math.floor(maxMeters / step) + 1 }, (_, index) => index * step);
  const points = rings.map((ring) => ({ ring, x: xOf((ring.fromMeters + ring.toMeters) / 2), y: yOf(ring.value) }));

  return (
    <figure className="min-w-0">
      <figcaption className="text-xs leading-4 font-medium text-muted-foreground">{caption}</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={summary} className="mt-1.5 block w-full overflow-visible">
        {scale.ticks.map((tick) => (
          <line key={tick} x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={yOf(tick)} y2={yOf(tick)} className="stroke-border/60" />
        ))}
        <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={AXIS_Y} y2={AXIS_Y} className="stroke-border" />
        {scale.ticks.map((tick) => (
          <text key={tick} x={VALUE_LABEL_X} y={yOf(tick) + VALUE_LABEL_SHIFT} textAnchor="end" fontSize="10" className="fill-muted-foreground">
            {tick}
          </text>
        ))}
        {distanceTicks.map((meters) => (
          <text key={meters} x={xOf(meters)} y={DISTANCE_LABEL_Y} textAnchor="middle" fontSize="10" className="fill-muted-foreground">
            {meters === 0 ? "0" : formatDistance(meters, language)}
          </text>
        ))}
        <polyline
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ stroke: "var(--sector-color)" }}
        />
        {points.map((point) => (
          <circle
            key={point.ring.fromMeters}
            cx={point.x}
            cy={point.y}
            r="4"
            strokeWidth="2"
            className="stroke-popover"
            style={{ fill: "var(--sector-color)" }}
          >
            <title>{`${point.ring.fromMeters}-${point.ring.toMeters} m: ${formatValue(point.ring.value)}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}
