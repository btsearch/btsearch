import { calculateDistance } from "@openbts/shared/radiolinesUtils";
import { ANTENNA_AZIMUTH_TOLERANCE_DEG } from "@openbts/shared/terrainProfile";
import { randomUUID } from "node:crypto";

import redis from "../../database/redis.js";
import { ErrorResponse } from "../../errors.js";
import { logger } from "../../utils/logger.js";
import { acquireRedisLock, refreshOwnedRedisLock, releaseOwnedRedisLock } from "../../utils/redisLock.js";
import { TERRAIN_PROFILE_MAX_DISTANCE_M } from "./config.js";
import { fillReliableElevations } from "./elevationCoverage.js";
import { analyzeTerrainProfile } from "./geometry.js";
import { getSI2PEMAntennaCandidates } from "./si2pem.adapter.js";
import { type ResolvedStationWithFallbacks, resolveNetWorksSharingSibling, resolveTerrainStation } from "./stationResolver.js";
import { GeoportalTerrainSampler, type TerrainSampler } from "./terrainSampler.js";
import type {
  AntennaCandidate,
  ReadyTerrainProfileAnalysis,
  StoredTerrainProfileJob,
  TerrainProfileAnalysis,
  TerrainProfileRequest,
  TerrainWarningCode,
} from "./types.js";

const JOB_TTL_SECONDS = 3600;
const JOB_CLAIM_TTL_SECONDS = 90;
const JOB_CLAIM_REFRESH_MS = 30_000;
const MIN_DISTANCE_M = 10;
const terrainSampler: TerrainSampler = new GeoportalTerrainSampler();

function jobKey(analysisId: string): string {
  return `terrain:analysis:v2:${analysisId}`;
}

function jobClaimKey(analysisId: string): string {
  return `${jobKey(analysisId)}:claim`;
}

async function saveJob(job: StoredTerrainProfileJob): Promise<void> {
  await redis.setEx(jobKey(job.analysis.analysis_id), JOB_TTL_SECONDS, JSON.stringify(job));
}

async function loadJob(analysisId: string): Promise<StoredTerrainProfileJob | null> {
  const raw = await redis.get(jobKey(analysisId));
  return raw ? (JSON.parse(raw) as StoredTerrainProfileJob) : null;
}

function uniqueWarnings(warnings: TerrainWarningCode[]): TerrainWarningCode[] {
  return [...new Set(warnings)];
}

function selectAntenna(candidates: AntennaCandidate[], requestedKey: string | undefined): AntennaCandidate | null {
  if (requestedKey) return candidates.find((candidate) => candidate.key === requestedKey) ?? null;
  return candidates.length === 1 ? candidates[0]! : null;
}

function confidenceLevel(value: number): "high" | "medium" | "low" {
  if (value >= 2) return "high";
  if (value >= 1) return "medium";
  return "low";
}

async function failAndSave(job: StoredTerrainProfileJob, code: string, message: string, warningCodes: TerrainWarningCode[]): Promise<void> {
  job.analysis = {
    analysis_id: job.analysis.analysis_id,
    status: "failed",
    createdAt: job.analysis.createdAt,
    updatedAt: new Date().toISOString(),
    errors: [{ code, message }],
    warning_codes: uniqueWarnings(warningCodes),
  };
  await saveJob(job);
}

type AntennaDataLookup = {
  report: ReadyTerrainProfileAnalysis["report"];
  candidates: AntennaCandidate[];
  warningCodes: TerrainWarningCode[];
};

async function lookupAntennaData(resolved: ResolvedStationWithFallbacks): Promise<AntennaDataLookup> {
  const si2pem = await getSI2PEMAntennaCandidates(resolved.station, resolved.ukeCandidates).catch(() => ({
    report: null,
    candidates: [],
    warningCodes: ["SI2PEM_REPORT_UNAVAILABLE" as const],
  }));
  const warningCodes: TerrainWarningCode[] = [...si2pem.warningCodes];
  const candidates = si2pem.candidates.length ? si2pem.candidates : resolved.ukeCandidates;
  if (!si2pem.candidates.length && resolved.ukeCandidates.length) warningCodes.push("UKE_ANTENNA_FALLBACK");
  return { report: si2pem.report, candidates, warningCodes };
}

