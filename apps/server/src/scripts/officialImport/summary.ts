import type { DryRunReport, SliceReport } from "../../features/official/import/report.js";

export type RunSummary = Pick<DryRunReport, "slices" | "failedDatasets" | "afterStepChanges">;

function countsText(counts: Record<string, number | undefined>): string {
  return Object.entries(counts)
    .map(([name, count]) => `${name} ${count}`)
    .join(", ");
}

function sliceLine({ datasetKey, slice, outcome, stagedCount, liveCount, changes, skipped }: SliceReport): string {
  const skippedText = countsText(skipped);
  const counted = `${datasetKey} "${slice}": ${outcome}, staged ${stagedCount}, live ${liveCount}`;

  return [counted, countsText(changes), skippedText && `skipped ${skippedText}`].filter(Boolean).join("; ");
}

export function summaryLines({ slices, failedDatasets, afterStepChanges }: RunSummary): string[] {
  const lines = slices.map(sliceLine);
  for (const { datasetKey, error } of failedDatasets) lines.push(`${datasetKey} failed: ${error}`);
  if (Object.keys(afterStepChanges).length > 0) lines.push(`after the slices: ${countsText(afterStepChanges)}`);

  return lines;
}

export function rehearsalLines({ siteNames, licenseeNamesCorrected }: Pick<DryRunReport, "siteNames" | "licenseeNamesCorrected">): string[] {
  return [
    `station names: ${siteNames.written} would be written, ${siteNames.skipped} skipped`,
    `licensee short names: ${licenseeNamesCorrected} would be corrected`,
    "nothing was written; run again with --apply to import",
  ];
}
