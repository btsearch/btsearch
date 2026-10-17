import type { Country } from "@openbts/shared/contract";

import type { TerrainReceiverBounds } from "./types";

export function findTerrainReceiverBounds(countryCode: string | null, countries: readonly Country[] | undefined): TerrainReceiverBounds | null {
  const country = countries?.find((entry) => entry.code === countryCode);
  return country?.capabilities.terrainProfiles?.receiverBounds ?? null;
}
