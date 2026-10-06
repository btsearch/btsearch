import type { Cell, CellMatchAnswer, CellMatchResult, ObservedCell, OfficialSiteRef, Station } from "@openbts/shared/contract";

import type { LogRow, MatchFailure, MatchResults, MatchTables } from "../model/types";
import { ApiResponseError, JSON_HEADERS, RateLimitError, fetchV2Data } from "@/lib/api";

export const MATCH_CHUNK_SIZE = 5000;

export type MatchChunk = { results: CellMatchResult[]; stations: Station[]; cells: Cell[]; officialSites: OfficialSiteRef[] };
export type MatchRun = { chunks: (MatchChunk | null)[] };
export type MatchRunResult = { run: MatchRun; missingChunks: number[]; cause: MatchFailure | null };

const MATCH_PATH = "cells/match?include=stations,cells,officialSites";
const BAD_REQUEST_STATUS = 400;

export async function matchCellChunk(cells: readonly ObservedCell[], signal: AbortSignal): Promise<MatchChunk> {
  const answer = await fetchV2Data<CellMatchAnswer>(MATCH_PATH, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ cells }), signal });
  if (answer.results.length !== cells.length) throw new Error(`cells/match answered ${answer.results.length} results for ${cells.length} cells`);

  return { results: answer.results, stations: answer.stations ?? [], cells: answer.cells ?? [], officialSites: answer.officialSites ?? [] };
}

export function countChunks(rowCount: number): number {
  return Math.ceil(rowCount / MATCH_CHUNK_SIZE);
}

function readRefusalPointer(error: ApiResponseError): string | null {
  const [detail] = error.errors[0]?.details ?? [];
  if (typeof detail !== "object" || detail === null || !("field" in detail)) return null;
  return typeof detail.field === "string" ? detail.field : null;
}

function toMatchFailure(error: unknown, chunkRows: readonly LogRow[]): MatchFailure {
  if (error instanceof RateLimitError) return "rateLimited";
  if (!(error instanceof ApiResponseError) || error.status !== BAD_REQUEST_STATUS) return "network";

  const pointer = readRefusalPointer(error);
  const rowPosition = Number(pointer?.split("/")[1]);
  console.error("cells/match refused a piece of the file", { pointer, row: chunkRows[rowPosition] ?? null, message: error.message });
  return "refused";
}

function listMissingChunks(chunks: readonly (MatchChunk | null)[]): number[] {
  return chunks.flatMap((chunk, index) => (chunk === null ? [index] : []));
}

export async function runMatch(
  rows: readonly LogRow[],
  run: MatchRun,
  signal: AbortSignal,
  onChunk: (doneChunks: number) => void,
): Promise<MatchRunResult> {
  const chunkCount = countChunks(rows.length);
  const chunks: (MatchChunk | null)[] = Array.from({ length: chunkCount }, (_, index) => run.chunks[index] ?? null);
  let doneChunks = chunkCount - listMissingChunks(chunks).length;
  let cause: MatchFailure | null = null;

  for (let index = 0; index < chunkCount; index++) {
    if (chunks[index] !== null) continue;
    if (signal.aborted) break;

    const chunkRows = rows.slice(index * MATCH_CHUNK_SIZE, (index + 1) * MATCH_CHUNK_SIZE);
    try {
      // oxlint-disable-next-line no-await-in-loop -- The pieces are sent one after another on purpose: the route is rate limited and heavy.
      chunks[index] = await matchCellChunk(
        chunkRows.map((row) => row.observed),
        signal,
      );
      doneChunks += 1;
      onChunk(doneChunks);
    } catch (error) {
      if (signal.aborted) break;
      cause ??= toMatchFailure(error, chunkRows);
      if (error instanceof RateLimitError) break;
    }
  }
  return { run: { chunks }, missingChunks: listMissingChunks(chunks), cause };
}

export function mergeMatchRun(run: MatchRun, rowCount: number): { results: MatchResults; tables: MatchTables } {
  const results: (CellMatchResult | null)[] = Array.from({ length: rowCount }, () => null);
  const stationsById = new Map<number, Station>();
  const cellsById = new Map<number, Cell>();
  const officialSitesById = new Map<number, OfficialSiteRef>();

  for (const [chunkIndex, chunk] of run.chunks.entries()) {
    if (chunk === null) continue;

    const offset = chunkIndex * MATCH_CHUNK_SIZE;
    for (const [position, result] of chunk.results.entries()) {
      if (offset + position < rowCount) results[offset + position] = result;
    }
    for (const station of chunk.stations) stationsById.set(station.id, station);
    for (const cell of chunk.cells) cellsById.set(cell.id, cell);
    for (const site of chunk.officialSites) officialSitesById.set(site.id, site);
  }
  return { results, tables: { stationsById, cellsById, officialSitesById } };
}
