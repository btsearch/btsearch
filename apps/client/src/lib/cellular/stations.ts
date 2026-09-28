import { TMOBILE_MNC, normalizeCityForMNOName } from "./operators";

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
