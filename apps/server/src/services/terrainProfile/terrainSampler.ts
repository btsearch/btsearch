import { sql as postgres } from "@openbts/drizzle/db";
import { createHash } from "node:crypto";
import { logger } from "../../utils/logger.js";
import { withRedisStaleCache } from "./cache.js";
import { TERRAIN_PROFILE_MAX_DISTANCE_M, TERRAIN_UPSTREAM_TIMEOUT_MS } from "./config.js";
import type { ResolvedTerrainStation, TerrainProfileRequest, TerrainSampleResult } from "./types.js";
import { type AaiGrid, DEFAULT_WCS_FORMAT, parseAaiGrid } from "./wcs.js";

const NMT_WCS_URL = process.env.GUGIK_NMT_WCS_URL ?? "https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModel";
const NMPT_WCS_URL = process.env.GUGIK_NMPT_WCS_URL ?? "https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMPT/GRID1/WCS/DigitalSurfaceModel";
const NMT_COVERAGE = "DTM_PL-EVRF2007-NH";
const NMPT_COVERAGE = "DSM_PL-EVRF2007-NH";
const WCS_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.TERRAIN_WCS_CONCURRENCY) || 2));
const TARGET_RESOLUTION_M = Math.max(2, Math.min(50, Number(process.env.TERRAIN_PROFILE_RESOLUTION_M) || 10));
const MAX_SAMPLES = 401;
const MAX_CHUNK_SPAN_M = 1_000;
const MAX_COVERAGE_BYTES = 6 * 1024 * 1024;
const MAX_EFFECTIVE_RESOLUTION_M = Math.max(TARGET_RESOLUTION_M, TERRAIN_PROFILE_MAX_DISTANCE_M / (MAX_SAMPLES - 1));
const MIN_SAMPLES_PER_CHUNK = Math.max(2, Math.floor(MAX_CHUNK_SPAN_M / MAX_EFFECTIVE_RESOLUTION_M) + 1);
const MAX_WCS_CHUNKS = Math.ceil((MAX_SAMPLES - 1) / (MIN_SAMPLES_PER_CHUNK - 1));
const WCS_CACHE_LOCK_TTL_SECONDS = Math.ceil((MAX_WCS_CHUNKS * 2 * TERRAIN_UPSTREAM_TIMEOUT_MS) / WCS_CONCURRENCY / 1_000) + 60;

type ProjectedPoint = { x: number; y: number };
type SamplePoint = ProjectedPoint & { distanceM: number; latitude: number; longitude: number; index: number };

let activeWcsRequests = 0;
const wcsWaiters: (() => void)[] = [];

async function withWcsSlot<T>(operation: () => Promise<T>): Promise<T> {
  if (activeWcsRequests >= WCS_CONCURRENCY) await new Promise<void>((resolve) => wcsWaiters.push(resolve));
  else activeWcsRequests++;
  try {
    return await operation();
  } finally {
    const nextWaiter = wcsWaiters.shift();
    if (nextWaiter) nextWaiter();
    else activeWcsRequests--;
  }
}

