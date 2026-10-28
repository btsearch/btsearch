const PERCENT = 100;

export function toPercent(part: number, whole: number): number {
  return whole > 0 ? (part * PERCENT) / whole : 0;
}

export function formatPercent(percent: number, language: string, fractionDigits = 2): string {
  const smallestShown = 10 ** -fractionDigits;
  const format = (value: number) =>
    (value / PERCENT).toLocaleString(language, { style: "percent", minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });

  if (percent > 0 && percent < smallestShown) return `<${format(smallestShown)}`;
  return format(percent);
}
