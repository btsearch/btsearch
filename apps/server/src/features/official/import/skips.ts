export type SkipCounts = Map<string, Map<string, number>>;
export type SkipRow = { slice: string; reason: string; recordCount: number };

export function countSkip(skips: SkipCounts, slice: string, reason: string, records = 1): void {
  if (records === 0) return;

  const reasons = skips.get(slice);
  if (reasons) reasons.set(reason, (reasons.get(reason) ?? 0) + records);
  else skips.set(slice, new Map([[reason, records]]));
}

export function skipRows(skips: SkipCounts, coveredSlices: readonly string[]): SkipRow[] {
  const rows: SkipRow[] = [];
  for (const [slice, reasons] of skips) {
    if (!coveredSlices.includes(slice)) throw new Error(`Records were skipped for the slice "${slice}", which the release does not cover`);
    for (const [reason, recordCount] of reasons) rows.push({ slice, reason, recordCount });
  }

  return rows;
}
