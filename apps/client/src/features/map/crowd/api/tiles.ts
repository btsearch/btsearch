import { COVERAGE_CELL_LIMIT } from "@openbts/shared/contract";
import type { RequestParameters } from "maplibre-gl";

import { API_V2_BASE } from "@/lib/api";

export type TrailTiles = { kind: "public" | "staff" | "mine"; operatorId: number };

export const TRAILS_SOURCE_LAYER = "trails";
export const COVERAGE_SOURCE_LAYER = "coverage";
export const COVERAGE_MIN_ZOOM = 12;

const TRAIL_PATHS: Record<TrailTiles["kind"], string> = { public: "observed/trails", staff: "observed/trails/staff", mine: "observed/trails/mine" };
const PRIVATE_TILE_PREFIXES = [
  `${API_V2_BASE}/observed/trails/mine/`,
  `${API_V2_BASE}/observed/trails/staff/`,
  `${API_V2_BASE}/observed/coverage/staff/`,
];

export function getTrailTileJsonUrl({ kind, operatorId }: TrailTiles): string {
  return `${API_V2_BASE}/${TRAIL_PATHS[kind]}/tilejson?operatorIds=${operatorId}`;
}

export function getCoverageTileJsonUrl(observedCellIds: readonly number[], isStaff: boolean): string {
  const path = isStaff ? "observed/coverage/staff" : "observed/coverage";
  const cellIds = [...new Set(observedCellIds)].sort((left, right) => left - right).slice(0, COVERAGE_CELL_LIMIT);
  return `${API_V2_BASE}/${path}/tilejson?observedCellIds=${cellIds.join(",")}`;
}

export function transformCrowdTileRequest(url: string): RequestParameters | undefined {
  return PRIVATE_TILE_PREFIXES.some((prefix) => url.startsWith(prefix)) ? { url, credentials: "include" } : undefined;
}
