import { ANALYZER_NR_MAX } from "@/lib/analyzer/analyzerImport";
import type { AnalyzerCell } from "@/lib/analyzer/analyzerParsers";
import type { NsgCell } from "@/lib/nsg-parser/model";
import { resolveCellOperator } from "@/lib/nsg-parser/operators";

function integerInRange(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum;
}

export function mapNsgAnalyzerCell(cell: NsgCell): AnalyzerCell | null {
  const operator = resolveCellOperator(cell);
  if (operator === null) return null;
  const mnc = Number(operator.plmn);

  if (cell.rat === "LTE") {
    if (!integerInRange(cell.eci, 0x0fffffff) || !integerInRange(cell.tac, 0xffff) || !integerInRange(cell.pci, 503)) return null;
    const mapped: Extract<AnalyzerCell, { rat: "LTE" }> = {
      rat: "LTE",
      mnc,
      tac: cell.tac,
      enbid: Math.floor(cell.eci / 256),
      clid: cell.eci % 256,
      pci: cell.pci,
    };
    if (integerInRange(cell.earfcn, 262143)) mapped.earfcn = cell.earfcn;
    return mapped;
  }

  if (cell.rat === "GSM") {
    if (!integerInRange(cell.cid, 0xffff) || !integerInRange(cell.lac, 0xffff)) return null;
    return { rat: "GSM", mnc, cid: cell.cid, lac: cell.lac };
  }

  if (cell.rat === "UMTS" || cell.rat === "WCDMA") {
    if (!integerInRange(cell.cid, 0xffff) || !integerInRange(cell.lac, 0xffff) || !integerInRange(cell.rnc, 0xfff)) return null;
    const mapped: Extract<AnalyzerCell, { rat: "UMTS" }> = { rat: "UMTS", mnc, cid: cell.cid, lac: cell.lac, rnc: cell.rnc };
    if (integerInRange(cell.uarfcn, 16383)) mapped.uarfcn = cell.uarfcn;
    return mapped;
  }

  return null;
}

export function mapNsgNrCell(cell: NsgCell): AnalyzerCell | null {
  if (cell.rat !== "NR" || !integerInRange(cell.nci, ANALYZER_NR_MAX.nci)) return null;
  const operator = resolveCellOperator(cell);
  if (operator === null) return null;

  const mapped: Extract<AnalyzerCell, { rat: "NR" }> = { rat: "NR", mnc: Number(operator.plmn), nci: cell.nci };
  if (integerInRange(cell.tac, ANALYZER_NR_MAX.tac)) mapped.tac = cell.tac;
  if (integerInRange(cell.pci, ANALYZER_NR_MAX.pci)) mapped.pci = cell.pci;
  if (integerInRange(cell.arfcn, ANALYZER_NR_MAX.arfcn)) mapped.arfcn = cell.arfcn;
  return mapped;
}

export function readNsgCellPlmn(cell: NsgCell): string | null {
  return resolveCellOperator(cell)?.plmn ?? null;
}
