import type { AnalyzerCell } from "@/lib/analyzer/analyzer-parsers";
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
    if (!integerInRange(cell.cid, 0xffff) || !integerInRange(cell.lac, 0xffff) || !integerInRange(cell.rnc, 0xfff)) return null;
    return {
      rat: "UMTS",
      mnc,
      cid: cell.cid,
      lac: cell.lac,
      rnc: cell.rnc,
      ...(integerInRange(cell.uarfcn, 16383) ? { uarfcn: cell.uarfcn } : {}),
    };
  }

  return null;
}
