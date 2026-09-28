import { TMOBILE_MNC, getNetworksSiblingMnc, isNetworksPartnerMnc, normalizeCityForMNOName } from "./operators";
import type { Operator, Station } from "@/types/station";

export function isNetworksVirtualStation(stationId: string, mnc: number | null | undefined): boolean {
  return stationId.startsWith("N") && isNetworksPartnerMnc(mnc);
}

export function resolveSiblingMnoName(
  mnc: number | null | undefined,
  stationId: string,
  city: string | null | undefined,
  siblingMnoName: string | null,
): string | null {
  if (mnc !== TMOBILE_MNC) return siblingMnoName || null;
  if (stationId.startsWith("N") || !city) return null;
  return `${normalizeCityForMNOName(city)}_${stationId}`;
}

export function getHardwareLeaseOperator(
  station: Pick<Station, "station_id" | "operator" | "physicalStation">,
): Pick<Operator, "name" | "mnc"> | null {
  if (station.physicalStation) return station.physicalStation.operator;
  if (!station.station_id.startsWith("N")) return null;
  const siblingMnc = getNetworksSiblingMnc(station.operator?.mnc);
  if (siblingMnc === null) return null;
  return { name: siblingMnc === TMOBILE_MNC ? "T-Mobile" : "Orange", mnc: siblingMnc };
}
