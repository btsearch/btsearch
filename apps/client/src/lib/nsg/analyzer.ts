import { ANALYZER_MAX_CELLS, AnalyzerImportError, type AnalyzerImportErrorCode } from "../analyzer-import";
import type { AnalyzerCell, ParsedRow } from "../analyzer-parsers";
import { formatNsgTimestamp, parseNsgStream } from "./parser";
import type { NsgCell, NsgProgress } from "./types";

export type NsgAnalyzerImport = {
  rows: ParsedRow[];
  totalCells: number;
  unsupportedCells: number;
  invalidCells: number;
  duplicateCells: number;
};

export type NsgAnalyzerWorkerRequest = { type: "parse"; file: File };
export type NsgAnalyzerWorkerResponse =
  | { type: "progress"; progress: NsgProgress }
  | { type: "complete"; result: NsgAnalyzerImport }
  | { type: "error"; code: AnalyzerImportErrorCode; message: string };

export class AnalyzerCellLimitError extends AnalyzerImportError {
  constructor() {
    super(
      "tooManyCells",
      `This log contains more than ${ANALYZER_MAX_CELLS.toLocaleString("en-US")} distinct analyzable cells. Select a shorter log.`,
    );
  }
}

function integerInRange(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum;
}

function combinedPlmn(mcc: string | null, mnc: string | null): number | null {
  if (mcc === null || mnc === null || !/^\d{3}$/.test(mcc) || !/^\d{1,2}$/.test(mnc) || Number(mcc) === 0) return null;
  return Number(mcc) * 100 + Number(mnc);
}

export function mapNsgAnalyzerCell(cell: NsgCell): AnalyzerCell | null {
  const mnc = combinedPlmn(cell.mcc, cell.mnc);
  if (mnc === null) return null;

  if (cell.rat === "LTE") {
    if (!integerInRange(cell.eci, 0x0fffffff) || !integerInRange(cell.tac, 0xffff) || !integerInRange(cell.pci, 503)) return null;
    return {
      rat: "LTE",
      mnc,
      tac: cell.tac,
      enbid: Math.floor(cell.eci / 256),
      clid: cell.eci % 256,
      pci: cell.pci,
      ...(integerInRange(cell.earfcn, 262143) ? { earfcn: cell.earfcn } : {}),
    };
  }

  if (cell.rat === "GSM") {
    if (!integerInRange(cell.cid, 0xffff) || !integerInRange(cell.lac, 0xffff)) return null;
    return { rat: "GSM", mnc, cid: cell.cid, lac: cell.lac };
  }

  if (cell.rat === "UMTS" || cell.rat === "WCDMA") {
    const rnc = cell.raw.rnc;
    if (!integerInRange(cell.cid, 0xffff) || !integerInRange(cell.lac, 0xffff) || !integerInRange(rnc, 0xfff)) return null;
    return {
      rat: "UMTS",
      mnc,
      cid: cell.cid,
      lac: cell.lac,
      rnc,
      ...(integerInRange(cell.uarfcn, 16383) ? { uarfcn: cell.uarfcn } : {}),
    };
  }

  return null;
}

export async function parseNsgAnalyzerStream(
  stream: ReadableStream<Uint8Array>,
  source: { name: string; size: number },
  onProgress?: (progress: NsgProgress) => void,
): Promise<NsgAnalyzerImport> {
  const rows = new Map<string, ParsedRow>();
  const counts = { totalCells: 0, unsupportedCells: 0, invalidCells: 0, duplicateCells: 0 };
  await parseNsgStream(stream, source, onProgress, {
    retainHistory: false,
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
  });
  return { rows: [...rows.values()], ...counts };
}
