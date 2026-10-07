import { mapNsgAnalyzerCell, mapNsgNrCell, readNsgCellPlmn } from "./cellAdapter";
import { ANALYZER_MAX_CELLS, AnalyzerImportError } from "@/lib/analyzer/analyzerImport";
import type { ParsedRow } from "@/lib/analyzer/analyzerParsers";
import { formatNsgTimestamp, parseNsg } from "@/lib/nsg-parser";
import type { NsgProgress, NsgSource } from "@/lib/nsg-parser/model";

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
      allowIncompleteFinalRecord: true,
      onCell(cell) {
        counts.totalCells++;
        if (cell.rat !== "LTE" && cell.rat !== "GSM" && cell.rat !== "UMTS" && cell.rat !== "WCDMA" && cell.rat !== "NR") {
          counts.unsupportedCells++;
          return;
        }
        const mapped = cell.rat === "NR" ? mapNsgNrCell(cell) : mapNsgAnalyzerCell(cell);
        if (mapped === null) {
          counts.invalidCells++;
          return;
        }
        const key = JSON.stringify(mapped);
        if (rows.has(key)) counts.duplicateCells++;
        else if (rows.size === ANALYZER_MAX_CELLS) throw new AnalyzerCellLimitError();
        const row: ParsedRow = { ...mapped, description: "NSG", rawLine: `NSG ${formatNsgTimestamp(cell.timestampUs)} ${key}` };
        const plmn = readNsgCellPlmn(cell);
        if (plmn !== null) row.plmn = plmn;
        rows.set(key, row);
      },
    },
  );
  return { rows: [...rows.values()], ...counts };
}