async function fetchText(url: string, maxBytes: number, options: { timeoutMs: number }): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/plain,*/*" },
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  if (!response.ok) throw new Error(`WCS request failed: ${response.status} ${response.statusText}`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new Error(`WCS response exceeds ${maxBytes} bytes`);
  return new TextDecoder().decode(buffer);
}

function sampleGrid(grid: AaiGrid, point: ProjectedPoint): number | null {
  const column = Math.floor((point.x - grid.xllCorner) / grid.cellWidth);
  const rowFromBottom = Math.floor((point.y - grid.yllCorner) / grid.cellHeight);
  const row = grid.rows - 1 - rowFromBottom;
  if (column < 0 || column >= grid.columns || row < 0 || row >= grid.rows) return null;
  const value = grid.values[row * grid.columns + column];
  if (value === undefined || Math.abs(value - grid.noDataValue) < 0.0001) return null;
  return value;
}

async function projectPoint(latitude: number, longitude: number): Promise<ProjectedPoint> {
  const rows = await postgres<{ x: number; y: number }[]>`
    SELECT
      ST_X(projected.point) AS x,
      ST_Y(projected.point) AS y
    FROM (
      SELECT ST_Transform(ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326), 2180) AS point
    ) projected
  `;
  const point = rows[0];
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error("Failed to transform coordinates to EPSG:2180");
  return point;
}

function interpolatePoints(
  start: ProjectedPoint,
  end: ProjectedPoint,
  station: ResolvedTerrainStation,
  receiver: TerrainProfileRequest["receiver"],
): { points: SamplePoint[]; effectiveResolutionM: number } {
  const distanceM = Math.hypot(end.x - start.x, end.y - start.y);
  const sampleCount = Math.min(MAX_SAMPLES, Math.max(2, Math.ceil(distanceM / TARGET_RESOLUTION_M) + 1));
  const effectiveResolutionM = distanceM / (sampleCount - 1);
  const points = Array.from({ length: sampleCount }, (_, index) => {
    const ratio = index / (sampleCount - 1);
    return {
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
      distanceM: distanceM * ratio,
      latitude: station.latitude + (receiver.latitude - station.latitude) * ratio,
      longitude: station.longitude + (receiver.longitude - station.longitude) * ratio,
      index,
    };
  });
  return { points, effectiveResolutionM };
}

function splitIntoChunks(points: SamplePoint[], effectiveResolutionM: number): SamplePoint[][] {
  const samplesPerChunk = Math.max(2, Math.floor(MAX_CHUNK_SPAN_M / effectiveResolutionM) + 1);
  const chunks: SamplePoint[][] = [];
  for (let start = 0; start < points.length - 1; start += samplesPerChunk - 1)
    chunks.push(points.slice(start, Math.min(points.length, start + samplesPerChunk)));
  return chunks;
}

async function fetchCoverage(url: string, coverage: string, points: SamplePoint[], resolutionM: number): Promise<AaiGrid> {
  const padding = Math.max(resolutionM * 2, 10);
  const minX = Math.min(...points.map((point) => point.x)) - padding;
  const maxX = Math.max(...points.map((point) => point.x)) + padding;
  const minY = Math.min(...points.map((point) => point.y)) - padding;
  const maxY = Math.max(...points.map((point) => point.y)) + padding;
  if ((maxX - minX) * (maxY - minY) > 2_000_000) throw new Error("Requested WCS coverage exceeds the area limit");

  const params = new URLSearchParams({
    SERVICE: "WCS",
    VERSION: "1.0.0",
    REQUEST: "GetCoverage",
    COVERAGE: coverage,
    CRS: "EPSG:2180",
    BBOX: [minX, minY, maxX, maxY].map((value) => value.toFixed(3)).join(","),
    FORMAT: DEFAULT_WCS_FORMAT,
    RESX: resolutionM.toFixed(3),
    RESY: resolutionM.toFixed(3),
  });

  return withWcsSlot(async () => {
    const text = await fetchText(`${url}?${params.toString()}`, MAX_COVERAGE_BYTES, { timeoutMs: TERRAIN_UPSTREAM_TIMEOUT_MS });
    return parseAaiGrid(text);
  });
}

async function fetchCoverageOrNull(url: string, coverage: string, points: SamplePoint[], resolutionM: number): Promise<AaiGrid | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchCoverage(url, coverage, points, resolutionM);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTimeout = message.includes("timed out") || message.includes("closed unexpectedly") || message.includes("abort");
      if (!isTimeout || attempt === 1) return null;
    }
  }
  return null;
}

function modelStatus(values: (number | null)[]): "available" | "partial" | "unavailable" {
  const available = values.filter((value) => value !== null).length;
  if (available === 0) return "unavailable";
  if (available < values.length) return "partial";
  return "available";
}

async function sampleUncached(station: ResolvedTerrainStation, receiver: TerrainProfileRequest["receiver"]): Promise<TerrainSampleResult> {
  const [start, end] = await Promise.all([projectPoint(station.latitude, station.longitude), projectPoint(receiver.latitude, receiver.longitude)]);
  const { points, effectiveResolutionM } = interpolatePoints(start, end, station, receiver);
  const chunks = splitIntoChunks(points, effectiveResolutionM);
  const terrainElevations: (number | null)[] = Array.from({ length: points.length }, () => null);
  const surfaceElevations: (number | null)[] = Array.from({ length: points.length }, () => null);

  await Promise.all(
    chunks.map(async (chunk) => {
      const [terrainGrid, surfaceGrid] = await Promise.all([
        fetchCoverageOrNull(NMT_WCS_URL, NMT_COVERAGE, chunk, effectiveResolutionM),
        fetchCoverageOrNull(NMPT_WCS_URL, NMPT_COVERAGE, chunk, effectiveResolutionM),
      ]);
      for (const point of chunk) {
        const terrainValue = terrainGrid ? sampleGrid(terrainGrid, point) : null;
        if (terrainValue !== null) terrainElevations[point.index] = terrainValue;
        const surfaceValue = surfaceGrid ? sampleGrid(surfaceGrid, point) : null;
        if (surfaceValue !== null) surfaceElevations[point.index] = surfaceValue;
      }
    }),
  );

  return {
    sampledAt: new Date().toISOString(),
    fromCache: false,
    stale: false,
    effectiveResolutionM,
    terrainStatus: modelStatus(terrainElevations),
    surfaceStatus: modelStatus(surfaceElevations),
    samples: points.map((point) => ({
      distanceM: point.distanceM,
      latitude: point.latitude,
      longitude: point.longitude,
      terrainElevationM: terrainElevations[point.index] ?? null,
      surfaceElevationM: surfaceElevations[point.index] ?? null,
    })),
  };
}

export interface TerrainSampler {
  samplePath(station: ResolvedTerrainStation, receiver: TerrainProfileRequest["receiver"]): Promise<TerrainSampleResult>;
}

export class GeoportalTerrainSampler implements TerrainSampler {
  async samplePath(station: ResolvedTerrainStation, receiver: TerrainProfileRequest["receiver"]): Promise<TerrainSampleResult> {
    const fingerprint = [station.latitude, station.longitude, receiver.latitude, receiver.longitude].map((value) => value.toFixed(5)).join(":");
    const cacheId = createHash("sha256").update(`${fingerprint}:${TARGET_RESOLUTION_M}`).digest("hex").slice(0, 32);
    const result = await withRedisStaleCache(
      `terrain:gugik:v2:${cacheId}`,
      {
        freshTtlSeconds: 86400,
        staleTtlSeconds: 7 * 86400,
        lockTtlSeconds: WCS_CACHE_LOCK_TTL_SECONDS,
        shouldCache: (value) => value.terrainStatus !== "unavailable",
      },
      () => sampleUncached(station, receiver),
    );
    return { ...result.value, fromCache: result.fromCache, stale: result.stale };
  }
}

