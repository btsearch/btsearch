import { conventionsFor } from "@openbts/country-packs";

import type { StationIdentifier } from "../types";
import { NETWORKS_ID_KIND, type PlacedStation, findStationIdentifier, getStationCountryCode } from "./stations";

export function getNetworksIdLabel(station: PlacedStation & { identifiers: readonly StationIdentifier[] }): string | null {
  const networksId = findStationIdentifier(station.identifiers, NETWORKS_ID_KIND);
  return networksId === null ? null : conventionsFor(getStationCountryCode(station)).formatIdentifier(NETWORKS_ID_KIND, networksId);
}
