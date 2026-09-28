import { type TerrainAnalysis as SharedTerrainAnalysis, TERRAIN_RECEIVER_BOUNDS } from "@openbts/shared/terrainProfile";
import { z } from "zod/v4";

export const TerrainProfileRequestSchema = z.object({
  station: z.discriminatedUnion("source", [
    z.object({ source: z.literal("internal"), id: z.number().int().positive() }),
    z.object({ source: z.literal("uke"), id: z.number().int().positive() }),
  ]),
  receiver: z.object({
    latitude: z.number().min(TERRAIN_RECEIVER_BOUNDS.latitude.min).max(TERRAIN_RECEIVER_BOUNDS.latitude.max),
    longitude: z.number().min(TERRAIN_RECEIVER_BOUNDS.longitude.min).max(TERRAIN_RECEIVER_BOUNDS.longitude.max),
    mountedHeight: z.number().min(TERRAIN_RECEIVER_BOUNDS.mountedHeight.min).max(TERRAIN_RECEIVER_BOUNDS.mountedHeight.max),
  }),
  antenna_key: z.string().min(1).max(128).optional(),
});

export type TerrainProfileRequest = z.infer<typeof TerrainProfileRequestSchema>;

export const TerrainWarningCodeSchema = z.enum([
  "ANTENNA_SELECTION_REQUIRED",
  "ANTENNA_SELECTION_INVALID",
  "SI2PEM_REPORT_UNAVAILABLE",
  "SI2PEM_REPORT_PARSE_FAILED",
  "UKE_ANTENNA_FALLBACK",
  "NETWORKS_SHARING_DATA",
  "ANTENNA_AZIMUTH_MISMATCH",
  "SURFACE_MODEL_UNAVAILABLE",
  "SURFACE_MODEL_PARTIAL",
  "TERRAIN_MODEL_PARTIAL",
  "TERRAIN_CACHE_STALE",
]);

export type TerrainWarningCode = z.infer<typeof TerrainWarningCodeSchema>;

export const AntennaCandidateSchema = z.object({
  key: z.string(),
  source: z.enum(["si2pem_report", "uke_permit_fallback"]),
  antenna: z.object({
    mountedHeight: z.number().positive(),
    azimuth: z.number().min(0).max(360).nullable(),
  }),
  frequencyMHz: z.number().positive(),
  measuredTilt: z.number().nullable(),
  band: z
    .object({
      id: z.number().int().positive(),
      name: z.string(),
      value: z.number().positive().nullable(),
      rat: z.string(),
      duplex: z.string().nullable(),
      variant: z.string(),
    })
    .nullable(),
  provenance: z.object({
    report_url: z.url().nullable(),
    report_date: z.iso.datetime({ offset: true }).nullable(),
    permit_id: z.number().int().positive().nullable(),
    decision_number: z.string().nullable(),
  }),
});

export type AntennaCandidate = z.infer<typeof AntennaCandidateSchema>;

export const ResolvedTerrainStationSchema = z.object({
  source: z.enum(["internal", "uke"]),
  id: z.number().int().positive(),
  station_id: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  operator: z
    .object({
      id: z.number().int().positive(),
      name: z.string(),
      full_name: z.string(),
      parent_id: z.number().int().nullable(),
      mnc: z.number().int(),
    })
    .nullable(),
});

export type ResolvedTerrainStation = z.infer<typeof ResolvedTerrainStationSchema>;

export const SI2PEMReportSchema = z.object({
  source: z.literal("si2pem"),
  url: z.url(),
  published_at: z.iso.datetime({ offset: true }).nullable(),
  laboratory_name: z.string().nullable(),
});

export type SI2PEMReport = z.infer<typeof SI2PEMReportSchema>;

const TerrainModelMetadataSchema = z.object({
  status: z.enum(["available", "partial", "unavailable"]),
  dataset: z.string(),
  source: z.literal("GUGiK"),
  resolution_m: z.number().positive(),
});

const TerrainPathSamplesSchema = z.object({
  distance_m: z.array(z.number()),
  latitude: z.array(z.number()),
  longitude: z.array(z.number()),
  terrain_elevation_m: z.array(z.number().nullable()),
  surface_elevation_m: z.array(z.number().nullable()),
  line_of_sight_elevation_m: z.array(z.number().nullable()),
  terrain_clearance_m: z.array(z.number().nullable()),
  surface_clearance_m: z.array(z.number().nullable()),
});

const P1812PathDiagnosticsSchema = z.object({
  path_type: z.enum(["los", "transhorizon"]),
  basic_transmission_loss_db: z.number(),
  field_strength_dbuvm: z.number(),
  free_space_loss_db: z.number(),
  diffraction_loss_db: z.number(),
  troposcatter_loss_db: z.number(),
  anomalous_loss_db: z.number(),
  tx_horizon_distance_km: z.number(),
  rx_horizon_distance_km: z.number(),
  effective_earth_radius_km: z.number(),
  beta0: z.number(),
  sea_fraction: z.number(),
  bullington_distance_km: z.number().nullable(),
});

