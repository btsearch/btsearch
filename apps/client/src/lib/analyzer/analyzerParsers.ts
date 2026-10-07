import { ANALYZER_NR_MAX } from "./analyzerImport";

export type AnalyzerCell =
  | { rat: "GSM"; mnc: number; lac: number; cid: number }
  | { rat: "UMTS"; mnc: number; lac: number; cid: number; rnc: number | null; uarfcn?: number }
  | { rat: "LTE"; mnc: number; tac: number; enbid: number; clid: number; pci: number; earfcn?: number }
  | { rat: "NR"; mnc: number; arfcn?: number; nci?: number; tac?: number; pci?: number };
export type ParsedRow = AnalyzerCell & { description: string; rawLine: string; plmn?: string };
export type AnalyzerTextFormat = "ntm" | "netmonitor";
export type FileFormat = AnalyzerTextFormat | "nsg";

type UmtsRow = Extract<ParsedRow, { rat: "UMTS" }>;
type LteRow = Extract<ParsedRow, { rat: "LTE" }>;
type NrRow = Extract<ParsedRow, { rat: "NR" }>;
type NrLineTexts = { nci: string | undefined; tac: string | undefined; pci: string | undefined; arfcn: string | undefined };

const MCC_PATTERN = /^\d{3}$/;
const MNC_PATTERN = /^\d{1,3}$/;
const SHORTEST_MNC_LENGTH = 2;
const WHOLE_NUMBER_PATTERN = /^\d+$/;
const NTM_UNKNOWN_VALUE = 2_147_483_647;

function withLinePlmn(row: ParsedRow, mccText: string, mncText: string): ParsedRow {
  const mcc = mccText.trim();
  const mnc = mncText.trim();
  if (MCC_PATTERN.test(mcc) && MNC_PATTERN.test(mnc)) row.plmn = mcc + mnc.padStart(SHORTEST_MNC_LENGTH, "0");
  return row;
}

function readWholeNumber(text: string | undefined, max: number): number | null {
  const digits = text?.trim() ?? "";
  if (!WHOLE_NUMBER_PATTERN.test(digits)) return null;
  const value = Number(digits);
  return value <= max ? value : null;
}

function withNrLineValues(row: NrRow, texts: NrLineTexts, unknownNci?: number): NrRow {
  const nci = readWholeNumber(texts.nci, ANALYZER_NR_MAX.nci);
  const tac = readWholeNumber(texts.tac, ANALYZER_NR_MAX.tac);
  const pci = readWholeNumber(texts.pci, ANALYZER_NR_MAX.pci);
  const arfcn = readWholeNumber(texts.arfcn, ANALYZER_NR_MAX.arfcn);
  if (nci !== null && nci !== unknownNci) row.nci = nci;
  if (tac !== null) row.tac = tac;
  if (pci !== null) row.pci = pci;
  if (arfcn !== null) row.arfcn = arfcn;
  return row;
}

export function getAnalyzerFormatLabel(format: FileFormat | null): string {
  if (format === "nsg") return "NSG";
  if (format === "netmonitor") return "NetMonitor";
  return "NetMonster";
}

const NTM_RAT_MAP: Record<string, AnalyzerCell["rat"]> = {
  "2G": "GSM",
  "3G": "UMTS",
  "4G": "LTE",
  "5G": "NR",
};

function parseNtmLine(line: string): ParsedRow | null {
  const parts = line.split(";");
  if (parts.length < 8) return null;

  const rat = NTM_RAT_MAP[parts[0]];
  if (!rat) return null;

  const mcc = Number.parseInt(parts[1], 10);
  const mncRaw = Number.parseInt(parts[2], 10);
  const description = parts[9] ?? "";

  if (Number.isNaN(mcc) || Number.isNaN(mncRaw)) return null;
  const mnc = mcc * 100 + mncRaw;

  if (rat === "GSM" && parts.length >= 7) {
    const cid = Number.parseInt(parts[3], 10);
    const lac = Number.parseInt(parts[4], 10);
    if (Number.isNaN(cid) || Number.isNaN(lac)) return null;
    return withLinePlmn({ rat: "GSM", mnc, cid, lac, description, rawLine: line }, parts[1], parts[2]);
  }

  if (rat === "UMTS" && parts.length >= 7) {
    const cid = Number.parseInt(parts[3], 10);
    const lac = Number.parseInt(parts[4], 10);
    const rnc = Number.parseInt(parts[5], 10);
    if (Number.isNaN(cid) || Number.isNaN(lac) || Number.isNaN(rnc)) return null;
    const uarfcn = Number.parseInt(parts[10], 10);
    const row: UmtsRow = { rat: "UMTS", mnc, cid, lac, rnc, description, rawLine: line };
    if (!Number.isNaN(uarfcn)) row.uarfcn = uarfcn;
    return withLinePlmn(row, parts[1], parts[2]);
  }

  if (rat === "LTE" && parts.length >= 7) {
    const clid = Number.parseInt(parts[3], 10);
    const tac = Number.parseInt(parts[4], 10);
    const enbid = Number.parseInt(parts[5], 10);
    const pci = Number.parseInt(parts[6], 10);
    if (Number.isNaN(clid) || Number.isNaN(tac) || Number.isNaN(enbid) || Number.isNaN(pci)) return null;
    const earfcn = Number.parseInt(parts[10], 10);
    const row: LteRow = { rat: "LTE", mnc, clid, tac, enbid, pci, description, rawLine: line };
    if (!Number.isNaN(earfcn)) row.earfcn = earfcn;
    return withLinePlmn(row, parts[1], parts[2]);
  }

  if (rat === "NR") {
    const texts: NrLineTexts = { nci: parts[3], tac: parts[4], pci: parts[6], arfcn: parts[10] };
    return withLinePlmn(withNrLineValues({ rat: "NR", mnc, description, rawLine: line }, texts, NTM_UNKNOWN_VALUE), parts[1], parts[2]);
  }
  return null;
}

