import type { EmfAntennaReport } from "@openbts/shared/contract";

import { OMNIDIRECTIONAL_DEGREES } from "../model/ratFields";
import { fetchPartnerSectors } from "./partner";
import { fetchUkePermitsByStationId } from "@/features/map/api";
import { getAntennaGroupKind } from "@/features/station-details/station/emf/antennas/antennaModel";
import { fetchV2Data, isNotFound } from "@/lib/api";

export type AzimuthSource = "emf" | "register" | "partner";

type EmfAzimuthSite = {
  siteId: string;
  latitude: number;
  longitude: number;
};

export type FetchedAzimuths =
  | { source: "emf"; degrees: number[]; measuredOn: string | null; sectorAntennaCount: number }
  | { source: "register"; degrees: number[] }
  | { source: "partner"; degrees: number[] };

const NO_ANTENNA_REPORT: EmfAntennaReport = { report: null, antennas: [] };

function toSectorDegrees(azimuth: number | null): number | null {
  if (azimuth === null || !Number.isFinite(azimuth) || azimuth < 0 || azimuth > OMNIDIRECTIONAL_DEGREES) return null;
  if (azimuth === OMNIDIRECTIONAL_DEGREES) return OMNIDIRECTIONAL_DEGREES;
  return Math.round(azimuth) % OMNIDIRECTIONAL_DEGREES;
}

function listDistinctDegrees(azimuths: readonly (number | null)[]): number[] {
  const degrees = new Set<number>();
  for (const azimuth of azimuths) {
    const value = toSectorDegrees(azimuth);
    if (value !== null) degrees.add(value);
  }
  return [...degrees];
}

function sortAscending(degrees: readonly number[]): number[] {
  return [...degrees].sort((left, right) => left - right);
}

async function fetchNewestAntennaReport(site: EmfAzimuthSite): Promise<EmfAntennaReport> {
  const params = new URLSearchParams({ siteId: site.siteId, latitude: String(site.latitude), longitude: String(site.longitude) });
  try {
    return await fetchV2Data<EmfAntennaReport>(`emf/antennas?${params.toString()}`);
  } catch (error) {
    if (isNotFound(error)) return NO_ANTENNA_REPORT;
    throw error;
  }
}

export async function fetchEmfAzimuths(site: EmfAzimuthSite): Promise<FetchedAzimuths> {
  const { report, antennas } = await fetchNewestAntennaReport(site);

  return {
    source: "emf",
    degrees: sortAscending(listDistinctDegrees(antennas.map((antenna) => antenna.azimuth))),
    measuredOn: report?.measuredOn ?? null,
    sectorAntennaCount: antennas.filter((antenna) => getAntennaGroupKind(antenna.azimuth) === "azimuth").length,
  };
}

export async function fetchRegisterAzimuths(siteId: string, operatorMnc: number): Promise<FetchedAzimuths> {
  const permits = await fetchUkePermitsByStationId(siteId, operatorMnc);
  const azimuths = permits.flatMap((permit) => (permit.sectors ?? []).map((sector) => sector.azimuth));
  return { source: "register", degrees: sortAscending(listDistinctDegrees(azimuths)) };
}

export async function fetchPartnerAzimuths(stationId: number): Promise<FetchedAzimuths> {
  const sectors = await fetchPartnerSectors(stationId);
  return { source: "partner", degrees: listDistinctDegrees(sectors.map((sector) => sector.azimuth)) };
}
