import { DEFAULT_GNBID_LENGTH } from "@openbts/shared/contract/constants";

import { gb } from "../gb/index.ts";
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

type ChannelsByPlmn = Readonly<Record<string, Readonly<Record<number, { FDD?: number; TDD?: number }>>>>;

export type DefaultEarfcn = { LTE?: ChannelsByPlmn };

export type CountryPack = {
  countryCode: string;
  mccs: readonly string[];
  capabilities: PackCapabilities;
  conventions: Partial<CountryConventions>;
  defaultEarfcn?: DefaultEarfcn;
};

const PACKS: readonly CountryPack[] = [pl, gb];
const declaredByCountryCode = new Map(PACKS.map((pack) => [pack.countryCode, pack.capabilities]));
const conventionsByCountryCode = new Map(PACKS.map((pack) => [pack.countryCode, { ...defaultConventions, ...pack.conventions }]));
const countryCodeByMcc = new Map(PACKS.flatMap((pack) => pack.mccs.map((mcc) => [mcc, pack.countryCode] as const)));
const defaultLteEarfcnsByPlmn: ChannelsByPlmn = Object.fromEntries(PACKS.flatMap((pack) => Object.entries(pack.defaultEarfcn?.LTE ?? {})));

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

export function knownGnbidLength(mcc: string, mnc: string): number | null {
  const length = conventionsFor(countryCodeByMcc.get(mcc) ?? null).gnbidLength({ primaryPlmn: mcc + mnc.padStart(2, "0") });
  return length === DEFAULT_GNBID_LENGTH ? null : length;
}

export function defaultLteEarfcn(plmn: string, bandMhz: number, duplex: "FDD" | "TDD"): number | null {
  return defaultLteEarfcnsByPlmn[plmn]?.[bandMhz]?.[duplex] ?? null;
}
