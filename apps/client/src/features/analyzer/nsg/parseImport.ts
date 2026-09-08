import { ANALYZER_MAX_CELLS, AnalyzerImportError } from "@/lib/analyzer/analyzer-import";
import type { ParsedRow } from "@/lib/analyzer/analyzer-parsers";
import { formatNsgTimestamp, parseNsg } from "@/lib/nsg-parser";
import type { NsgProgress, NsgSource } from "@/lib/nsg-parser/model";

import { mapNsgAnalyzerCell } from "./cellAdapter";

export type NsgAnalyzerImport = {
  rows: ParsedRow[];
  totalCells: number;
  unsupportedCells: number;
  invalidCells: number;
  duplicateCells: number;
};

export class AnalyzerCellLimitError extends AnalyzerImportError {
  constructor() {
    super(
      "tooManyCells",
      `This log contains more than ${ANALYZER_MAX_CELLS.toLocaleString("en-US")} distinct analyzable cells. Select a shorter log.`,
    );
  }
}

export async function parseNsgAnalyzerStream(
  stream: ReadableStream<Uint8Array>,
  source: NsgSource,
  onProgress?: (progress: NsgProgress) => void,
): Promise<NsgAnalyzerImport> {
  const rows = new Map<string, ParsedRow>();
  const counts = { totalCells: 0, unsupportedCells: 0, invalidCells: 0, duplicateCells: 0 };
  await parseNsg(
    { stream, source },
    {
      onProgress,
      mode: "streaming",
      onCell(cell) {
        counts.totalCells++;
        if (cell.rat !== "LTE" && cell.rat !== "GSM" && cell.rat !== "UMTS" && cell.rat !== "WCDMA") {
          counts.unsupportedCells++;
          return;
        }
        const mapped = mapNsgAnalyzerCell(cell);
        if (mapped === null) {
          counts.invalidCells++;
          return;
        }
        const key = JSON.stringify(mapped);
        if (rows.has(key)) counts.duplicateCells++;
        else if (rows.size === ANALYZER_MAX_CELLS) throw new AnalyzerCellLimitError();
        rows.set(key, { ...mapped, description: "NSG", rawLine: `NSG ${formatNsgTimestamp(cell.timestampUs)} ${key}` });
      },
    },
  );
  return { rows: [...rows.values()], ...counts };
}
