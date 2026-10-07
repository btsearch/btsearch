import { TERRAIN_RECEIVER_BOUNDS } from "@openbts/shared/terrainProfile";
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
