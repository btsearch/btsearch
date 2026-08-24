import { circularAzimuthDeltaDeg } from "@openbts/shared/terrainProfile";
import { createHash } from "node:crypto";
import { SI2PEMClient, type SI2PEMLaboratoryReport } from "si2pem-reader";
import type { SI2PEMAntenna } from "si2pem-reader/reports";

import { withRedisStaleCache } from "./cache.js";
import { TERRAIN_UPSTREAM_TIMEOUT_MS } from "./config.js";
import type { AntennaCandidate, ResolvedTerrainStation, SI2PEMReport, TerrainWarningCode } from "./types.js";

const si2pem = new SI2PEMClient({ timeoutMs: TERRAIN_UPSTREAM_TIMEOUT_MS });

export type SI2PEMAntennaLookup = {
  report: SI2PEMReport | null;
  candidates: AntennaCandidate[];
  warningCodes: TerrainWarningCode[];
};

function angularDelta(a: number | null, b: number | null): number {
  if (a === null || b === null) return Number.POSITIVE_INFINITY;
  return circularAzimuthDeltaDeg(a, b);
}

function candidateKey(parts: unknown[]): string {
  return `si2pem-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16)}`;
}

function enrichCandidateBand(frequencyMHz: number, azimuthDeg: number | null, fallbackCandidates: AntennaCandidate[]): AntennaCandidate["band"] {
  let nearest: AntennaCandidate | undefined;
  let nearestScore = Number.POSITIVE_INFINITY;
  for (const candidate of fallbackCandidates) {
    const score = Math.abs(candidate.frequencyMHz - frequencyMHz) + Math.min(angularDelta(candidate.antenna.azimuth, azimuthDeg), 90) / 10;
    if (score < nearestScore) {
      nearest = candidate;
      nearestScore = score;
    }
  }
  if (!nearest || Math.abs(nearest.frequencyMHz - frequencyMHz) > 150) return null;
  return nearest.band;
}

function toReport(report: SI2PEMLaboratoryReport): SI2PEMReport {
  return {
    source: "si2pem",
    url: report.url,
    published_at: report.publishedAt,
    laboratory_name: report.laboratoryName,
  };
}

function mapAntennaCandidates(antennas: SI2PEMAntenna[], report: SI2PEMReport, fallbackCandidates: AntennaCandidate[]): AntennaCandidate[] {
  const candidates: AntennaCandidate[] = [];
  const seen = new Set<string>();
  for (const antenna of antennas) {
    const fingerprint = [antenna.antenna.mountedHeight, antenna.antenna.azimuth, antenna.measuredTilt, antenna.frequencyMHz].join(":");
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    candidates.push({
      key: candidateKey([report.url, antenna.pageNumber, antenna.rowNumber, fingerprint]),
      source: "si2pem_report",
      antenna: { mountedHeight: antenna.antenna.mountedHeight, azimuth: antenna.antenna.azimuth },
      frequencyMHz: antenna.frequencyMHz,
      measuredTilt: antenna.measuredTilt,
      band: enrichCandidateBand(antenna.frequencyMHz, antenna.antenna.azimuth, fallbackCandidates),
      provenance: {
        report_url: report.url,
        report_date: report.published_at,
        permit_id: null,
        decision_number: null,
      },
    });
  }
  return candidates;
}

function stationBbox(station: ResolvedTerrainStation): [number, number, number, number] {
  return [station.longitude - 0.02, station.latitude - 0.02, station.longitude + 0.02, station.latitude + 0.02];
}

async function discoverLatestReport(station: ResolvedTerrainStation): Promise<SI2PEMLaboratoryReport | null> {
  return si2pem.getLatestLaboratoryReport({
    stationIdentity: station.station_id,
    bbox: stationBbox(station),
    count: 100,
  });
}

async function loadLookup(station: ResolvedTerrainStation, fallbackCandidates: AntennaCandidate[]): Promise<SI2PEMAntennaLookup> {
  const discoveredReport = await discoverLatestReport(station);
  if (!discoveredReport) return { report: null, candidates: [], warningCodes: ["SI2PEM_REPORT_UNAVAILABLE"] };
  const report = toReport(discoveredReport);

  try {
    const antennas = await discoveredReport.readAntennas();
    const candidates = mapAntennaCandidates(antennas, report, fallbackCandidates);
    return {
      report,
      candidates,
      warningCodes: candidates.length ? [] : ["SI2PEM_REPORT_PARSE_FAILED"],
    };
  } catch {
    return { report, candidates: [], warningCodes: ["SI2PEM_REPORT_PARSE_FAILED"] };
  }
}

export async function getSI2PEMAntennaCandidates(
  station: ResolvedTerrainStation,
  fallbackCandidates: AntennaCandidate[],
): Promise<SI2PEMAntennaLookup> {
  const cacheId = createHash("sha256")
    .update(`${station.station_id}:${station.operator?.mnc ?? "unknown"}:${station.latitude.toFixed(5)}:${station.longitude.toFixed(5)}`)
    .digest("hex")
    .slice(0, 24);
  const cached = await withRedisStaleCache(
    `terrain:si2pem:v3:${cacheId}`,
    {
      freshTtlSeconds: 6 * 3600,
      staleTtlSeconds: 7 * 86400,
      shouldCache: (lookup) =>
        !lookup.warningCodes.includes("SI2PEM_REPORT_PARSE_FAILED") && !lookup.warningCodes.includes("SI2PEM_REPORT_UNAVAILABLE"),
    },
    () => loadLookup(station, fallbackCandidates),
  );
  return cached.value;
}