const AssessmentStatusSchema = z.enum(["clear", "constrained", "blocked", "unavailable"]);
const ConfidenceLevelSchema = z.enum(["high", "medium", "low"]);

const AnalysisBaseSchema = z.object({
  analysis_id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const PendingTerrainProfileAnalysisSchema = AnalysisBaseSchema.extend({
  status: z.literal("pending"),
});

const StationWithCandidatesFields = {
  station: ResolvedTerrainStationSchema,
  report: SI2PEMReportSchema.nullable(),
  candidates: z.array(AntennaCandidateSchema).min(1),
};

export const SelectionRequiredTerrainProfileAnalysisSchema = AnalysisBaseSchema.extend({
  status: z.literal("selection_required"),
  ...StationWithCandidatesFields,
  warning_codes: z.array(TerrainWarningCodeSchema),
});

export const ReadyTerrainProfileAnalysisSchema = AnalysisBaseSchema.extend({
  status: z.literal("ready"),
  ...StationWithCandidatesFields,
  selected_antenna_key: z.string(),
  terrain: z.object({
    sampled_at: z.iso.datetime({ offset: true }),
    from_cache: z.boolean(),
    stale: z.boolean(),
    terrain_model: TerrainModelMetadataSchema,
    surface_model: TerrainModelMetadataSchema,
  }),
  path: z.object({
    distance_m: z.number().positive(),
    bearing_deg: z.number().min(0).max(360),
    effective_resolution_m: z.number().positive(),
    samples: TerrainPathSamplesSchema,
  }),
  propagation: P1812PathDiagnosticsSchema,
  assessment: z.object({
    status: AssessmentStatusSchema,
    terrain_status: AssessmentStatusSchema,
    surface_status: AssessmentStatusSchema,
    line_of_sight: z.boolean(),
    azimuth_delta_deg: z.number().min(0).max(180).nullable(),
    vertical_alignment: z
      .object({
        basis: z.enum(["si2pem_measured_resultant_tilt", "unavailable"]),
        path_elevation_deg: z.number(),
        main_beam_elevation_deg: z.number().nullable(),
        vertical_offset_deg: z.number().nullable(),
      })
      .optional(),
    minimum_terrain_clearance_m: z.number().nullable(),
    minimum_surface_clearance_m: z.number().nullable(),
    warning_codes: z.array(TerrainWarningCodeSchema),
  }),
  confidence: z.object({
    antenna: ConfidenceLevelSchema,
    terrain: ConfidenceLevelSchema,
    surface: ConfidenceLevelSchema,
    overall: ConfidenceLevelSchema,
  }),
});

export const FailedTerrainProfileAnalysisSchema = AnalysisBaseSchema.extend({
  status: z.literal("failed"),
  errors: z.array(z.object({ code: z.string(), message: z.string() })).min(1),
  warning_codes: z.array(TerrainWarningCodeSchema),
});

export const TerrainProfileAnalysisSchema = z.discriminatedUnion("status", [
  PendingTerrainProfileAnalysisSchema,
  SelectionRequiredTerrainProfileAnalysisSchema,
  ReadyTerrainProfileAnalysisSchema,
  FailedTerrainProfileAnalysisSchema,
]);

export type PendingTerrainProfileAnalysis = z.infer<typeof PendingTerrainProfileAnalysisSchema>;
export type SelectionRequiredTerrainProfileAnalysis = z.infer<typeof SelectionRequiredTerrainProfileAnalysisSchema>;
export type ReadyTerrainProfileAnalysis = z.infer<typeof ReadyTerrainProfileAnalysisSchema>;
export type FailedTerrainProfileAnalysis = z.infer<typeof FailedTerrainProfileAnalysisSchema>;
export type TerrainProfileAnalysis = z.infer<typeof TerrainProfileAnalysisSchema>;

type AssertAssignable<T extends U, U> = T;
export type _TerrainAnalysisMatchesShared = AssertAssignable<TerrainProfileAnalysis, SharedTerrainAnalysis>;
export type _SharedMatchesTerrainAnalysis = AssertAssignable<SharedTerrainAnalysis, TerrainProfileAnalysis>;

export type StoredTerrainProfileJob = {
  request: TerrainProfileRequest;
  analysis: TerrainProfileAnalysis;
};

export type TerrainPathSample = {
  distanceM: number;
  latitude: number;
  longitude: number;
  terrainElevationM: number | null;
  surfaceElevationM: number | null;
};

export type TerrainSampleResult = {
  sampledAt: string;
  fromCache: boolean;
  stale: boolean;
  effectiveResolutionM: number;
  terrainStatus: "available" | "partial" | "unavailable";
  surfaceStatus: "available" | "partial" | "unavailable";
  samples: TerrainPathSample[];
};
