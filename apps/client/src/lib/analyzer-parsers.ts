export type AnalyzerCell =
  | { rat: "GSM"; mnc: number; lac: number; cid: number }
  | { rat: "UMTS"; mnc: number; lac: number; cid: number; rnc: number | null; uarfcn?: number }
  | { rat: "LTE"; mnc: number; tac: number; enbid: number; clid: number; pci: number; earfcn?: number }
  | { rat: "NR"; mnc: number; arfcn?: number };
export type ParsedRow = AnalyzerCell & { description: string; rawLine: string };
export type FileFormat = "ntm" | "netmonitor";

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
    return { rat: "GSM", mnc, cid, lac, description, rawLine: line };
  }

  if (rat === "UMTS" && parts.length >= 7) {
    const cid = Number.parseInt(parts[3], 10);
    const lac = Number.parseInt(parts[4], 10);
    const rnc = Number.parseInt(parts[5], 10);
    if (Number.isNaN(cid) || Number.isNaN(lac) || Number.isNaN(rnc)) return null;
    const uarfcn = Number.parseInt(parts[10], 10);
    return { rat: "UMTS", mnc, cid, lac, rnc, ...(Number.isNaN(uarfcn) ? {} : { uarfcn }), description, rawLine: line };
  }

  if (rat === "LTE" && parts.length >= 7) {
    const clid = Number.parseInt(parts[3], 10);
    const tac = Number.parseInt(parts[4], 10);
    const enbid = Number.parseInt(parts[5], 10);
    const pci = Number.parseInt(parts[6], 10);
    if (Number.isNaN(clid) || Number.isNaN(tac) || Number.isNaN(enbid) || Number.isNaN(pci)) return null;
    const earfcn = Number.parseInt(parts[10], 10);
    return { rat: "LTE", mnc, clid, tac, enbid, pci, ...(Number.isNaN(earfcn) ? {} : { earfcn }), description, rawLine: line };
  }

  if (rat === "NR") {
    const arfcn = Number.parseInt(parts[8], 10);
    return { rat: "NR", mnc, ...(Number.isNaN(arfcn) ? {} : { arfcn }), description, rawLine: line };
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
      return { rat: "GSM", mnc, lac, cid, description, rawLine: line };
    }
    case "UMTS": {
      if (Number.isNaN(lac) || Number.isNaN(cid)) return null;
      const rnc = Math.floor(cid / 65536);
      const shortCid = cid % 65536;
      return { rat: "UMTS", mnc, lac, cid: shortCid, rnc, description, rawLine: line };
    }
    case "LTE": {
      if (Number.isNaN(lac) || Number.isNaN(cid) || Number.isNaN(psc)) return null;
      const enbid = Math.floor(cid / 256);
      const clid = cid % 256;
      return { rat: "LTE", mnc, tac: lac, enbid, clid, pci: psc, earfcn: arfcn, description, rawLine: line };
    }
    case "NR": {
      return { rat: "NR", mnc, description, rawLine: line };
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

export function detectFormat(fileName: string, text: string): FileFormat {
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

export function parseFile(format: FileFormat, text: string): ParsedRow[] {
  if (format === "netmonitor") return parseNetMonitorFile(text);
  return parseNtmFile(text);
}
