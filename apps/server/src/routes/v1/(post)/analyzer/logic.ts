import { setImmediate } from "node:timers/promises";

export type CellInput =
  | { rat: "GSM"; mnc: number; lac: number; cid: number }
  | { rat: "UMTS"; mnc: number; lac: number; cid: number; rnc: number | null; uarfcn?: number }
  | { rat: "LTE"; mnc: number; tac: number; enbid: number; clid: number; pci: number; earfcn?: number }
  | { rat: "NR"; mnc: number };

export type MatchedCell =
  | {
      rat: "GSM";
      cell_id: number;
      sector_id: number | null;
      band_id: number | null;
      notes: string | null;
      lac: number;
      cid: number;
      is_confirmed: boolean | undefined;
    }
  | {
      rat: "UMTS";
      cell_id: number;
      sector_id: number | null;
      band_id: number | null;
      notes: string | null;
      rnc: number;
      cid: number;
      lac: number | null;
      arfcn: number | null;
      is_confirmed: boolean | undefined;
    }
  | {
      rat: "LTE";
      cell_id: number;
      sector_id: number | null;
      band_id: number | null;
      notes: string | null;
      enbid: number;
      clid: number | null;
      tac: number | null;
      pci: number | null;
      earfcn: number | null;
      is_confirmed: boolean | undefined;
    }
  | { rat: "NR" };

export type AnalyzerResult<TStation = unknown> = {
  status: "found" | "probable" | "not_found" | "unsupported";
  station?: TStation;
  cell?: MatchedCell;
  warnings: string[];
};

type Pair = [a: number, b: number];
type PairMap = Map<number, Map<string, Pair>>;
const NETWORKS_MNCS = new Set([26002, 26003]);

export type LookupMaps<TStation> = {
  gsmMap: Map<
    string,
    {
      station: TStation;
      cell_id: number;
      sector_id: number | null;
      band_id: number | null;
      notes: string | null;
      lac: number;
      cid: number;
      is_confirmed: boolean | undefined;
    }
  >;
  umtsRncMap: Map<
    string,
    {
      station: TStation;
      cell_id: number;
      sector_id: number | null;
      band_id: number | null;
      notes: string | null;
      rnc: number;
      cid: number;
      lac: number | null;
      arfcn: number | null;
      is_confirmed: boolean | undefined;
    }
  >;
  umtsLacMap: Map<
    string,
    {
      station: TStation;
      cell_id: number;
      sector_id: number | null;
      band_id: number | null;
      notes: string | null;
      rnc: number;
      cid: number;
      lac: number | null;
      arfcn: number | null;
      is_confirmed: boolean | undefined;
    }
  >;
  lteMap: Map<
    string,
    {
      station: TStation;
      cell_id: number;
      sector_id: number | null;
      band_id: number | null;
      notes: string | null;
      enbid: number;
      clid: number;
      tac: number | null;
      pci: number | null;
      earfcn: number | null;
      is_confirmed: boolean | undefined;
    }
  >;
  lteEnbidMap: Map<
    string,
    {
      station: TStation;
      cell_id: number;
      sector_id: number | null;
      band_id: number | null;
      notes: string | null;
      enbid: number;
      is_confirmed: boolean | undefined;
    }
  >;
};

export type CellGroups = {
  gsmByMnc: PairMap;
  umtsRncByMnc: PairMap;
  umtsLacByMnc: PairMap;
  lteByMnc: PairMap;
  lteEnbidsByMnc: Map<number, Set<number>>;
};

export function addPair(byMnc: PairMap, mnc: number, a: number, b: number): void {
  let inner = byMnc.get(mnc);
  if (!inner) {
    inner = new Map();
    byMnc.set(mnc, inner);
  }
  inner.set(`${a}:${b}`, [a, b]);
}

export function pairKey(mnc: number, a: number, b: number): string {
  return `${mnc}:${a}:${b}`;
}

export function stripFirstDigit(enbid: number): number | null {
  if (enbid <= 9) return null;
  return enbid % 10 ** Math.floor(Math.log10(enbid));
}

export function lteEnbidKey(mnc: number, enbid: number): string {
  if (!NETWORKS_MNCS.has(mnc)) return `${mnc}:${enbid}`;
  return `${mnc}:${stripFirstDigit(enbid) ?? enbid}`;
}

export function candidateEnbids(enbid: number): number[] {
  const stripped = stripFirstDigit(enbid);
  if (stripped === null) return [enbid];
  const magnitude = 10 ** (Math.floor(Math.log10(stripped)) + 1);
  return Array.from({ length: 9 }, (_, i) => stripped + (i + 1) * magnitude);
}

export function candidateLTEEnbids(mnc: number, enbid: number): number[] {
  if (!NETWORKS_MNCS.has(mnc)) return [enbid];
  return candidateEnbids(enbid);
}

