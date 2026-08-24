const MIN_ELEVATION_COVERAGE_RATIO = 0.95;
const MAX_INTERPOLATION_GAP_M = 100;

export function fillReliableElevations(values: (number | null)[], effectiveResolutionM: number): number[] | null {
  if (values.length < 2 || !Number.isFinite(effectiveResolutionM) || effectiveResolutionM <= 0) return null;
  if (values[0] === null || values.at(-1) === null) return null;

  let knownCount = 0;
  let currentGap = 0;
  let maximumGap = 0;
  for (const value of values) {
    if (value === null) {
      currentGap++;
      maximumGap = Math.max(maximumGap, currentGap);
      continue;
    }
    if (!Number.isFinite(value)) return null;
    knownCount++;
    currentGap = 0;
  }

  if (knownCount / values.length < MIN_ELEVATION_COVERAGE_RATIO || maximumGap * effectiveResolutionM > MAX_INTERPOLATION_GAP_M) return null;

  const filled = values.map((value) => value ?? Number.NaN);
  let previousKnownIndex = 0;
  for (let nextKnownIndex = 1; nextKnownIndex < values.length; nextKnownIndex++) {
    const nextValue = values[nextKnownIndex];
    if (nextValue === null || nextValue === undefined) continue;
    const previousValue = values[previousKnownIndex]!;
    const gapLength = nextKnownIndex - previousKnownIndex;
    for (let offset = 1; offset < gapLength; offset++) {
      const ratio = offset / gapLength;
      filled[previousKnownIndex + offset] = previousValue + (nextValue - previousValue) * ratio;
    }
    previousKnownIndex = nextKnownIndex;
  }
  return filled;
}
