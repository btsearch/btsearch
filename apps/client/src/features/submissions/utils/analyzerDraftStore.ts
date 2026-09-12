import type { FileFormat, ParsedRow } from "@/lib/analyzer/analyzer-parsers";
import type { AnalyzerMatchedCell, AnalyzerResult } from "@/lib/analyzer/api";

const LEGACY_PREFIX = "analyzer:draft:";
const CURRENT_PREFIX = "analyzer:draft:v1:";
const STORAGE_VERSION = 1;
const DRAFT_TTL_MS = 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;
export type StoredParsedRow = DistributiveOmit<ParsedRow, "description" | "rawLine">;

type StoredAnalyzerStation = {
  id: number;
  station_id: string;
  operator: {
    name: string;
    mnc: number;
  };
};

type StoredAnalyzerMatchedCell =
  | Pick<AnalyzerMatchedCell & { rat: "GSM" }, "rat" | "cell_id" | "sector_id" | "band_id" | "lac" | "cid">
  | Pick<AnalyzerMatchedCell & { rat: "UMTS" }, "rat" | "cell_id" | "sector_id" | "band_id" | "rnc" | "cid" | "lac" | "arfcn">
  | Pick<AnalyzerMatchedCell & { rat: "LTE" }, "rat" | "cell_id" | "sector_id" | "band_id" | "enbid" | "clid" | "tac" | "pci" | "earfcn">
  | { rat: "NR" };

type StoredAnalyzerResult = Pick<AnalyzerResult, "status" | "warnings"> & {
  station?: StoredAnalyzerStation;
  cell?: StoredAnalyzerMatchedCell;
};

export interface AnalyzerDraft {
  id: string;
  selectedRows: Array<{ index: number; parsedRow: StoredParsedRow; result: StoredAnalyzerResult }>;
  metadata: {
    fileName: string | null;
    fileFormat: FileFormat | null;
  };
  parsedCount: number;
  createdAt: string;
}

type DraftEnvelope = {
  version: typeof STORAGE_VERSION;
  draft: AnalyzerDraft;
};

const currentStorageKey = (id: string) => `${CURRENT_PREFIX}${id}`;
const legacyStorageKey = (id: string) => `${LEGACY_PREFIX}${id}`;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const isNonNegativeInteger = (value: unknown): value is number => isInteger(value) && value >= 0;
const isNullableInteger = (value: unknown): value is number | null => value === null || isInteger(value);

function safeRemoveItem(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    return;
  }
}

function safeGetItem(key: string): string | null | undefined {
  try {
    return localStorage.getItem(key);
  } catch {
    return undefined;
  }
}

function parseStoredParsedRow(value: unknown): StoredParsedRow | null {
  if (!isRecord(value) || !isInteger(value.mnc) || typeof value.rat !== "string") return null;

  switch (value.rat) {
    case "GSM":
      if (!isInteger(value.lac) || !isInteger(value.cid)) return null;
      return { rat: value.rat, mnc: value.mnc, lac: value.lac, cid: value.cid };
    case "UMTS": {
      if (!isInteger(value.lac) || !isInteger(value.cid) || !isNullableInteger(value.rnc)) return null;
      if (value.uarfcn !== undefined && !isInteger(value.uarfcn)) return null;
      return {
        rat: value.rat,
        mnc: value.mnc,
        lac: value.lac,
        cid: value.cid,
        rnc: value.rnc,
        ...(value.uarfcn === undefined ? {} : { uarfcn: value.uarfcn }),
      };
    }
    case "LTE": {
      if (!isInteger(value.tac) || !isInteger(value.enbid) || !isInteger(value.clid) || !isInteger(value.pci)) return null;
      if (value.earfcn !== undefined && !isInteger(value.earfcn)) return null;
      return {
        rat: value.rat,
        mnc: value.mnc,
        tac: value.tac,
        enbid: value.enbid,
        clid: value.clid,
        pci: value.pci,
        ...(value.earfcn === undefined ? {} : { earfcn: value.earfcn }),
      };
    }
    case "NR":
      if (value.arfcn !== undefined && !isInteger(value.arfcn)) return null;
      return { rat: value.rat, mnc: value.mnc, ...(value.arfcn === undefined ? {} : { arfcn: value.arfcn }) };
    default:
      return null;
  }
}

function parseStoredStation(value: unknown): StoredAnalyzerStation | null {
  if (!isRecord(value) || !isInteger(value.id) || typeof value.station_id !== "string" || !isRecord(value.operator)) return null;
  if (typeof value.operator.name !== "string" || !isInteger(value.operator.mnc)) return null;
  return {
    id: value.id,
    station_id: value.station_id,
    operator: { name: value.operator.name, mnc: value.operator.mnc },
  };
}

