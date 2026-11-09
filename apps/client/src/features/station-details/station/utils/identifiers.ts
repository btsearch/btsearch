import { conventionsFor, formatIdentifier } from "@openbts/country-packs";

import type { StationIdentifier } from "../types";
import { NETWORKS_ID_KIND, type PlacedStation, findStationIdentifier } from "./stations";

export function getNetworksIdLabel(station: PlacedStation & { identifiers: readonly StationIdentifier[] }): string | null {
  const networksId = findStationIdentifier(station.identifiers, NETWORKS_ID_KIND);
  const countryCode = station.operator?.countryCode ?? station.location?.countryCode ?? null;
  return networksId === null ? null : formatIdentifier(conventionsFor(countryCode), NETWORKS_ID_KIND, networksId);
}
