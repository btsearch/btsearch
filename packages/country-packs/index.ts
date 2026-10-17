export type { CountryCapabilities, PackCapabilityName, SourceCapabilities, TerrainProfilesCapability } from "./core/capabilities.ts";
export type { CountryConventions, GeocodedPlaceNames, LteSectorRule, OperatorRef, SharedSitePart } from "./core/conventions.ts";
export { capabilitiesFor, conventionsFor, countryCodesWith } from "./core/registry.ts";
export { defaultLteEarfcn } from "./pl/earfcn.ts";
export { PLMN_TO_SI2PEM_NAME, SI2PEM_NAME_TO_PLMN } from "./pl/emf.ts";