function parseStoredMatchedCell(value: unknown): StoredAnalyzerMatchedCell | null {
  if (!isRecord(value) || typeof value.rat !== "string") return null;
  if (value.rat === "NR") return { rat: value.rat };
  if (!isInteger(value.cell_id) || !isNullableInteger(value.sector_id) || !isNullableInteger(value.band_id)) return null;

  switch (value.rat) {
    case "GSM":
      if (!isInteger(value.lac) || !isInteger(value.cid)) return null;
      return {
        rat: value.rat,
        cell_id: value.cell_id,
        sector_id: value.sector_id,
        band_id: value.band_id,
        lac: value.lac,
        cid: value.cid,
      };
    case "UMTS":
      if (!isInteger(value.rnc) || !isInteger(value.cid) || !isNullableInteger(value.lac) || !isNullableInteger(value.arfcn)) return null;
      return {
        rat: value.rat,
        cell_id: value.cell_id,
        sector_id: value.sector_id,
        band_id: value.band_id,
        rnc: value.rnc,
        cid: value.cid,
        lac: value.lac,
        arfcn: value.arfcn,
      };
    case "LTE":
      if (
        !isInteger(value.enbid) ||
        !isNullableInteger(value.clid) ||
        !isNullableInteger(value.tac) ||
        !isNullableInteger(value.pci) ||
        !isNullableInteger(value.earfcn)
      )
        return null;
      return {
        rat: value.rat,
        cell_id: value.cell_id,
        sector_id: value.sector_id,
        band_id: value.band_id,
        enbid: value.enbid,
        clid: value.clid,
        tac: value.tac,
        pci: value.pci,
        earfcn: value.earfcn,
      };
    default:
      return null;
  }
}

function parseStoredResult(value: unknown): StoredAnalyzerResult | null {
  if (!isRecord(value) || !["found", "probable", "not_found", "unsupported"].includes(String(value.status))) return null;
  if (!Array.isArray(value.warnings) || !value.warnings.every((warning) => typeof warning === "string")) return null;

  const station = value.station === undefined ? undefined : parseStoredStation(value.station);
  const cell = value.cell === undefined ? undefined : parseStoredMatchedCell(value.cell);
  if (station === null || cell === null) return null;

  const status = value.status;
  if (status !== "found" && status !== "probable" && status !== "not_found" && status !== "unsupported") return null;
  return {
    status,
    warnings: value.warnings,
    ...(station === undefined ? {} : { station }),
    ...(cell === undefined ? {} : { cell }),
  };
}

function parseAnalyzerDraft(value: unknown, expectedId: string): AnalyzerDraft | null {
  if (!isRecord(value) || value.id !== expectedId || !Array.isArray(value.selectedRows) || !isRecord(value.metadata)) return null;
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) || !isNonNegativeInteger(value.parsedCount)) return null;

  const { fileName, fileFormat } = value.metadata;
  if (fileName !== null && typeof fileName !== "string") return null;
  if (fileFormat !== null && fileFormat !== "ntm" && fileFormat !== "netmonitor" && fileFormat !== "nsg") return null;

  const selectedRows: AnalyzerDraft["selectedRows"] = [];
  const selectedIndices = new Set<number>();
  for (const selectedRow of value.selectedRows) {
    if (!isRecord(selectedRow) || !isNonNegativeInteger(selectedRow.index) || selectedRow.index >= value.parsedCount) return null;
    if (selectedIndices.has(selectedRow.index)) return null;
    const parsedRow = parseStoredParsedRow(selectedRow.parsedRow);
    const result = parseStoredResult(selectedRow.result);
    if (parsedRow === null || result === null) return null;
    if ((result.status === "found" || result.status === "probable") && result.station === undefined) return null;
    selectedIndices.add(selectedRow.index);
    selectedRows.push({ index: selectedRow.index, parsedRow, result });
  }

  return {
    id: value.id,
    selectedRows,
    metadata: { fileName, fileFormat },
    parsedCount: value.parsedCount,
    createdAt: value.createdAt,
  };
}

function normalizeMatchedCell(cell: StoredAnalyzerMatchedCell): StoredAnalyzerMatchedCell {
  switch (cell.rat) {
    case "GSM":
      return {
        rat: cell.rat,
        cell_id: cell.cell_id,
        sector_id: cell.sector_id,
        band_id: cell.band_id,
        lac: cell.lac,
        cid: cell.cid,
      };
    case "UMTS":
      return {
        rat: cell.rat,
        cell_id: cell.cell_id,
        sector_id: cell.sector_id,
        band_id: cell.band_id,
        rnc: cell.rnc,
        cid: cell.cid,
        lac: cell.lac,
        arfcn: cell.arfcn,
      };
    case "LTE":
      return {
        rat: cell.rat,
        cell_id: cell.cell_id,
        sector_id: cell.sector_id,
        band_id: cell.band_id,
        enbid: cell.enbid,
        clid: cell.clid,
        tac: cell.tac,
        pci: cell.pci,
        earfcn: cell.earfcn,
      };
    case "NR":
      return { rat: cell.rat };
  }
}

