import { mapNsgAnalyzerCell } from "@/features/analyzer/nsg/cellAdapter";
import { type ServingCellResolution, type ServingCellSnapshot, resolveServingCellAt } from "@/features/nsg-explorer/cells/servingTimeline";
import type { AnalyzerCell } from "@/lib/analyzer/analyzer-parsers";
import type { AnalyzerResult, AnalyzerStation } from "@/lib/analyzer/api";
import type { NsgCell } from "@/lib/nsg-parser/model";

export type AnalyzerInput = Exclude<AnalyzerCell, { rat: "NR" }>;

export type AnalyzerRequest = {
  key: string;
  input: AnalyzerInput;
};

export type AnalyzerResultsByKey = ReadonlyMap<string, AnalyzerResult>;

export type MatchedStation = {
  station: AnalyzerStation;
  confidence: "exact" | "probable";
};

function isAnalyzerInput(input: AnalyzerCell): input is AnalyzerInput {
  return input.rat !== "NR";
}

export function getAnalyzerRequestKey(input: AnalyzerInput): string {
  return JSON.stringify(input);
}

const analyzerRequestByCell = new WeakMap<NsgCell, AnalyzerRequest | null>();

function getAnalyzerRequestForCell(cell: NsgCell): AnalyzerRequest | null {
  const cached = analyzerRequestByCell.get(cell);
  if (cached !== undefined) return cached;
  const input = cell.registered === true ? mapNsgAnalyzerCell(cell) : null;
  const request = input !== null && isAnalyzerInput(input) ? { key: getAnalyzerRequestKey(input), input } : null;
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

export function mapAnalyzerResults(requests: readonly AnalyzerRequest[], results: readonly AnalyzerResult[]): AnalyzerResultsByKey {
  if (requests.length !== results.length) throw new Error(`Analyzer returned ${results.length} results for ${requests.length} NSG cell requests.`);
  return new Map(requests.map((request, index) => [request.key, results[index]]));
}

export function getAnalyzerResultForCell(resultsByKey: AnalyzerResultsByKey, cell: NsgCell): AnalyzerResult | null {
  const request = getAnalyzerRequestForCell(cell);
  return request === null ? null : (resultsByKey.get(request.key) ?? null);
}

export function collectMatchedStations(cells: readonly NsgCell[], resultsByKey: AnalyzerResultsByKey): MatchedStation[] {
  const stations = new Map<number, MatchedStation>();

  for (const cell of cells) {
    const result = getAnalyzerResultForCell(resultsByKey, cell);
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
  const result = getAnalyzerResultForCell(resultsByKey, resolution.measurement);
  if (!result?.station || (result.status !== "found" && result.status !== "probable")) return null;
  return { station: result.station, confidence: result.status === "found" ? "exact" : "probable" };
}
