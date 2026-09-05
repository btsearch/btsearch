import type { AnalyzerCell } from "../analyzer/analyzer-parsers";
import type { AnalyzerResult, AnalyzerStation } from "../analyzer/api";
import { mapNsgAnalyzerCell } from "./analyzer";
import { type NsgServingCellResolution, type NsgServingCellSnapshot, resolveNsgServingCellAt } from "./servingCells";
import type { NsgCell } from "./types";

export { createNsgServingCellTimeline, resolveNsgServingCellAt } from "./servingCells";
export type { NsgServingCellResolution, NsgServingCellScope, NsgServingCellSnapshot, NsgSimIdentity } from "./servingCells";

export type NsgAnalyzerInput = Exclude<AnalyzerCell, { rat: "NR" }>;

export type NsgAnalyzerRequest = {
  key: string;
  input: NsgAnalyzerInput;
};

export type NsgAnalyzerResultsByKey = ReadonlyMap<string, AnalyzerResult>;

export type NsgMatchedStation = {
  station: AnalyzerStation;
  confidence: "exact" | "probable";
};

function isNsgAnalyzerInput(input: AnalyzerCell): input is NsgAnalyzerInput {
  return input.rat !== "NR";
}

export function getNsgAnalyzerRequestKey(input: NsgAnalyzerInput): string {
  return JSON.stringify(input);
}

const analyzerRequestByCell = new WeakMap<NsgCell, NsgAnalyzerRequest | null>();

function getNsgAnalyzerRequestForCell(cell: NsgCell): NsgAnalyzerRequest | null {
  const cached = analyzerRequestByCell.get(cell);
  if (cached !== undefined) return cached;
  const input = cell.registered === true ? mapNsgAnalyzerCell(cell) : null;
  const request = input !== null && isNsgAnalyzerInput(input) ? { key: getNsgAnalyzerRequestKey(input), input } : null;
  analyzerRequestByCell.set(cell, request);
  return request;
}

export function getNsgAnalyzerRequestsIdentity(requests: readonly NsgAnalyzerRequest[]): string {
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

export function collectNsgAnalyzerRequests(cells: readonly NsgCell[]): NsgAnalyzerRequest[] {
  const requestsByKey = new Map<string, NsgAnalyzerRequest>();
  for (const cell of cells) {
    const request = getNsgAnalyzerRequestForCell(cell);
    if (request !== null && !requestsByKey.has(request.key)) requestsByKey.set(request.key, request);
  }
  return [...requestsByKey.values()].sort((left, right) => {
    if (left.key < right.key) return -1;
    if (left.key > right.key) return 1;
    return 0;
  });
}

export function mapNsgAnalyzerResults(requests: readonly NsgAnalyzerRequest[], results: readonly AnalyzerResult[]): NsgAnalyzerResultsByKey {
  if (requests.length !== results.length) throw new Error(`Analyzer returned ${results.length} results for ${requests.length} NSG cell requests.`);
  return new Map(requests.map((request, index) => [request.key, results[index]]));
}

export function getNsgAnalyzerResultForCell(resultsByKey: NsgAnalyzerResultsByKey, cell: NsgCell): AnalyzerResult | null {
  const request = getNsgAnalyzerRequestForCell(cell);
  return request === null ? null : (resultsByKey.get(request.key) ?? null);
}

export function collectMatchedNsgStations(cells: readonly NsgCell[], resultsByKey: NsgAnalyzerResultsByKey): NsgMatchedStation[] {
  const stations = new Map<number, NsgMatchedStation>();

  for (const cell of cells) {
    const result = getNsgAnalyzerResultForCell(resultsByKey, cell);
    if (!result?.station || (result.status !== "found" && result.status !== "probable")) continue;

    const confidence = result.status === "found" ? "exact" : "probable";
    const existing = stations.get(result.station.id);
    if (!existing) {
      stations.set(result.station.id, {
        station: result.station,
        confidence,
      });
      continue;
    }

    if (confidence === "exact" && existing.confidence === "probable") {
      existing.station = result.station;
      existing.confidence = confidence;
    }
  }

  return [...stations.values()].sort((left, right) => left.station.id - right.station.id);
}

export function resolveNsgReplayServingCell(timeline: readonly NsgServingCellSnapshot[], playheadMs: number): NsgServingCellResolution {
  return resolveNsgServingCellAt(timeline, playheadMs).resolution;
}

export function resolveNsgReplayServingStation(
  timeline: readonly NsgServingCellSnapshot[],
  playheadMs: number,
  resultsByKey: NsgAnalyzerResultsByKey,
): NsgMatchedStation | null {
  const resolution = resolveNsgReplayServingCell(timeline, playheadMs);
  if (resolution.status !== "available") return null;
  const result = getNsgAnalyzerResultForCell(resultsByKey, resolution.measurement);
  if (!result?.station || (result.status !== "found" && result.status !== "probable")) return null;
  return { station: result.station, confidence: result.status === "found" ? "exact" : "probable" };
}
