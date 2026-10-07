import type { StationSource } from "@/types/station";

const TERRAIN_DATA_COUNTRY_CODE = "PL";
const TERRAIN_DATA_REGISTER_SOURCE: StationSource = "uke";

export function isTerrainProfileAvailable(source: StationSource, stationCountryCode: string | null): boolean {
  return source === TERRAIN_DATA_REGISTER_SOURCE || stationCountryCode === TERRAIN_DATA_COUNTRY_CODE;
}
