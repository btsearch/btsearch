import { REGION_BY_TERYT_PREFIX } from "../config.js";
import { findVoivodeshipByTeryt } from "../voivodeship-lookup.js";

const voivodeshipCache = new Map<string, string | null>();

export function findVoivodeshipCached(lon: number, lat: number): string | null {
  const key = `${lon}:${lat}`;
  if (voivodeshipCache.has(key)) return voivodeshipCache.get(key) ?? null;

  const result = findVoivodeshipByTeryt(lon, lat);
  voivodeshipCache.set(key, result);
  return result;
}

export function getRegionByTeryt(teryt: string): { name: string; code: string } | null {
  return REGION_BY_TERYT_PREFIX[teryt] ?? null;
}
