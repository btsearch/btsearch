import { pl } from "../pl/index.ts";
import {
  type CountryCapabilities,
  NO_SOURCE_CAPABILITIES,
  type PackCapabilities,
  type PackCapabilityName,
  type SourceCapabilities,
  resolveCapabilities,
} from "./capabilities.ts";
import { type CountryConventions, defaultConventions } from "./conventions.ts";

export type CountryPack = {
  countryCode: string;
  capabilities: PackCapabilities;
  conventions: Partial<CountryConventions>;
};

const PACKS: readonly CountryPack[] = [pl];
const declaredByCountryCode = new Map(PACKS.map((pack) => [pack.countryCode, pack.capabilities]));
const conventionsByCountryCode = new Map(PACKS.map((pack) => [pack.countryCode, { ...defaultConventions, ...pack.conventions }]));

export function capabilitiesFor(countryCode: string, sources: SourceCapabilities = NO_SOURCE_CAPABILITIES): CountryCapabilities {
  return resolveCapabilities(declaredByCountryCode.get(countryCode) ?? {}, sources);
}

export function countryCodesWith(capability: PackCapabilityName): string[] {
  return PACKS.filter((pack) => Boolean(pack.capabilities[capability])).map((pack) => pack.countryCode);
}

export function conventionsFor(countryCode: string | null): CountryConventions {
  if (countryCode === null) return defaultConventions;
  return conventionsByCountryCode.get(countryCode) ?? defaultConventions;
}
