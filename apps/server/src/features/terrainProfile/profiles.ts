import { TERRAIN_ANTENNA_TECHNOLOGIES, terrainPropagationSchema, terrainResultSchema } from "@openbts/shared/contract";
import type {
  EmfReportHead,
  TerrainAntenna,
  TerrainFailureReason,
  TerrainProfile,
  TerrainProfileCreate,
  TerrainProfileInclude,
  TerrainProfileStatus,
  TerrainPropagation,
  TerrainResult,
  TerrainSelectedAntenna,
  TerrainWarning,
} from "@openbts/shared/contract";
import { calculateBearing, calculateDistance } from "@openbts/shared/geo";
import { ANTENNA_AZIMUTH_TOLERANCE_DEG } from "@openbts/shared/terrainProfile";
import { createHash, randomUUID } from "node:crypto";

import redis from "../../database/redis.js";
import { ErrorResponse } from "../../errors.js";
import { acquireRedisLock, refreshOwnedRedisLock, releaseOwnedRedisLock } from "../../lib/redisLock.js";
import { errorMessage } from "../../utils/errorMessage.js";
import { logger } from "../../utils/logger.js";
import { si2pemDateToWarsawDay, toSI2PEMFileUrl } from "../pem/si2pemValues.js";
import { resolveAntennaMainBeam } from "./antennaAlignment.js";
import { nearestToBearing } from "./antennaSelection.js";
import {
  TERRAIN_PROFILE_MAX_DISTANCE_M,
  TERRAIN_PROFILE_MIN_DISTANCE_M,
  TERRAIN_PROFILE_TIME_LIMIT_MS,
  TERRAIN_SURFACE_TIME_LIMIT_MS,
} from "./config.js";
import { fillReliableElevations } from "./elevationCoverage.js";
import { analyzeTerrainProfile } from "./geometry.js";
import { lookupAntennaData, lookupSiblingAntennaData } from "./service.js";
import { type ResolvedStationWithFallbacks, resolveTerrainStation } from "./stationResolver.js";
import { GeoportalTerrainSampler, type TerrainSampler } from "./terrainSampler.js";
import type { AntennaCandidate, ElevationModelResult, SI2PEMReport, TerrainProfileRequest, TerrainWarningCode } from "./types.js";

type ProfileRequest = { station: TerrainProfileRequest["station"]; receiver: TerrainProfile["receiver"]; antennaKey?: string };
type AnalysisProgress = { stage: "antenna" | "elevation"; candidates: TerrainAntenna[]; report: EmfReportHead | null };

type StoredTerrainProfile = {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  request: ProfileRequest;
  status: TerrainProfileStatus;
  antenna: TerrainSelectedAntenna | null;
  report: EmfReportHead | null;
  result: TerrainResult | null;
  failure: TerrainProfile["failure"];
  candidates: TerrainAntenna[];
  propagation: TerrainPropagation | null;
};
type AnalysisOutcome = Pick<StoredTerrainProfile, "status" | "antenna" | "report" | "result" | "failure" | "candidates" | "propagation">;
type AnalyzedPath = {
  request: ProfileRequest;
  station: ResolvedStationWithFallbacks["station"];
  chosen: { key: string; candidate: AntennaCandidate };
  candidates: TerrainAntenna[];
  report: EmfReportHead | null;
  antennaWarnings: TerrainWarning[];
  ground: ElevationModelResult;
  groundElevations: number[];
};
type GroundAnalysis = { outcome: AnalysisOutcome; path: AnalyzedPath | null };

export const TERRAIN_PROFILE_POLL_SECONDS = 2;

const PROFILE_TTL_SECONDS = 3600;
const CLAIM_TTL_SECONDS = 90;
const CLAIM_REFRESH_MS = 30_000;
const CANCEL_POLL_MS = 1_000;
const ANTENNA_KEY_LENGTH = 16;
const USABLE_HEIGHT_METERS = { min: 1, max: 3000 };
const USABLE_FREQUENCY_MHZ = { min: 30, max: 6000 };
const ANTENNA_WARNINGS: Partial<Record<TerrainWarningCode, TerrainWarning>> = {
  SI2PEM_REPORT_UNAVAILABLE: "emfReportUnavailable",
  SI2PEM_REPORT_PARSE_FAILED: "emfReportUnreadable",
  PERMIT_ANTENNA_FALLBACK: "antennaFromPermit",
  NETWORKS_SHARING_DATA: "antennaFromSharedNetwork",
};