export function parseNtmFile(text: string): ParsedRow[] {
  const lines = text.split("\n");
  const rows: ParsedRow[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const parsed = parseNtmLine(line);
    if (parsed) rows.push(parsed);
  }
  return rows;
}

const NETMONITOR_RAT_MAP: Record<string, "GSM" | "UMTS" | "LTE" | "NR" | null> = {
  G: "GSM",
  W: "UMTS",
  T: "UMTS",
  L: "LTE",
  N: "NR",
  C: null,
};

function parseNetMonitorLine(line: string): ParsedRow | null {
  const parts = line.split(";");
  if (parts.length < 10) return null;

  const networkType = parts[0];
  const rat = NETMONITOR_RAT_MAP[networkType];
  if (!rat) return null;

  const mcc = Number.parseInt(parts[1], 10);
  const mncRaw = Number.parseInt(parts[2], 10);
  if (Number.isNaN(mcc) || Number.isNaN(mncRaw)) return null;
  const mnc = mcc * 100 + mncRaw;

  const lac = Number.parseInt(parts[3], 10);
  const cid = Number.parseInt(parts[4], 10);
  const psc = Number.parseInt(parts[5], 10);
  const arfcn = Number.parseInt(parts[6], 10);
  const description = parts[10] ?? "";

  switch (rat) {
    case "GSM": {
      if (Number.isNaN(lac) || Number.isNaN(cid)) return null;
      return withLinePlmn({ rat: "GSM", mnc, lac, cid, description, rawLine: line }, parts[1], parts[2]);
    }
    case "UMTS": {
      if (Number.isNaN(lac) || Number.isNaN(cid)) return null;
      const rnc = Math.floor(cid / 65536);
      const shortCid = cid % 65536;
      return withLinePlmn({ rat: "UMTS", mnc, lac, cid: shortCid, rnc, description, rawLine: line }, parts[1], parts[2]);
    }
    case "LTE": {
      if (Number.isNaN(lac) || Number.isNaN(cid) || Number.isNaN(psc)) return null;
      const enbid = Math.floor(cid / 256);
      const clid = cid % 256;
      return withLinePlmn({ rat: "LTE", mnc, tac: lac, enbid, clid, pci: psc, earfcn: arfcn, description, rawLine: line }, parts[1], parts[2]);
    }
    case "NR": {
      const texts: NrLineTexts = { nci: parts[4], tac: parts[3], pci: parts[5], arfcn: parts[6] };
      return withLinePlmn(withNrLineValues({ rat: "NR", mnc, description, rawLine: line }, texts), parts[1], parts[2]);
    }
    default:
      return null;
  }
}

export function parseNetMonitorFile(text: string): ParsedRow[] {
  const lines = text.split("\n");
  const rows: ParsedRow[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const parsed = parseNetMonitorLine(line);
    if (parsed) rows.push(parsed);
  }
  return rows;
}

export function detectFormat(fileName: string, text: string): AnalyzerTextFormat {
  if (fileName.endsWith(".ntm")) return "ntm";
  if (fileName.endsWith(".clf")) return "netmonitor";

  const firstLine = text
    .split("\n")
    .find((l) => l.trim().length > 0)
    ?.trim();
  if (firstLine) {
    const prefix = firstLine.split(";")[0];
    const prefixes = new Set(["G", "W", "L", "N", "C", "T"]);
    if (prefixes.has(prefix)) return "netmonitor";
  }

  return "ntm";
}

export function parseFile(format: AnalyzerTextFormat, text: string): ParsedRow[] {
  if (format === "netmonitor") return parseNetMonitorFile(text);
  return parseNtmFile(text);
}
