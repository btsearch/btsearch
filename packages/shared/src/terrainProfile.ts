export const TERRAIN_RECEIVER_BOUNDS = {
  latitude: { min: 48.8, max: 55.2 },
  longitude: { min: 13.8, max: 24.5 },
  mountedHeight: { min: 0.5, max: 100 },
} as const;

export const ANTENNA_AZIMUTH_TOLERANCE_DEG = 60;

export function circularAzimuthDeltaDeg(a: number, b: number): number {
  const diff = Math.abs((((a % 360) + 360) % 360) - (((b % 360) + 360) % 360));
  return Math.min(diff, 360 - diff);
}

export type TerrainStationSource = "internal" | "uke";

export type TerrainWarningCode =
  | "ANTENNA_SELECTION_REQUIRED"
  | "ANTENNA_SELECTION_INVALID"
  | "SI2PEM_REPORT_UNAVAILABLE"
  | "SI2PEM_REPORT_PARSE_FAILED"
  | "UKE_ANTENNA_FALLBACK"
  | "NETWORKS_SHARING_DATA"
  | "ANTENNA_AZIMUTH_MISMATCH"
  | "SURFACE_MODEL_UNAVAILABLE"
  | "SURFACE_MODEL_PARTIAL"
  | "TERRAIN_MODEL_PARTIAL"
  | "TERRAIN_CACHE_STALE";

export type TerrainClearanceStatus = "clear" | "constrained" | "blocked" | "unavailable";
export type TerrainModelStatus = "available" | "partial" | "unavailable";
export type TerrainConfidenceLevel = "high" | "medium" | "low";

export type TerrainAntennaCandidate = {
  key: string;
  source: "si2pem_report" | "uke_permit_fallback";
  antenna: {
    mountedHeight: number;
    azimuth: number | null;
  };
  frequencyMHz: number;
  measuredTilt: number | null;
  band: {
    id: number;
    name: string;
    value: number | null;
    rat: string;
    duplex: string | null;
    variant: string;
  } | null;
  provenance: {
    report_url: string | null;
    report_date: string | null;
    permit_id: number | null;
    decision_number: string | null;
  };
};

export type TerrainResolvedStation = {
  source: TerrainStationSource;
  id: number;
  station_id: string;
  latitude: number;
  longitude: number;
  operator: { id: number; name: string; full_name: string; parent_id: number | null; mnc: number } | null;
};

export type TerrainSI2PEMReport = {
  source: "si2pem";
  url: string;
  published_at: string | null;
  laboratory_name: string | null;
};

export type TerrainModelMetadata = {
  status: TerrainModelStatus;
  dataset: string;
  source: "GUGiK";
  resolution_m: number;
};

export type TerrainPathSamples = {
  distance_m: number[];
  latitude: number[];
  longitude: number[];
  terrain_elevation_m: (number | null)[];
  surface_elevation_m: (number | null)[];
  line_of_sight_elevation_m: (number | null)[];
  terrain_clearance_m: (number | null)[];
  surface_clearance_m: (number | null)[];
};

export type P1812PathDiagnostics = {
  path_type: "los" | "transhorizon";
  basic_transmission_loss_db: number;
  field_strength_dbuvm: number;
  free_space_loss_db: number;
  diffraction_loss_db: number;
  troposcatter_loss_db: number;
  anomalous_loss_db: number;
  tx_horizon_distance_km: number;
  rx_horizon_distance_km: number;
  effective_earth_radius_km: number;
  beta0: number;
  sea_fraction: number;
  bullington_distance_km: number | null;
};

type TerrainAnalysisBase = {
  analysis_id: string;
  createdAt: string;
  updatedAt: string;
};

export type PendingTerrainAnalysis = TerrainAnalysisBase & {
  status: "pending";
};

export type SelectionRequiredTerrainAnalysis = TerrainAnalysisBase & {
  status: "selection_required";
  station: TerrainResolvedStation;
  report: TerrainSI2PEMReport | null;
  candidates: TerrainAntennaCandidate[];
  warning_codes: TerrainWarningCode[];
};

export type ReadyTerrainAnalysis = TerrainAnalysisBase & {
  status: "ready";
  station: TerrainResolvedStation;
  report: TerrainSI2PEMReport | null;
  candidates: TerrainAntennaCandidate[];
  selected_antenna_key: string;
  terrain: {
    sampled_at: string;
    from_cache: boolean;
    stale: boolean;
    terrain_model: TerrainModelMetadata;
    surface_model: TerrainModelMetadata;
  };
  path: {
    distance_m: number;
    bearing_deg: number;
    effective_resolution_m: number;
    samples: TerrainPathSamples;
  };
  propagation: P1812PathDiagnostics;
  assessment: {
    status: TerrainClearanceStatus;
    terrain_status: TerrainClearanceStatus;
    surface_status: TerrainClearanceStatus;
    line_of_sight: boolean;
    azimuth_delta_deg: number | null;
    minimum_terrain_clearance_m: number | null;
    minimum_surface_clearance_m: number | null;
    warning_codes: TerrainWarningCode[];
  };
  confidence: {
    antenna: TerrainConfidenceLevel;
    terrain: TerrainConfidenceLevel;
    surface: TerrainConfidenceLevel;
    overall: TerrainConfidenceLevel;
  };
};

export type FailedTerrainAnalysis = TerrainAnalysisBase & {
  status: "failed";
  errors: { code: string; message: string }[];
  warning_codes: TerrainWarningCode[];
};

export type TerrainAnalysis = PendingTerrainAnalysis | SelectionRequiredTerrainAnalysis | ReadyTerrainAnalysis | FailedTerrainAnalysis;