function normalizeResult(result: StoredAnalyzerResult): StoredAnalyzerResult {
  const station = result.station
    ? {
        id: result.station.id,
        station_id: result.station.station_id,
        operator: { name: result.station.operator.name, mnc: result.station.operator.mnc },
      }
    : undefined;
  return {
    status: result.status,
    warnings: [...result.warnings],
    ...(station === undefined ? {} : { station }),
    ...(result.cell === undefined ? {} : { cell: normalizeMatchedCell(result.cell) }),
  };
}

function createSavedDraft(draft: Omit<AnalyzerDraft, "id" | "createdAt">, id: string): AnalyzerDraft {
  return {
    id,
    selectedRows: draft.selectedRows.map(({ index, parsedRow, result }) => ({
      index,
      parsedRow: { ...parsedRow },
      result: normalizeResult(result),
    })),
    metadata: { ...draft.metadata },
    parsedCount: draft.parsedCount,
    createdAt: new Date().toISOString(),
  };
}

function parseCurrentDraft(serialized: string, expectedId: string): AnalyzerDraft | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value.version !== STORAGE_VERSION) return null;
    return parseAnalyzerDraft(value.draft, expectedId);
  } catch {
    return null;
  }
}

function parseLegacyDraft(serialized: string, expectedId: string): AnalyzerDraft | null {
  try {
    const value: unknown = JSON.parse(serialized);
    return parseAnalyzerDraft(value, expectedId);
  } catch {
    return null;
  }
}

function writeCurrentDraft(draft: AnalyzerDraft): boolean {
  try {
    const envelope: DraftEnvelope = { version: STORAGE_VERSION, draft };
    localStorage.setItem(currentStorageKey(draft.id), JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

function isExpired(draft: AnalyzerDraft): boolean {
  return Date.now() - Date.parse(draft.createdAt) > DRAFT_TTL_MS;
}

export function clearDraft(id: string) {
  safeRemoveItem(currentStorageKey(id));
  safeRemoveItem(legacyStorageKey(id));
}

export function saveDraft(draft: Omit<AnalyzerDraft, "id" | "createdAt">): string | null {
  clearStaleDrafts();
  try {
    const savedDraft = createSavedDraft(draft, crypto.randomUUID());
    if (writeCurrentDraft(savedDraft)) return savedDraft.id;
    clearStaleDrafts(true);
    return writeCurrentDraft(savedDraft) ? savedDraft.id : null;
  } catch {
    return null;
  }
}

export function loadDraft(id: string): AnalyzerDraft | null {
  const serializedCurrent = safeGetItem(currentStorageKey(id));
  if (serializedCurrent) {
    const draft = parseCurrentDraft(serializedCurrent, id);
    if (draft !== null && !isExpired(draft)) return draft;
    safeRemoveItem(currentStorageKey(id));
    if (draft !== null) {
      safeRemoveItem(legacyStorageKey(id));
      return null;
    }
  }

  const serializedLegacy = safeGetItem(legacyStorageKey(id));
  if (!serializedLegacy) return null;
  const legacyDraft = parseLegacyDraft(serializedLegacy, id);
  if (legacyDraft === null || isExpired(legacyDraft)) {
    safeRemoveItem(legacyStorageKey(id));
    return null;
  }

  if (writeCurrentDraft(legacyDraft)) safeRemoveItem(legacyStorageKey(id));
  return legacyDraft;
}

export function clearStaleDrafts(force = false) {
  const keys: string[] = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key !== null) keys.push(key);
    }
  } catch {
    return;
  }

  for (const key of keys) {
    const isCurrent = key.startsWith(CURRENT_PREFIX) && UUID_PATTERN.test(key.slice(CURRENT_PREFIX.length));
    const isLegacy = !key.startsWith(CURRENT_PREFIX) && key.startsWith(LEGACY_PREFIX) && UUID_PATTERN.test(key.slice(LEGACY_PREFIX.length));
    if (!isCurrent && !isLegacy) continue;
    if (force) {
      safeRemoveItem(key);
      continue;
    }

    const id = key.slice(isCurrent ? CURRENT_PREFIX.length : LEGACY_PREFIX.length);
    const serialized = safeGetItem(key);
    const draft = serialized ? (isCurrent ? parseCurrentDraft(serialized, id) : parseLegacyDraft(serialized, id)) : null;
    if (draft === null || isExpired(draft)) safeRemoveItem(key);
  }
}
