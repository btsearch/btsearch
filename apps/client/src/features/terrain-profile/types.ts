import type {
  TerrainAnalysis,
  TerrainAntennaCandidate,
  TerrainClearanceStatus,
  TerrainPathSamples,
  TerrainResolvedStation,
} from "@openbts/shared/terrainProfile";

import type { StationSource } from "@/types/station";

export type {
  TerrainAnalysis as TerrainProfileAnalysis,
  TerrainAntennaCandidate as TerrainProfileAntennaCandidate,
  TerrainClearanceStatus as TerrainProfileClearanceStatus,
  TerrainPathSamples as TerrainProfileSamples,
  TerrainResolvedStation as TerrainProfileStationResult,
};

export type TerrainProfileSample = {
  distance_m: number;
  latitude: number;
  longitude: number;
  terrain_elevation_m: number | null;
  surface_elevation_m: number | null;
  line_of_sight_elevation_m: number | null;
  terrain_clearance_m: number | null;
  surface_clearance_m: number | null;
};

export type TerrainProfileStationRef = {
  source: StationSource;
  id: number;
};

export type TerrainProfileStationTarget = TerrainProfileStationRef & {
  stationId?: string;
  operatorName?: string;
  latitude?: number;
  longitude?: number;
};

export type TerrainProfileReceiver = {
  latitude: number;
  longitude: number;
  mountedHeight: number;
};

export type TerrainProfileGpsError = "unsupported" | "permissionDenied" | "unavailable" | "timeout" | "unknown";

export type TerrainProfileAnalysisRequest = {
  station: TerrainProfileStationRef;
  receiver: {
    latitude: number;
    longitude: number;
    mountedHeight: number;
  };
  antenna_key?: string;
};

export function samplesFromArrays(arrays: TerrainPathSamples): TerrainProfileSample[] {
  const n = arrays.distance_m.length;
  const result: TerrainProfileSample[] = Array.from({ length: n });
  for (let i = 0; i < n; i++) {
    result[i] = {
      distance_m: arrays.distance_m[i]!,
      latitude: arrays.latitude[i]!,
      longitude: arrays.longitude[i]!,
      terrain_elevation_m: arrays.terrain_elevation_m[i] ?? null,
      surface_elevation_m: arrays.surface_elevation_m[i] ?? null,
      line_of_sight_elevation_m: arrays.line_of_sight_elevation_m[i] ?? null,
      terrain_clearance_m: arrays.terrain_clearance_m[i] ?? null,
      surface_clearance_m: arrays.surface_clearance_m[i] ?? null,
    };
  }
  return result;
}