async function lookupSiblingAntennaData(resolved: ResolvedStationWithFallbacks): Promise<AntennaDataLookup | null> {
  const sibling = await resolveNetWorksSharingSibling(resolved).catch(() => null);
  if (!sibling) return null;
  const siblingData = await lookupAntennaData(sibling);
  if (!siblingData.candidates.length) return null;
  return { ...siblingData, warningCodes: [...siblingData.warningCodes, "NETWORKS_SHARING_DATA"] };
}

async function runAnalysis(job: StoredTerrainProfileJob, preResolved?: ResolvedStationWithFallbacks): Promise<void> {
  const warningCodes: TerrainWarningCode[] = [];

  try {
    const resolved = preResolved ?? (await resolveTerrainStation(job.request.station));
    const distanceM = calculateDistance(
      resolved.station.latitude,
      resolved.station.longitude,
      job.request.receiver.latitude,
      job.request.receiver.longitude,
    );
    if (distanceM < MIN_DISTANCE_M || distanceM > TERRAIN_PROFILE_MAX_DISTANCE_M) {
      await failAndSave(
        job,
        "PATH_DISTANCE_OUT_OF_RANGE",
        `The path must be between ${MIN_DISTANCE_M} and ${TERRAIN_PROFILE_MAX_DISTANCE_M} metres.`,
        warningCodes,
      );
      return;
    }

    let antennaData = await lookupAntennaData(resolved);
    if (!antennaData.candidates.length) {
      const siblingData = await lookupSiblingAntennaData(resolved);
      if (siblingData) antennaData = siblingData;
    }
    warningCodes.push(...antennaData.warningCodes);

    const { report, candidates } = antennaData;
    if (!candidates.length) {
      await failAndSave(job, "ANTENNA_DATA_UNAVAILABLE", "No usable antenna height and frequency data is available.", warningCodes);
      return;
    }

    const selectedAntenna = selectAntenna(candidates, job.request.antenna_key);
    if (!selectedAntenna) {
      warningCodes.push(job.request.antenna_key ? "ANTENNA_SELECTION_INVALID" : "ANTENNA_SELECTION_REQUIRED");
      job.analysis = {
        analysis_id: job.analysis.analysis_id,
        status: "selection_required",
        createdAt: job.analysis.createdAt,
        updatedAt: new Date().toISOString(),
        station: resolved.station,
        report,
        candidates,
        warning_codes: uniqueWarnings(warningCodes),
      };
      await saveJob(job);
      return;
    }

    if (await isCancelled(job.analysis.analysis_id)) return;

    const terrain = await terrainSampler.samplePath(resolved.station, job.request.receiver);
    if (terrain.stale) warningCodes.push("TERRAIN_CACHE_STALE");
    if (await isCancelled(job.analysis.analysis_id)) return;

    const terrainElevations = fillReliableElevations(
      terrain.samples.map((sample) => sample.terrainElevationM),
      terrain.effectiveResolutionM,
    );
    if (terrain.terrainStatus === "partial") warningCodes.push("TERRAIN_MODEL_PARTIAL");
    if (!terrainElevations) {
      await failAndSave(job, "TERRAIN_DATA_UNAVAILABLE", "GUGiK NMT did not return enough terrain samples", warningCodes);
      return;
    }

    const reliableSurfaceElevations = fillReliableElevations(
      terrain.samples.map((sample) => sample.surfaceElevationM),
      terrain.effectiveResolutionM,
    );
    const surfaceModelStatus = reliableSurfaceElevations ? terrain.surfaceStatus : "unavailable";
    if (surfaceModelStatus === "partial") warningCodes.push("SURFACE_MODEL_PARTIAL");
    if (surfaceModelStatus === "unavailable") warningCodes.push("SURFACE_MODEL_UNAVAILABLE");
    const surfaceElevations = reliableSurfaceElevations ?? terrainElevations;
    const geometry = analyzeTerrainProfile({
      transmitter: {
        latitude: resolved.station.latitude,
        longitude: resolved.station.longitude,
        antennaHeightAglM: selectedAntenna.antenna.mountedHeight,
      },
      receiver: {
        latitude: job.request.receiver.latitude,
        longitude: job.request.receiver.longitude,
        antennaHeightAglM: job.request.receiver.mountedHeight,
      },
      frequencyMHz: selectedAntenna.frequencyMHz,
      sectorAzimuthDegrees: selectedAntenna.antenna.azimuth,
      samples: terrain.samples.map((sample, index) => ({
        distanceM: sample.distanceM,
        latitude: sample.latitude,
        longitude: sample.longitude,
        terrainElevationM: terrainElevations[index]!,
        surfaceElevationM: surfaceElevations[index]!,
      })),
    });

    if (geometry.azimuthDeltaDegrees !== null && geometry.azimuthDeltaDegrees > ANTENNA_AZIMUTH_TOLERANCE_DEG)
      warningCodes.push("ANTENNA_AZIMUTH_MISMATCH");
    const terrainStatus = geometry.lineOfSight.terrain ? "clear" : ("blocked" as const);
    const surfaceStatus = surfaceModelStatus === "unavailable" ? "unavailable" : geometry.status;
    const assessmentStatus = surfaceModelStatus === "available" ? geometry.status : "unavailable";
    const antennaConfidence = selectedAntenna.source === "si2pem_report" ? 2 : 0;
    const terrainConfidence = terrain.terrainStatus === "available" && !terrain.stale ? 2 : 1;
    let surfaceConfidence = 0;
    if (surfaceModelStatus === "available" && !terrain.stale) surfaceConfidence = 2;
    else if (surfaceModelStatus === "partial") surfaceConfidence = 1;
    const overallConfidence = Math.min(antennaConfidence, terrainConfidence, surfaceConfidence);

    const ready: ReadyTerrainProfileAnalysis = {
      analysis_id: job.analysis.analysis_id,
      status: "ready",
      createdAt: job.analysis.createdAt,
      updatedAt: new Date().toISOString(),
      station: resolved.station,
      report,
      candidates,
      selected_antenna_key: selectedAntenna.key,
      terrain: {
        sampled_at: terrain.sampledAt,
        from_cache: terrain.fromCache,
        stale: terrain.stale,
        terrain_model: {
          status: terrain.terrainStatus,
          dataset: "GUGiK NMT DTM_PL-EVRF2007-NH",
          source: "GUGiK",
          resolution_m: terrain.effectiveResolutionM,
        },
        surface_model: {
          status: surfaceModelStatus,
          dataset: "GUGiK NMPT DSM_PL-EVRF2007-NH",
          source: "GUGiK",
          resolution_m: terrain.effectiveResolutionM,
        },
      },
      path: {
        distance_m: geometry.distanceM,
        bearing_deg: geometry.bearingDegrees,
        effective_resolution_m: terrain.effectiveResolutionM,
        samples: {
          distance_m: terrain.samples.map((s) => s.distanceM),
          latitude: terrain.samples.map((s) => s.latitude),
          longitude: terrain.samples.map((s) => s.longitude),
          terrain_elevation_m: terrain.samples.map((s) => s.terrainElevationM),
          surface_elevation_m: terrain.samples.map((s) => s.surfaceElevationM),
          line_of_sight_elevation_m: geometry.samples.map((s) => s.lineOfSightElevationM),
          terrain_clearance_m: geometry.samples.map((s) => s.terrainClearanceM),
          surface_clearance_m: geometry.samples.map((s) => (surfaceModelStatus === "unavailable" ? null : s.surfaceClearanceM)),
        },
      },
      propagation: {
        path_type: geometry.p1812.pathType,
        basic_transmission_loss_db: geometry.p1812.basicTransmissionLossDb,
        field_strength_dbuvm: geometry.p1812.fieldStrengthDbuvm,
        free_space_loss_db: geometry.p1812.freeSpaceLossDb,
        diffraction_loss_db: geometry.p1812.diffractionLossDb,
        troposcatter_loss_db: geometry.p1812.troposcatterLossDb,
        anomalous_loss_db: geometry.p1812.anomalousLossDb,
        tx_horizon_distance_km: geometry.p1812.txHorizonDistanceKm,
        rx_horizon_distance_km: geometry.p1812.rxHorizonDistanceKm,
        effective_earth_radius_km: geometry.p1812.effectiveEarthRadiusKm,
        beta0: geometry.p1812.beta0,
        sea_fraction: geometry.p1812.seaFraction,
        bullington_distance_km: geometry.p1812.bullingtonDistanceKm,
      },
      assessment: {
        status: assessmentStatus,
        terrain_status: terrainStatus,
        surface_status: surfaceStatus,
        line_of_sight: surfaceModelStatus === "unavailable" ? geometry.lineOfSight.terrain : geometry.lineOfSight.surface,
        azimuth_delta_deg: geometry.azimuthDeltaDegrees,
        minimum_terrain_clearance_m: geometry.clearance.minimumTerrainM,
        minimum_surface_clearance_m: surfaceModelStatus === "unavailable" ? null : geometry.clearance.minimumSurfaceM,
        warning_codes: uniqueWarnings(warningCodes),
      },
      confidence: {
        antenna: confidenceLevel(antennaConfidence),
        terrain: confidenceLevel(terrainConfidence),
        surface: confidenceLevel(surfaceConfidence),
        overall: confidenceLevel(overallConfidence),
      },
    };

    job.analysis = ready;
    await saveJob(job);
  } catch (error) {
    logger.error("terrain_profile_analysis_failed", {
      analysisId: job.analysis.analysis_id,
      error: error instanceof Error ? error.message : String(error),
    });
    await failAndSave(job, "ANALYSIS_FAILED", "The terrain profile could not be generated", warningCodes);
  }
}

