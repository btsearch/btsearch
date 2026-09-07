import type { Operator, Region, UkeStation } from "@/types/station";

import { fetchApiData } from "../api";
import type { AnalyzerCell } from "./analyzer-parsers";
import { ANALYZER_CHUNK_CONCURRENCY, chunkAnalyzerCells } from "./chunks";

export type AnalyzerLocation = {
  id: number;
  city: string | null;
  address: string | null;
  longitude: number;
  latitude: number;
  updatedAt: string;
  createdAt: string;
  region: Region;
};

export type AnalyzerStation = {
  id: number;
  station_id: string;
  notes: string | null;
  extra_address: string | null;
  updatedAt: string;
  createdAt: string;
  statusChangedAt: string;
  is_confirmed: boolean | null;
  operator: Operator;
  location: AnalyzerLocation;
};

export type AnalyzerMatchedCell =
  | {
      rat: "GSM";
      cell_id: number;
      sector_id: number | null;
      band_id: number | null;
      notes?: string | null;
      lac: number;
      cid: number;
      is_confirmed: boolean | null;
    }
  | {
      rat: "UMTS";
      cell_id: number;
      sector_id: number | null;
      band_id: number | null;
      notes?: string | null;
      rnc: number;
      cid: number;
      lac: number | null;
      arfcn: number | null;
      is_confirmed: boolean;
    }
  | {
      rat: "LTE";
      cell_id: number;
      sector_id: number | null;
      band_id: number | null;
      notes?: string | null;
      enbid: number;
      clid: number | null;
      tac: number | null;
      pci: number | null;
      earfcn: number | null;
      is_confirmed: boolean;
    }
  | { rat: "NR" };

export type AnalyzerResult = {
  status: "found" | "probable" | "not_found" | "unsupported";
  station?: AnalyzerStation;
  cell?: AnalyzerMatchedCell;
  warnings: string[];
  uke_stations?: UkeStation[];
};

export async function analyzeCells(cells: readonly AnalyzerCell[], signal?: AbortSignal): Promise<AnalyzerResult[]> {
  return fetchApiData<AnalyzerResult[]>("analyzer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cells }),
    signal,
  });
}

export async function analyzeCellsInChunks(cells: readonly AnalyzerCell[], signal?: AbortSignal): Promise<AnalyzerResult[]> {
  const chunks = chunkAnalyzerCells(cells);
  const results = Array.from({ length: chunks.length }, (): AnalyzerResult[] => []);
  let nextChunkIndex = 0;
  let failed = false;
  async function worker(): Promise<void> {
    while (!failed) {
      const index = nextChunkIndex++;
      if (index >= chunks.length) return;

      try {
        // oxlint-disable-next-line no-await-in-loop -- Each worker must finish its current chunk before claiming another.
        results[index] = await analyzeCells(chunks[index], signal);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(ANALYZER_CHUNK_CONCURRENCY, chunks.length) }, () => worker()));
  return results.flat();
}
