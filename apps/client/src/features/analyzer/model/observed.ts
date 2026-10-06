import type { ObservedCell } from "@openbts/shared/contract";

import { ANALYZER_NR_MAX } from "@/lib/analyzer/analyzerImport";
import type { ParsedRow } from "@/lib/analyzer/analyzerParsers";

type ObservedUmtsCell = Extract<ObservedCell, { rat: "umts" }>;
type ObservedLteCell = Extract<ObservedCell, { rat: "lte" }>;
type ObservedNrCell = Extract<ObservedCell, { rat: "nr" }>;

const OBSERVED_PLMN_PATTERN = /^\d{5,6}$/;
const OBSERVED_GSM_MAX = { lac: 65_535, cid: 65_535 } as const;
const OBSERVED_UMTS_MAX = { lac: 65_535, cid: 65_535, rnc: 65_535, uarfcn: 16_383 } as const;
const OBSERVED_LTE_MAX = { enbid: 1_048_575, clid: 255, tac: 65_535, pci: 503, earfcn: 262_143 } as const;
const OBSERVED_NR_MAX = ANALYZER_NR_MAX;
const UNWRITTEN_RNC = 0;

function isWithin(value: number | null | undefined, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

function toObservedUmtsCell(row: Extract<ParsedRow, { rat: "UMTS" }>, plmn: string): ObservedCell | null {
  if (!isWithin(row.lac, OBSERVED_UMTS_MAX.lac) || !isWithin(row.cid, OBSERVED_UMTS_MAX.cid)) return null;

  const cell: ObservedUmtsCell = { rat: "umts", plmn, lac: row.lac, cid: row.cid };
  if (isWithin(row.rnc, OBSERVED_UMTS_MAX.rnc) && row.rnc !== UNWRITTEN_RNC) cell.rnc = row.rnc;
  if (isWithin(row.uarfcn, OBSERVED_UMTS_MAX.uarfcn)) cell.uarfcn = row.uarfcn;
  return cell;
}

function toObservedLteCell(row: Extract<ParsedRow, { rat: "LTE" }>, plmn: string): ObservedCell | null {
  if (!isWithin(row.enbid, OBSERVED_LTE_MAX.enbid) || !isWithin(row.clid, OBSERVED_LTE_MAX.clid)) return null;

  const cell: ObservedLteCell = { rat: "lte", plmn, enbid: row.enbid, clid: row.clid };
  if (isWithin(row.tac, OBSERVED_LTE_MAX.tac)) cell.tac = row.tac;
  if (isWithin(row.pci, OBSERVED_LTE_MAX.pci)) cell.pci = row.pci;
  if (isWithin(row.earfcn, OBSERVED_LTE_MAX.earfcn)) cell.earfcn = row.earfcn;
  return cell;
}

function toObservedNrCell(row: Extract<ParsedRow, { rat: "NR" }>, plmn: string): ObservedCell {
  const cell: ObservedNrCell = { rat: "nr", plmn };
  if (isWithin(row.nci, OBSERVED_NR_MAX.nci)) cell.nci = row.nci;
  if (isWithin(row.tac, OBSERVED_NR_MAX.tac)) cell.tac = row.tac;
  if (isWithin(row.pci, OBSERVED_NR_MAX.pci)) cell.pci = row.pci;
  if (isWithin(row.arfcn, OBSERVED_NR_MAX.arfcn)) cell.arfcn = row.arfcn;
  return cell;
}

export function toObservedCell(row: ParsedRow): ObservedCell | null {
  const plmn = row.plmn ?? String(row.mnc);
  if (!OBSERVED_PLMN_PATTERN.test(plmn)) return null;

  if (row.rat === "GSM") {
    if (!isWithin(row.lac, OBSERVED_GSM_MAX.lac) || !isWithin(row.cid, OBSERVED_GSM_MAX.cid)) return null;
    return { rat: "gsm", plmn, lac: row.lac, cid: row.cid };
  }
  if (row.rat === "UMTS") return toObservedUmtsCell(row, plmn);
  if (row.rat === "LTE") return toObservedLteCell(row, plmn);
  return toObservedNrCell(row, plmn);
}

export function getObservedChannel(cell: ObservedCell): number | null {
  if (cell.rat === "lte") return cell.earfcn ?? null;
  if (cell.rat === "umts") return cell.uarfcn ?? null;
  if (cell.rat === "nr") return cell.arfcn ?? null;
  return null;
}
