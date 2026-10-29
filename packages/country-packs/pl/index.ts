import { gnbidLengthByPlmn } from "../core/conventions.ts";
import type { CountryPack } from "../core/registry.ts";
import { validateAddress } from "./conventions/address.ts";
import { hoistedTac, lteSectorRule } from "./conventions/cells.ts";
import { normalizeGeocodedPlace } from "./conventions/geocoding.ts";
import { formatIdentifier, identifierKinds } from "./conventions/identifiers.ts";
import { equivalentEnbids, sharedSite } from "./conventions/networks.ts";
import { suggestOperatorName } from "./conventions/operatorName.ts";
import { PLAY_PLMN } from "./operators.ts";

export const pl: CountryPack = {
  countryCode: "PL",
  mccs: ["260"],
  capabilities: {
    emf: true,
    terrainProfiles: { receiverBounds: { south: 48.8, north: 55.2, west: 13.8, east: 24.5 } },
    kmz: true,
    cellNetworks: false,
  },
  conventions: {
    identifierKinds,
    formatIdentifier,
    validateAddress,
    suggestOperatorName,
    equivalentEnbids,
    sharedSite,
    lteSectorRule,
    gnbidLength: gnbidLengthByPlmn({ [PLAY_PLMN]: 28 }),
    hoistedTac,
    normalizeGeocodedPlace,
  },
};