const sampler: TerrainSampler = new GeoportalTerrainSampler();
const running = new Map<string, AbortController>();

function profileKey(id: string): string {
  return `terrain:profile:v2:${id}`;
}

function claimKey(id: string): string {
  return `${profileKey(id)}:claim`;
}

function cancelKey(id: string): string {
  return `${profileKey(id)}:cancelled`;
}

function requestKey({ station, receiver, antennaKey }: ProfileRequest): string {
  const parts = [
    station.source,
    station.id,
    antennaKey ?? null,
    receiver.latitude.toFixed(5),
    receiver.longitude.toFixed(5),
    receiver.heightMeters.toFixed(1),
  ];
  return `terrain:profile:request:v2:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
}

async function saveProfile(profile: StoredTerrainProfile): Promise<StoredTerrainProfile> {
  const now = Date.now();
  const saved = { ...profile, updatedAt: new Date(now).toISOString(), expiresAt: new Date(now + PROFILE_TTL_SECONDS * 1000).toISOString() };
  await redis.setEx(profileKey(saved.id), PROFILE_TTL_SECONDS, JSON.stringify(saved));
  return saved;
}

async function loadProfile(id: string): Promise<StoredTerrainProfile | null> {
  const raw = await redis.get(profileKey(id));
  return raw ? (JSON.parse(raw) as StoredTerrainProfile) : null;
}

async function isCancelled(id: string): Promise<boolean> {
  return (await redis.exists(cancelKey(id))) === 1;
}

function isSurfacePending(profile: StoredTerrainProfile): boolean {
  return profile.status === "ready" && profile.result?.surfaceVerdict === "pending";
}

export function isTerrainProfileRunning(profile: StoredTerrainProfile): boolean {
  return profile.status === "pending" || isSurfacePending(profile);
}

function isAbandoned(profile: StoredTerrainProfile): boolean {
  return isTerrainProfileRunning(profile) && Date.now() - Date.parse(profile.updatedAt) > CLAIM_TTL_SECONDS * 1000;
}

function rounded(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundedOrNull(value: number | null, digits: number): number | null {
  return value === null ? null : rounded(value, digits);
}

function isUsable({ antenna, frequencyMHz }: AntennaCandidate): boolean {
  const hasUsableHeight = antenna.mountedHeight >= USABLE_HEIGHT_METERS.min && antenna.mountedHeight <= USABLE_HEIGHT_METERS.max;
  return hasUsableHeight && frequencyMHz >= USABLE_FREQUENCY_MHZ.min && frequencyMHz <= USABLE_FREQUENCY_MHZ.max;
}

function makeAntennaKey(candidate: AntennaCandidate): string {
  const parts = [candidate.source, candidate.antenna.mountedHeight, candidate.antenna.azimuth, candidate.frequencyMHz, candidate.measuredTilt];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, ANTENNA_KEY_LENGTH);
}

function toAntenna(key: string, candidate: AntennaCandidate): TerrainAntenna {
  const isFromReport = candidate.source === "si2pem_report";
  const technology = candidate.band?.rat.toLowerCase();

  return {
    key,
    source: isFromReport ? "emfReport" : "permit",
    heightMeters: candidate.antenna.mountedHeight,
    azimuth: candidate.antenna.azimuth,
    tilt: candidate.measuredTilt,
    tiltSource: candidate.measuredTilt === null ? null : "measured",
    frequencyMhz: candidate.frequencyMHz,
    technology: TERRAIN_ANTENNA_TECHNOLOGIES.find((value) => value === technology) ?? null,
    labelMhz: candidate.band?.value ?? null,
  };
}

function toReportHead(report: SI2PEMReport | null): EmfReportHead | null {
  if (report === null) return null;
  const url = toSI2PEMFileUrl(report.url);
  if (url === null) return null;
  return { url, measuredOn: si2pemDateToWarsawDay(report.published_at), laboratoryName: report.laboratory_name?.trim() || null };
}

function failed(
  reason: TerrainFailureReason,
  message: string,
  candidates: TerrainAntenna[] = [],
  report: EmfReportHead | null = null,
): AnalysisOutcome {
  return { status: "failed", antenna: null, report, result: null, failure: { reason, message }, candidates, propagation: null };
}

function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    signal.throwIfAborted();
    const stop = () => reject(signal.reason);
    signal.addEventListener("abort", stop, { once: true });
    void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
  });
}

function toSamplerReceiver(request: ProfileRequest): TerrainProfileRequest["receiver"] {
  return { latitude: request.receiver.latitude, longitude: request.receiver.longitude, mountedHeight: request.receiver.heightMeters };
}

function buildOutcome(path: AnalyzedPath, surface: ElevationModelResult | "pending" | null): AnalysisOutcome {
  const { request, station, chosen, ground, groundElevations } = path;
  const surfaceModel = surface === "pending" ? null : surface;
  const matchingSurface = surfaceModel?.samples.length === ground.samples.length ? surfaceModel : null;
  const surfaceElevations =
    matchingSurface === null
      ? null
      : fillReliableElevations(
          matchingSurface.samples.map((sample) => sample.elevationM),
          matchingSurface.effectiveResolutionM,
        );
  const geometry = analyzeTerrainProfile({
    transmitter: { latitude: station.latitude, longitude: station.longitude, antennaHeightAglM: chosen.candidate.antenna.mountedHeight },
    receiver: { latitude: request.receiver.latitude, longitude: request.receiver.longitude, antennaHeightAglM: request.receiver.heightMeters },
    frequencyMHz: chosen.candidate.frequencyMHz,
    sectorAzimuthDegrees: chosen.candidate.antenna.azimuth,
    mainBeamElevationDegrees: resolveAntennaMainBeam(chosen.candidate).mainBeamElevationDegrees,
    samples: ground.samples.map((sample, index) => ({
      distanceM: sample.distanceM,
      terrainElevationM: groundElevations[index]!,
      surfaceElevationM: (surfaceElevations ?? groundElevations)[index]!,
    })),
  });

  const warnings = new Set<TerrainWarning>(path.antennaWarnings);
  if (ground.stale || surfaceModel?.stale) warnings.add("elevationDataStale");
  if (ground.status === "partial") warnings.add("terrainDataIncomplete");
  if (surface !== "pending" && surfaceElevations === null) warnings.add("surfaceDataUnavailable");
  else if (surfaceModel?.status === "partial") warnings.add("surfaceDataIncomplete");
  if (geometry.azimuthDeltaDegrees !== null && geometry.azimuthDeltaDegrees > ANTENNA_AZIMUTH_TOLERANCE_DEG) warnings.add("outsideMainBeam");

  const { p1812 } = geometry;
  const obstacleDistanceMeters = p1812.bullingtonDistanceKm === null ? null : rounded(p1812.bullingtonDistanceKm * 1000, 2);
  let surfaceVerdict: TerrainResult["surfaceVerdict"] = "unknown";
  if (surface === "pending") surfaceVerdict = "pending";
  else if (surfaceElevations !== null) surfaceVerdict = geometry.status === "clear" ? "clear" : "blocked";

  const result: TerrainResult = {
    terrainVerdict: geometry.lineOfSight.terrain ? "clear" : "blocked",
    surfaceVerdict,
    distanceMeters: rounded(geometry.distanceM, 2),
    bearing: rounded(geometry.bearingDegrees, 2),
    pathLossDb: rounded(p1812.basicTransmissionLossDb, 2),
    referenceFieldStrengthDbuvm: rounded(p1812.fieldStrengthDbuvm, 2),
    beamOffset: {
      azimuth: roundedOrNull(geometry.azimuthDeltaDegrees, 2),
      elevation: roundedOrNull(geometry.verticalAlignment.verticalOffsetDegrees, 2),
    },
    obstacleDistanceMeters,
    samples: ground.samples.map((sample, index) => {
      const analyzed = geometry.samples[index]!;
      const surfaceMeters = surfaceElevations === null ? (matchingSurface?.samples[index]?.elevationM ?? null) : analyzed.surfaceElevationM;
      return {
        distanceMeters: rounded(sample.distanceM, 2),
        latitude: rounded(sample.latitude, 6),
        longitude: rounded(sample.longitude, 6),
        groundMeters: rounded(analyzed.terrainElevationM, 2),
        surfaceMeters: surfaceMeters === null ? null : rounded(Math.max(surfaceMeters, analyzed.terrainElevationM), 2),
        sightLineMeters: rounded(analyzed.lineOfSightElevationM - analyzed.earthBulgeM, 2),
      };
    }),
    elevationData: { source: "GUGiK", resolutionMeters: rounded(ground.effectiveResolutionM, 2) },
    warnings: [...warnings],
  };
  const propagation: TerrainPropagation = {
    pathType: p1812.pathType === "los" ? "lineOfSight" : "transHorizon",
    basicTransmissionLossDb: p1812.basicTransmissionLossDb,
    freeSpaceLossDb: p1812.freeSpaceLossDb,
    diffractionLossDb: p1812.diffractionLossDb,
    troposcatterLossDb: p1812.troposcatterLossDb,
    anomalousLossDb: p1812.anomalousLossDb,
    referenceFieldStrengthDbuvm: p1812.fieldStrengthDbuvm,
    transmitterHorizonDistanceMeters: p1812.txHorizonDistanceKm * 1000,
    receiverHorizonDistanceMeters: p1812.rxHorizonDistanceKm * 1000,
    effectiveEarthRadiusMeters: p1812.effectiveEarthRadiusKm * 1000,
    beta0: p1812.beta0,
    seaFraction: p1812.seaFraction,
    obstacleDistanceMeters,
  };
  if (!terrainResultSchema.safeParse(result).success || !terrainPropagationSchema.safeParse(propagation).success) {
    throw new Error("The terrain profile holds a value that cannot be sent");
  }

  return {
    status: "ready",
    antenna: { ...toAntenna(chosen.key, chosen.candidate), isAutoSelected: request.antennaKey === undefined },
    report: path.report,
    result,
    failure: null,
    candidates: path.candidates,
    propagation,
  };
}

async function analyze(
  request: ProfileRequest,
  resolved: ResolvedStationWithFallbacks,
  signal: AbortSignal,
  progress: AnalysisProgress,
): Promise<GroundAnalysis> {
  const { station } = resolved;
  let antennaData = await untilAborted(lookupAntennaData(resolved), signal);
  if (antennaData.candidates.length === 0) {
    const siblingData = await untilAborted(lookupSiblingAntennaData(resolved), signal);
    if (siblingData) antennaData = siblingData;
  }

  const report = toReportHead(antennaData.report);
  const usable = antennaData.candidates.filter(isUsable).map((candidate) => ({ key: makeAntennaKey(candidate), candidate }));
  const candidates = usable.map(({ key, candidate }) => toAntenna(key, candidate));
  if (usable.length === 0) {
    return { outcome: failed("antennaDataUnavailable", "No usable antenna height and frequency is known for this station.", [], report), path: null };
  }

  const bearing = calculateBearing(station.latitude, station.longitude, request.receiver.latitude, request.receiver.longitude);
  const chosen = request.antennaKey === undefined ? nearestToBearing(usable, bearing) : usable.find((entry) => entry.key === request.antennaKey);
  if (chosen === undefined) {
    return { outcome: failed("antennaNotFound", "The station has no antenna with this key.", candidates, report), path: null };
  }

  progress.stage = "elevation";
  progress.candidates = candidates;
  progress.report = report;
  const ground = await untilAborted(sampler.sampleGround(station, toSamplerReceiver(request), signal), signal);
  signal.throwIfAborted();

  const groundElevations = fillReliableElevations(
    ground.samples.map((sample) => sample.elevationM),
    ground.effectiveResolutionM,
  );
  if (groundElevations === null) {
    return { outcome: failed("elevationDataUnavailable", "The elevation data for this path is not available.", candidates, report), path: null };
  }

  const path: AnalyzedPath = {
    request,
    station,
    chosen,
    candidates,
    report,
    antennaWarnings: antennaData.warningCodes.flatMap((code) => ANTENNA_WARNINGS[code] ?? []),
    ground,
    groundElevations,
  };
  return { outcome: buildOutcome(path, "pending"), path };
}

async function runAnalysis(
  profile: StoredTerrainProfile,
  resolved: ResolvedStationWithFallbacks | undefined,
  cancel: AbortSignal,
): Promise<GroundAnalysis | null> {
  const timeLimit = AbortSignal.timeout(TERRAIN_PROFILE_TIME_LIMIT_MS);
  const progress: AnalysisProgress = { stage: "antenna", candidates: [], report: null };

  try {
    const station = resolved ?? (await resolveTerrainStation(profile.request.station));
    return await analyze(profile.request, station, AbortSignal.any([cancel, timeLimit]), progress);
  } catch (error) {
    if (cancel.aborted) return null;
    if (timeLimit.aborted) {
      const outcome =
        progress.stage === "antenna"
          ? failed("antennaDataUnavailable", "The antenna data did not arrive in time.")
          : failed("elevationDataUnavailable", "The elevation data did not arrive in time.", progress.candidates, progress.report);
      return { outcome, path: null };
    }

    logger.error("terrain_profile_failed", { id: profile.id, error: errorMessage(error) });
    return { outcome: failed("internalError", "The terrain profile could not be made.", progress.candidates, progress.report), path: null };
  }
}

async function addSurface(id: string, path: AnalyzedPath, cancel: AbortSignal): Promise<AnalysisOutcome | null> {
  const timeLimit = AbortSignal.timeout(TERRAIN_SURFACE_TIME_LIMIT_MS);
  const signal = AbortSignal.any([cancel, timeLimit]);
  try {
    const surface = await untilAborted(sampler.sampleSurface(path.station, toSamplerReceiver(path.request), signal), signal);
    return buildOutcome(path, surface);
  } catch (error) {
    if (cancel.aborted) return null;
    if (!timeLimit.aborted) logger.error("terrain_profile_surface_failed", { id, error: errorMessage(error) });
    return buildOutcome(path, null);
  }
}

async function runClaimed(id: string, resolved?: ResolvedStationWithFallbacks): Promise<void> {
  const token = randomUUID();
  if (!(await acquireRedisLock(claimKey(id), token, CLAIM_TTL_SECONDS))) return;

  const cancel = new AbortController();
  running.set(id, cancel);
  const refreshTimer = setInterval(() => {
    void refreshOwnedRedisLock(claimKey(id), token, CLAIM_TTL_SECONDS).catch((error) => {
      logger.error("terrain_profile_claim_refresh_failed", { id, error: errorMessage(error) });
    });
  }, CLAIM_REFRESH_MS);
  const cancelTimer = setInterval(() => {
    void isCancelled(id)
      .then((isStopped) => {
        if (isStopped) cancel.abort();
      })
      .catch(() => undefined);
  }, CANCEL_POLL_MS);
  refreshTimer.unref();
  cancelTimer.unref();

  try {
    const profile = await loadProfile(id);
    if (!profile || !isTerrainProfileRunning(profile)) return;

    const analysis = await runAnalysis(profile, resolved, cancel.signal);
    if (analysis === null || cancel.signal.aborted || (await isCancelled(id))) return;
    const groundProfile = await saveProfile({ ...profile, ...analysis.outcome });
    if (analysis.path === null) return;

    const outcome = await addSurface(id, analysis.path, cancel.signal);
    if (outcome === null || cancel.signal.aborted || (await isCancelled(id))) return;
    await saveProfile({ ...groundProfile, ...outcome });
  } finally {
    clearInterval(refreshTimer);
    clearInterval(cancelTimer);
    running.delete(id);
    await releaseOwnedRedisLock(claimKey(id), token).catch((error) => {
      logger.error("terrain_profile_claim_release_failed", { id, error: errorMessage(error) });
    });
  }
}

function schedule(id: string, resolved?: ResolvedStationWithFallbacks): void {
  setImmediate(() => {
    void runClaimed(id, resolved).catch((error) => {
      logger.error("terrain_profile_schedule_failed", { id, error: errorMessage(error) });
    });
  });
}

function toStationRef(body: TerrainProfileCreate): TerrainProfileRequest["station"] {
  if (body.stationId !== undefined) return { source: "internal", id: body.stationId };
  if (body.officialSiteId !== undefined) return { source: "official", id: body.officialSiteId };
  throw new ErrorResponse("BAD_REQUEST");
}

async function findReusable(request: ProfileRequest): Promise<StoredTerrainProfile | null> {
  const id = await redis.get(requestKey(request));
  const profile = id ? await loadProfile(id) : null;
  if (profile === null || (profile.status !== "pending" && profile.status !== "ready")) return null;

  if (isAbandoned(profile)) schedule(profile.id);
  return profile;
}

export async function createTerrainProfile(
  body: TerrainProfileCreate,
  beforeStart: () => Promise<void>,
): Promise<{ profile: StoredTerrainProfile; isNew: boolean }> {
  const request: ProfileRequest = { station: toStationRef(body), receiver: body.receiver };
  if (body.antennaKey !== undefined) request.antennaKey = body.antennaKey;

  const resolved = await resolveTerrainStation(request.station);
  const { south, north, west, east } = resolved.receiverBounds;
  const { latitude, longitude } = request.receiver;
  if (latitude < south || latitude > north || longitude < west || longitude > east) {
    throw new ErrorResponse("BAD_REQUEST", {
      message: `The receiver must be between latitudes ${south} and ${north} and longitudes ${west} and ${east}.`,
    });
  }

  const distance = calculateDistance(resolved.station.latitude, resolved.station.longitude, latitude, longitude);
  if (distance < TERRAIN_PROFILE_MIN_DISTANCE_M || distance > TERRAIN_PROFILE_MAX_DISTANCE_M) {
    throw new ErrorResponse("BAD_REQUEST", {
      message: `The receiver must be between ${TERRAIN_PROFILE_MIN_DISTANCE_M} and ${TERRAIN_PROFILE_MAX_DISTANCE_M} meters from the station.`,
    });
  }

  const reusable = await findReusable(request);
  if (reusable !== null) return { profile: reusable, isNew: false };

  await beforeStart();
  const now = new Date().toISOString();
  const profile = await saveProfile({
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    expiresAt: now,
    request,
    status: "pending",
    antenna: null,
    report: null,
    result: null,
    failure: null,
    candidates: [],
    propagation: null,
  });
  await redis.setEx(requestKey(request), PROFILE_TTL_SECONDS, profile.id);
  schedule(profile.id, resolved);

  return { profile, isNew: true };
}

export async function getTerrainProfile(id: string): Promise<StoredTerrainProfile> {
  const profile = await loadProfile(id);
  if (!profile) throw new ErrorResponse("NOT_FOUND");

  if (isAbandoned(profile)) schedule(id);
  return profile;
}

export async function cancelTerrainProfile(id: string): Promise<void> {
  const profile = await loadProfile(id);
  if (!profile) throw new ErrorResponse("NOT_FOUND");
  if (!isTerrainProfileRunning(profile)) return;

  await redis.setEx(cancelKey(id), PROFILE_TTL_SECONDS, "1");
  await saveProfile({ ...profile, status: "cancelled" });
  running.get(id)?.abort();
}

export function toTerrainProfile(stored: StoredTerrainProfile, include: readonly TerrainProfileInclude[] = []): TerrainProfile {
  const { station, receiver } = stored.request;
  const profile: TerrainProfile = {
    id: stored.id,
    status: stored.status,
    createdAt: stored.createdAt,
    expiresAt: stored.expiresAt,
    stationId: station.source === "internal" ? station.id : null,
    officialSiteId: station.source === "internal" ? null : station.id,
    receiver,
    antenna: stored.antenna,
    report: stored.report,
    result: stored.result,
    failure: stored.failure,
  };
  if (include.includes("candidates")) profile.candidates = stored.candidates;
  if (include.includes("propagation")) profile.propagation = stored.propagation;
  return profile;
}
