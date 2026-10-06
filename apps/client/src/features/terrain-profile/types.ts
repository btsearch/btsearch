import type { TerrainAntenna, TerrainProfile, TerrainResult, TerrainSelectedAntenna } from "@openbts/shared/contract";

import type { StationSource } from "@/types/station";

export type { TerrainAntenna, TerrainFailureReason, TerrainResult, TerrainSample, TerrainWarning } from "@openbts/shared/contract";

export type TerrainProfileRecord = Omit<TerrainProfile, "candidates" | "propagation"> & { candidates: TerrainAntenna[] };

export type ReadyTerrainProfile = TerrainProfileRecord & { status: "ready"; antenna: TerrainSelectedAntenna; result: TerrainResult };

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

type TerrainProfileStationRef = {
  source: StationSource;
  id: number;
};

export type TerrainProfileStationTarget = TerrainProfileStationRef &
  GeoPoint & {
    operatorId: number | null;
    siteId: string;
    operatorName: string;
    city: string | null;
    address: string | null;
  };

export type TerrainProfileGpsError = "unsupported" | "permissionDenied" | "unavailable" | "timeout" | "unknown";

export type TerrainProfileRequest = {
  station: TerrainProfileStationRef;
  receiver: GeoPoint & { heightMeters: number };
  antennaKey?: string;
};

export function isReadyTerrainProfile(profile: TerrainProfileRecord): profile is ReadyTerrainProfile {
  return profile.status === "ready" && profile.antenna !== null && profile.result !== null;
}
