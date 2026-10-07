import type { CellMatchResult, ObservedCell, Station, StationLocation } from "@openbts/shared/contract";

import { MATCH_CHUNK_SIZE, type MatchChunk, countChunks, matchCellChunk, mergeMatchRun } from "@/features/analyzer/data/matchRequest";
import { toObservedCell } from "@/features/analyzer/model/observed";
import { mapNsgAnalyzerCell, mapNsgNrCell, readNsgCellPlmn } from "@/features/analyzer/nsg/cellAdapter";
import type { NsgCell } from "@/lib/nsg-parser/model";

export type LocatedStation = Station & { location: StationLocation };
export type StationMatch = { result: CellMatchResult; station: LocatedStation | null };

export function toNsgObservedCell(cell: NsgCell): ObservedCell | null {
  const row = cell.rat === "NR" ? mapNsgNrCell(cell) : mapNsgAnalyzerCell(cell);
  const plmn = readNsgCellPlmn(cell);
  if (row === null || plmn === null) return null;
  return toObservedCell({ ...row, plmn, description: "", rawLine: "" });
}

export async function matchNsgCells(cells: readonly ObservedCell[], signal: AbortSignal): Promise<StationMatch[]> {
  const chunks: MatchChunk[] = [];
  let pending = Promise.resolve();
  for (let index = 0; index < countChunks(cells.length); index++) {
    pending = pending.then(async () => {
      const chunk = cells.slice(index * MATCH_CHUNK_SIZE, (index + 1) * MATCH_CHUNK_SIZE);
      chunks.push(await matchCellChunk(chunk, signal));
    });
  }
  await pending;
  const { results, tables } = mergeMatchRun({ chunks }, cells.length);
  return results.map((result) => {
    if (result === null) throw new Error("cells/match returned an incomplete NSG result");
    const station = result.stationId === null ? undefined : tables.stationsById.get(result.stationId);
    return { result, station: station?.location ? { ...station, location: station.location } : null };
  });
}
