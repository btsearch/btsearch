import { type TerrainProfilesCapability, capabilitiesFor } from "@openbts/country-packs";
import { officialPermits, officialSites } from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { type SQL, type SQLWrapper, and, asc, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import { ErrorResponse } from "../../errors.js";
import { type OfficialVisibility, loadPublicOfficialVisibility, officialLocationIsPublic } from "../official/visibility.js";
import { findSharedSiblingIds, sharesNetworkWith } from "../stations/sharedSiblings.js";
import type { AntennaCandidate, ResolvedTerrainStation, TerrainProfileRequest } from "./types.js";

type ReceiverBounds = TerrainProfilesCapability["receiverBounds"];

export type ResolvedStationWithFallbacks = {
  station: ResolvedTerrainStation;
  locationId: number;
  operatorId: number | null;
  receiverBounds: ReceiverBounds;
  permitCandidates: AntennaCandidate[];
};

function requireReceiverBounds(countryCode: string): ReceiverBounds {
  const { terrainProfiles } = capabilitiesFor(countryCode);
  if (terrainProfiles === null) throw new ErrorResponse("NOT_FOUND");
  return terrainProfiles.receiverBounds;
}

function toStationOperator(
  operator: { id: number; name: string; full_name: string; parent_id: number | null; mnc: number | null } | null | undefined,
): ResolvedTerrainStation["operator"] {
  if (!operator?.mnc) return null;
  return { id: operator.id, name: operator.name, full_name: operator.full_name, parent_id: operator.parent_id, mnc: operator.mnc };
}

type OfficialPermitWithSectors = {
  id: number;
  decision_number: string;
  rat: string;
  label_mhz: number;
  label_variant: "commercial" | "railway";
  sectors: {
    id: number;
    azimuth: number | null;
    elevation: number | null;
    antenna_height: number | null;
  }[];
};

function makeCandidateKey(parts: unknown[]): string {
  return `permit-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16)}`;
}

function buildPermitCandidates(permits: OfficialPermitWithSectors[]): AntennaCandidate[] {
  const seen = new Set<string>();
  const candidates: AntennaCandidate[] = [];

  for (const permit of permits) {
    const frequencyMHz = permit.label_mhz;
    if (frequencyMHz <= 0) continue;

    for (const sector of permit.sectors) {
      if (sector.antenna_height === null || sector.antenna_height <= 0) continue;

      const key = makeCandidateKey([permit.id, sector.id, sector.antenna_height, sector.azimuth, frequencyMHz]);
      const fingerprint = [sector.antenna_height, sector.azimuth, frequencyMHz].join(":");
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);

      candidates.push({
        key,
        source: "permit_fallback",
        antenna: { mountedHeight: sector.antenna_height, azimuth: sector.azimuth },
        frequencyMHz,
        measuredTilt: sector.elevation,
        band: { value: frequencyMHz, rat: permit.rat, variant: permit.label_variant },
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

function locationIsPublic(locationId: SQLWrapper, visibility: OfficialVisibility): SQL {
  return officialLocationIsPublic(locationId, visibility) ?? sql`true`;
}

function permitIsPublic(permitId: SQLWrapper, visibility: OfficialVisibility): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${officialPermits}
    INNER JOIN ${officialSites} ON ${officialSites.id} = ${officialPermits.official_site_id}
    WHERE ${officialPermits.id} = ${permitId} AND ${locationIsPublic(officialSites.location_id, visibility)}
  )`;
}

async function resolveInternalStation(id: number, visibility: OfficialVisibility): Promise<ResolvedStationWithFallbacks> {
  const station = await db.query.stations.findFirst({
    where: { id },
    with: { location: { with: { region: { columns: { countryCode: true } } } }, operator: true },
  });
  if (!station?.location) throw new ErrorResponse("NOT_FOUND");
  const receiverBounds = requireReceiverBounds(station.location.region.countryCode);

  const permitLinks = await db.query.stationsPermits.findMany({
    where: { station_id: id, RAW: (link) => permitIsPublic(link.permit_id, visibility) },
    with: {
      permit: {
        with: { sectors: true },
      },
    },
  });
  const permits = permitLinks.map((link) => link.permit);
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
    operatorId: station.operator_id,
    receiverBounds,
    permitCandidates: buildPermitCandidates(permits),
  };
}

async function resolveOfficialSite(id: number, visibility: OfficialVisibility): Promise<ResolvedStationWithFallbacks> {
  const station = await db.query.officialSites.findFirst({
    where: { id, RAW: (site) => locationIsPublic(site.location_id, visibility) },
    with: {
      location: { with: { region: { columns: { countryCode: true } } } },
      operator: true,
      permits: { with: { sectors: true } },
    },
  });
  if (!station?.location) throw new ErrorResponse("NOT_FOUND");
  const receiverBounds = requireReceiverBounds(station.location.region.countryCode);

  const operator = toStationOperator(station.operator);

  return {
    station: {
      source: "official",
      id: station.id,
      station_id: station.station_id,
      latitude: station.location.latitude,
      longitude: station.location.longitude,
      operator,
    },
    locationId: station.location.id,
    operatorId: station.operator_id,
    receiverBounds,
    permitCandidates: buildPermitCandidates(station.permits),
  };
}

export async function resolveTerrainStation(stationRef: TerrainProfileRequest["station"]): Promise<ResolvedStationWithFallbacks> {
  const visibility = await loadPublicOfficialVisibility();
  if (stationRef.source === "internal") return resolveInternalStation(stationRef.id, visibility);
  return resolveOfficialSite(stationRef.id, visibility);
}

export async function resolveSharedSibling(resolved: ResolvedStationWithFallbacks): Promise<ResolvedStationWithFallbacks | null> {
  const { station, locationId, operatorId } = resolved;

  if (station.source === "internal") {
    const [siblingId] = await findSharedSiblingIds({ id: station.id, locationId, operatorId });
    return siblingId === undefined ? null : resolveInternalStation(siblingId, await loadPublicOfficialVisibility());
  }
  if (operatorId === null) return null;

  const [sibling] = await db
    .select({ id: officialSites.id })
    .from(officialSites)
    .where(and(eq(officialSites.location_id, locationId), sharesNetworkWith(officialSites.operator_id, operatorId)))
    .orderBy(asc(officialSites.id))
    .limit(1);
  return sibling ? resolveOfficialSite(sibling.id, await loadPublicOfficialVisibility()) : null;
}
