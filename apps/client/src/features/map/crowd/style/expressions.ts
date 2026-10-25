import type { ExpressionSpecification } from "maplibre-gl";

import { type CrowdTheme, LEVEL_COLORS, MY_TRAIL_BUCKETS, MY_TRAIL_COLORS, NO_SINR_COLORS, NO_SINR_OPACITY, SINR_COLORS, toRgba } from "./palette";

type ColorOutput = string | ExpressionSpecification;

export const SHOWN_SQUARE_OPACITY = 0.85;
const LOWEST_LEVEL_ALPHA = 0.18;
const LEVEL_ALPHA_STEP = 0.1;
const HIGHEST_LEVEL = 7;

export function matchNumber(property: string, cases: readonly (readonly [number, ColorOutput])[], fallback: string): ExpressionSpecification {
  if (cases.length === 0) return ["to-color", fallback];
  return ["match", ["get", property], ...cases.flat(), fallback] as unknown as ExpressionSpecification;
}

function matchBucketColor(property: string, colors: readonly string[]): ExpressionSpecification {
  return matchNumber(
    property,
    colors.map((color, bucket) => [bucket, color] as const),
    colors[0],
  );
}

export function levelColor(theme: CrowdTheme): ExpressionSpecification {
  return matchBucketColor("level", LEVEL_COLORS[theme]);
}

export function sinrColor(theme: CrowdTheme): ExpressionSpecification {
  const noSinr = toRgba(NO_SINR_COLORS[theme], NO_SINR_OPACITY / SHOWN_SQUARE_OPACITY);
  return ["case", ["has", "sinr"], matchBucketColor("sinr", SINR_COLORS[theme]), noSinr];
}

export function myTrailColor(theme: CrowdTheme): ExpressionSpecification {
  const color = MY_TRAIL_COLORS[theme];
  const [few, some, many] = MY_TRAIL_BUCKETS;
  return [
    "step",
    ["get", "samples"],
    toRgba(color, few.alpha),
    some.minSamples,
    toRgba(color, some.alpha),
    many.minSamples,
    toRgba(color, many.alpha),
  ];
}

export function cellLevelColor(color: string): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["get", "level"],
    0,
    toRgba(color, LOWEST_LEVEL_ALPHA),
    HIGHEST_LEVEL,
    toRgba(color, LOWEST_LEVEL_ALPHA + HIGHEST_LEVEL * LEVEL_ALPHA_STEP),
  ];
}