export function groupCellsByMnc(inputCells: CellInput[]): CellGroups {
  const gsmByMnc: PairMap = new Map();
  const umtsRncByMnc: PairMap = new Map();
  const umtsLacByMnc: PairMap = new Map();
  const lteByMnc: PairMap = new Map();
  const lteEnbidsByMnc = new Map<number, Set<number>>();

  for (const cell of inputCells) {
    switch (cell.rat) {
      case "GSM":
        addPair(gsmByMnc, cell.mnc, cell.lac, cell.cid);
        break;
      case "UMTS":
        if (cell.rnc !== null) addPair(umtsRncByMnc, cell.mnc, cell.rnc, cell.cid);
        addPair(umtsLacByMnc, cell.mnc, cell.lac, cell.cid);
        break;
      case "LTE": {
        addPair(lteByMnc, cell.mnc, cell.enbid, cell.clid);
        let enbids = lteEnbidsByMnc.get(cell.mnc);
        if (!enbids) {
          enbids = new Set();
          lteEnbidsByMnc.set(cell.mnc, enbids);
        }
        enbids.add(cell.enbid);
        break;
      }
    }
  }

  return { gsmByMnc, umtsRncByMnc, umtsLacByMnc, lteByMnc, lteEnbidsByMnc };
}

const NOT_FOUND: AnalyzerResult<never> = { status: "not_found", warnings: [] };
const UNSUPPORTED: AnalyzerResult<never> = { status: "unsupported", warnings: [] };

export function resolveCell<TStation>(cell: CellInput, maps: LookupMaps<TStation>): AnalyzerResult<TStation> {
  switch (cell.rat) {
    case "NR":
      return UNSUPPORTED;

    case "GSM": {
      const entry = maps.gsmMap.get(pairKey(cell.mnc, cell.lac, cell.cid));
      if (!entry) return NOT_FOUND;
      return {
        status: "found",
        station: entry.station,
        cell: {
          rat: "GSM",
          cell_id: entry.cell_id,
          sector_id: entry.sector_id,
          band_id: entry.band_id,
          notes: entry.notes,
          lac: entry.lac,
          cid: entry.cid,
          is_confirmed: entry.is_confirmed,
        },
        warnings: [],
      };
    }

    case "UMTS": {
      const primary = cell.rnc !== null ? maps.umtsRncMap.get(pairKey(cell.mnc, cell.rnc, cell.cid)) : undefined;
      if (primary) {
        const warnings: string[] = [];
        if (primary.lac !== null && primary.lac !== cell.lac) warnings.push("lac_mismatch");
        if (cell.uarfcn !== undefined && primary.arfcn !== null && primary.arfcn !== cell.uarfcn) warnings.push("uarfcn_mismatch");
        return {
          status: "found",
          station: primary.station,
          cell: {
            rat: "UMTS",
            cell_id: primary.cell_id,
            sector_id: primary.sector_id,
            band_id: primary.band_id,
            notes: primary.notes,
            rnc: primary.rnc,
            cid: primary.cid,
            lac: primary.lac,
            arfcn: primary.arfcn,
            is_confirmed: primary.is_confirmed,
          },
          warnings,
        };
      }
      const fallback = maps.umtsLacMap.get(pairKey(cell.mnc, cell.lac, cell.cid));
      if (!fallback) return NOT_FOUND;
      return {
        status: "probable",
        station: fallback.station,
        cell: {
          rat: "UMTS",
          cell_id: fallback.cell_id,
          sector_id: fallback.sector_id,
          band_id: fallback.band_id,
          notes: fallback.notes,
          rnc: fallback.rnc,
          cid: fallback.cid,
          lac: fallback.lac,
          arfcn: fallback.arfcn,
          is_confirmed: fallback.is_confirmed,
        },
        warnings: ["rnc_mismatch"],
      };
    }

    case "LTE": {
      const primary = maps.lteMap.get(pairKey(cell.mnc, cell.enbid, cell.clid));
      if (primary) {
        const warnings: string[] = [];
        if (primary.tac !== null && primary.tac !== cell.tac) warnings.push("tac_mismatch");
        if (primary.pci === null) warnings.push("pci_missing");
        else if (primary.pci !== cell.pci) warnings.push("pci_mismatch");
        if (cell.earfcn !== undefined && primary.earfcn !== null && primary.earfcn !== cell.earfcn) warnings.push("earfcn_mismatch");
        return {
          status: "found",
          station: primary.station,
          cell: {
            rat: "LTE",
            cell_id: primary.cell_id,
            sector_id: primary.sector_id,
            band_id: primary.band_id,
            notes: primary.notes,
            enbid: primary.enbid,
            clid: primary.clid,
            tac: primary.tac,
            pci: primary.pci,
            earfcn: primary.earfcn,
            is_confirmed: primary.is_confirmed,
          },
          warnings,
        };
      }
      const fallback = maps.lteEnbidMap.get(lteEnbidKey(cell.mnc, cell.enbid));
      if (!fallback) return NOT_FOUND;
      return {
        status: "probable",
        station: fallback.station,
        cell: {
          rat: "LTE",
          cell_id: fallback.cell_id,
          sector_id: fallback.sector_id,
          band_id: fallback.band_id,
          notes: fallback.notes,
          enbid: fallback.enbid,
          clid: null,
          tac: null,
          pci: null,
          earfcn: null,
          is_confirmed: fallback.is_confirmed,
        },
        warnings: ["enbid_only"],
      };
    }
  }
}

const YIELD_EVERY = 2000;

export async function resolveAllCells<TStation>(inputCells: CellInput[], maps: LookupMaps<TStation>): Promise<AnalyzerResult<TStation>[]> {
  const results: AnalyzerResult<TStation>[] = [];
  for (let i = 0; i < inputCells.length; i++) {
    const cell = inputCells[i];
    if (cell) results.push(resolveCell(cell, maps));
    // eslint-disable-next-line no-await-in-loop
    if (i % YIELD_EVERY === 0 && i > 0) await setImmediate();
  }
  return results;
}
