import type { ObservedCell } from "@openbts/shared/contract";

import { type LocatedStation, type StationMatch, toNsgObservedCell } from "./match";
import { type ServingCellResolution, type ServingCellSnapshot, resolveServingCellAt } from "@/features/nsg-explorer/cells/servingTimeline";
import type { NsgCell } from "@/lib/nsg-parser/model";

export type AnalyzerRequest = {
  key: string;
  input: ObservedCell;
};

export type AnalyzerResultsByKey = ReadonlyMap<string, StationMatch>;

export type MatchedStation = {
  station: LocatedStation;
  confidence: "exact" | "probable";
};

export function getAnalyzerRequestKey(input: ObservedCell): string {
  return JSON.stringify(input);
}

const analyzerRequestByCell = new WeakMap<NsgCell, AnalyzerRequest | null>();

function getAnalyzerRequestForCell(cell: NsgCell): AnalyzerRequest | null {
  const cached = analyzerRequestByCell.get(cell);
  if (cached !== undefined) return cached;
  const input = cell.registered === true ? toNsgObservedCell(cell) : null;
  const request = input === null ? null : { key: getAnalyzerRequestKey(input), input };
  analyzerRequestByCell.set(cell, request);
  return request;
}

export function getAnalyzerRequestsIdentity(requests: readonly AnalyzerRequest[]): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const { key } of requests) {
    for (let index = 0; index < key.length; index++) {
      const code = key.charCodeAt(index);
      first = Math.imul(first ^ code, 0x01000193);
      second = Math.imul(second ^ code, 0x85ebca6b);
    }
    first = Math.imul(first ^ 0xff, 0x01000193);
    second = Math.imul(second ^ 0xff, 0xc2b2ae35);
  }
  return `${requests.length}:${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function collectAnalyzerRequests(cells: readonly NsgCell[]): AnalyzerRequest[] {
  const requestsByKey = new Map<string, AnalyzerRequest>();
  for (const cell of cells) {
    const request = getAnalyzerRequestForCell(cell);
    if (request !== null && !requestsByKey.has(request.key)) requestsByKey.set(request.key, request);
  }
  return [...requestsByKey.values()].sort((left, right) => {
    if (left.key < right.key) return -1;
    if (left.key > right.key) return 1;
    return 0;
  });
}

export function mapAnalyzerResults(requests: readonly AnalyzerRequest[], results: readonly StationMatch[]): AnalyzerResultsByKey {
  if (requests.length !== results.length) throw new Error(`Analyzer returned ${results.length} results for ${requests.length} NSG cell requests.`);
  return new Map(requests.map((request, index) => [request.key, results[index]]));
}

export function getAnalyzerResultForCell(resultsByKey: AnalyzerResultsByKey, cell: NsgCell): StationMatch | null {
  const request = getAnalyzerRequestForCell(cell);
  return request === null ? null : (resultsByKey.get(request.key) ?? null);
}

function toMatchedStation(match: StationMatch | null): MatchedStation | null {
  if (match === null || match.station === null || match.result.match === "none") return null;
  return { station: match.station, confidence: match.result.match === "cell" && !match.result.isShared ? "exact" : "probable" };
}

export function collectMatchedStations(cells: readonly NsgCell[], resultsByKey: AnalyzerResultsByKey): MatchedStation[] {
  const stations = new Map<number, MatchedStation>();

  for (const cell of cells) {
    const match = toMatchedStation(getAnalyzerResultForCell(resultsByKey, cell));
    if (match === null) continue;
    const existing = stations.get(match.station.id);
    if (existing === undefined || (match.confidence === "exact" && existing.confidence === "probable")) stations.set(match.station.id, match);
  }

  return [...stations.values()].sort((left, right) => left.station.id - right.station.id);
}

export function resolveReplayServingCell(timeline: readonly ServingCellSnapshot[], playheadMs: number): ServingCellResolution {
  return resolveServingCellAt(timeline, playheadMs).resolution;
}

export function resolveReplayServingStation(
  timeline: readonly ServingCellSnapshot[],
  playheadMs: number,
  resultsByKey: AnalyzerResultsByKey,
): MatchedStation | null {
  const resolution = resolveReplayServingCell(timeline, playheadMs);
  if (resolution.status !== "available") return null;
  return toMatchedStation(getAnalyzerResultForCell(resultsByKey, resolution.measurement));
}
