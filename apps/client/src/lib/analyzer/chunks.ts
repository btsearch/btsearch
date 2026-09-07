import type { AnalyzerCell } from "./analyzer-parsers";

export const ANALYZER_REQUEST_CHUNK_SIZE = 4_000;
export const ANALYZER_CHUNK_CONCURRENCY = 4;

export function chunkAnalyzerCells(cells: readonly AnalyzerCell[]): AnalyzerCell[][] {
  const chunks: AnalyzerCell[][] = [];
  for (let offset = 0; offset < cells.length; offset += ANALYZER_REQUEST_CHUNK_SIZE)
    chunks.push(cells.slice(offset, offset + ANALYZER_REQUEST_CHUNK_SIZE));
  return chunks;
}
