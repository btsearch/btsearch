import type { GeocodedPlaceNames } from "../../core/conventions.ts";

const REGION_PREFIX = /^województwo\s+/i;
const MUNICIPALITY_PREFIX = /^gmina\s+/i;

function normalizeRegion(region: string | null): string | null {
  if (!region) return region;

  const name = region.replace(REGION_PREFIX, "");
  return name.charAt(0).toLocaleUpperCase("pl") + name.slice(1);
}

export function normalizeGeocodedPlace({ region, municipality }: GeocodedPlaceNames): GeocodedPlaceNames {
  return { region: normalizeRegion(region), municipality: municipality?.replace(MUNICIPALITY_PREFIX, "") ?? null };
}