async function runClaimedAnalysis(job: StoredTerrainProfileJob, preResolved?: ResolvedStationWithFallbacks): Promise<void> {
  const analysisId = job.analysis.analysis_id;
  const claimKey = jobClaimKey(analysisId);
  const claimToken = randomUUID();
  if (!(await acquireRedisLock(claimKey, claimToken, JOB_CLAIM_TTL_SECONDS))) return;

  const refreshTimer = setInterval(() => {
    void refreshOwnedRedisLock(claimKey, claimToken, JOB_CLAIM_TTL_SECONDS).catch((error) => {
      logger.error("terrain_profile_analysis_claim_refresh_failed", {
        analysisId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, JOB_CLAIM_REFRESH_MS);
  refreshTimer.unref();

  try {
    const currentJob = await loadJob(analysisId);
    if (!currentJob || currentJob.analysis.status !== "pending") return;
    await runAnalysis(currentJob, preResolved);
  } finally {
    clearInterval(refreshTimer);
    await releaseOwnedRedisLock(claimKey, claimToken).catch((error) => {
      logger.error("terrain_profile_analysis_claim_release_failed", {
        analysisId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

function scheduleAnalysis(job: StoredTerrainProfileJob, preResolved?: ResolvedStationWithFallbacks): void {
  setImmediate(() => {
    void runClaimedAnalysis(job, preResolved).catch((error) => {
      logger.error("terrain_profile_analysis_schedule_failed", {
        analysisId: job.analysis.analysis_id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

export async function createTerrainProfileAnalysis(request: TerrainProfileRequest): Promise<TerrainProfileAnalysis> {
  const resolved = await resolveTerrainStation(request.station);
  const timestamp = new Date().toISOString();
  const analysis: TerrainProfileAnalysis = {
    analysis_id: randomUUID(),
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const job: StoredTerrainProfileJob = { request, analysis };
  await saveJob(job);
  scheduleAnalysis(job, resolved);
  return analysis;
}

function cancelKey(analysisId: string): string {
  return `${jobKey(analysisId)}:cancelled`;
}

async function isCancelled(analysisId: string): Promise<boolean> {
  return (await redis.exists(cancelKey(analysisId))) === 1;
}

function looksAbandoned(updatedAt: string): boolean {
  return Date.now() - Date.parse(updatedAt) > JOB_CLAIM_TTL_SECONDS * 1000;
}

export async function getTerrainProfileAnalysis(analysisId: string): Promise<TerrainProfileAnalysis> {
  const job = await loadJob(analysisId);
  if (!job) throw new ErrorResponse("NOT_FOUND");
  if (job.analysis.status === "pending" && looksAbandoned(job.analysis.updatedAt)) scheduleAnalysis(job);
  return job.analysis;
}

export async function cancelTerrainProfileAnalysis(analysisId: string): Promise<void> {
  await redis.setEx(cancelKey(analysisId), JOB_TTL_SECONDS, "1");
}
