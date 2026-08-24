import db from "@openbts/drizzle/db";
import { NETWORKS_SIBLING_MNC } from "@openbts/shared/operatorUtils";
import { createHash } from "node:crypto";

import { ErrorResponse } from "../../errors.js";
import type { AntennaCandidate, ResolvedTerrainStation, TerrainProfileRequest } from "./types.js";

export type ResolvedStationWithFallbacks = {
  station: ResolvedTerrainStation;
  locationId: number;
  ukeCandidates: AntennaCandidate[];
};

function toStationOperator(
  operator: { id: number; name: string; full_name: string; parent_id: number | null; mnc: number | null } | null | undefined,
): ResolvedTerrainStation["operator"] {
  if (!operator?.mnc) return null;
  return { id: operator.id, name: operator.name, full_name: operator.full_name, parent_id: operator.parent_id, mnc: operator.mnc };
}

type UkePermitWithDetails = {
  id: number;
  decision_number: string;
  band: {
    id: number;
    name: string;
    value: number | null;
    rat: string;
    duplex: "FDD" | "TDD" | null;
    variant: "commercial" | "railway";
  } | null;
  sectors: {
    id: number;
    azimuth: number | null;
    elevation: number | null;
    antenna_height: number | null;
  }[];
};

function makeCandidateKey(parts: unknown[]): string {
  return `uke-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16)}`;
}

function buildUkeCandidates(permits: UkePermitWithDetails[]): AntennaCandidate[] {
  const seen = new Set<string>();
  const candidates: AntennaCandidate[] = [];

  for (const permit of permits) {
    const frequencyMHz = permit.band?.value;
    if (frequencyMHz === null || frequencyMHz === undefined || frequencyMHz <= 0) continue;

    for (const sector of permit.sectors) {
      if (sector.antenna_height === null || sector.antenna_height <= 0) continue;

      const key = makeCandidateKey([permit.id, sector.id, sector.antenna_height, sector.azimuth, frequencyMHz]);
      const fingerprint = [sector.antenna_height, sector.azimuth, frequencyMHz].join(":");
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);

      candidates.push({
        key,
        source: "uke_permit_fallback",
        antenna: { mountedHeight: sector.antenna_height, azimuth: sector.azimuth },
        frequencyMHz,
        measuredTilt: sector.elevation,
        band: permit.band
          ? {
              id: permit.band.id,
              name: permit.band.name,
              value: permit.band.value ?? null,
              rat: permit.band.rat,
              duplex: permit.band.duplex ?? null,
              variant: permit.band.variant ?? "",
            }
          : null,
        provenance: {
          report_url: null,
          report_date: null,
          permit_id: permit.id,
          decision_number: permit.decision_number,
        },
      });
    }
  }

  return candidates;
}

async function resolveInternalStation(id: number): Promise<ResolvedStationWithFallbacks> {
  const station = await db.query.stations.findFirst({
    where: { id },
    with: { location: true, operator: true },
  });
  if (!station?.location) throw new ErrorResponse("NOT_FOUND");

  const permitLinks = await db.query.stationsPermits.findMany({
    where: { station_id: id },
    with: {
      permit: {
        with: { band: true, sectors: true },
      },
    },
  });
  const permits = permitLinks.flatMap((link) => (link.permit ? [link.permit as UkePermitWithDetails] : []));
  const operator = toStationOperator(station.operator);

  return {
    station: {
      source: "internal",
      id: station.id,
      station_id: station.station_id,
      latitude: station.location.latitude,
      longitude: station.location.longitude,
      operator,
    },
    locationId: station.location.id,
    ukeCandidates: buildUkeCandidates(permits),
  };
}

async function resolveUkeStation(id: number): Promise<ResolvedStationWithFallbacks> {
  const station = await db.query.ukeStations.findFirst({
    where: { id },
    with: {
      location: true,
      operator: true,
      permits: { with: { band: true, sectors: true } },
    },
  });
  if (!station?.location) throw new ErrorResponse("NOT_FOUND");

  const operator = toStationOperator(station.operator);

  return {
    station: {
      source: "uke",
      id: station.id,
      station_id: station.station_id,
      latitude: station.location.latitude,
      longitude: station.location.longitude,
      operator,
    },
    locationId: station.location.id,
    ukeCandidates: buildUkeCandidates(station.permits as UkePermitWithDetails[]),
  };
}

export async function resolveTerrainStation(stationRef: TerrainProfileRequest["station"]): Promise<ResolvedStationWithFallbacks> {
  if (stationRef.source === "internal") return resolveInternalStation(stationRef.id);
  return resolveUkeStation(stationRef.id);
}

export async function resolveNetWorksSharingSibling(resolved: ResolvedStationWithFallbacks): Promise<ResolvedStationWithFallbacks | null> {
  const mnc = resolved.station.operator?.mnc;
  const siblingMnc = mnc !== undefined ? NETWORKS_SIBLING_MNC[mnc] : undefined;
  if (siblingMnc === undefined) return null;

  const siblingOperator = await db.query.operators.findFirst({ where: { mnc: siblingMnc } });
  if (!siblingOperator) return null;

  if (resolved.station.source === "internal") {
    const sibling = await db.query.stations.findFirst({
      where: { location_id: resolved.locationId, operator_id: siblingOperator.id },
    });
    return sibling ? resolveInternalStation(sibling.id) : null;
  }

  const sibling = await db.query.ukeStations.findFirst({
    where: { location_id: resolved.locationId, operator_id: siblingOperator.id },
  });
  return sibling ? resolveUkeStation(sibling.id) : null;
}
