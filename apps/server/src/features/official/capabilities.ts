import type { SourceCapabilities } from "@openbts/country-packs";

import { type OfficialVisibility, loadSourceVisibility } from "./visibility.js";

export async function loadSourceCapabilities({ sourceIds }: OfficialVisibility): Promise<Map<string, SourceCapabilities>> {
  const capabilitiesByCountryCode = new Map<string, SourceCapabilities>();
  if (sourceIds?.length === 0) return capabilitiesByCountryCode;

  const sources = await loadSourceVisibility();
  for (const { id, countryCode, layers } of sources) {
    if (sourceIds !== null && !sourceIds.includes(id)) continue;

    for (const layer of layers) {
      const capabilities = capabilitiesByCountryCode.get(countryCode) ?? { official: false, microwaveLinks: false };
      if (layer === "sites") capabilities.official = true;
      else capabilities.microwaveLinks = true;
      capabilitiesByCountryCode.set(countryCode, capabilities);
    }
  }
  return capabilitiesByCountryCode;
}
