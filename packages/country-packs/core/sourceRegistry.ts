import { anfr } from "../fr/sources/anfr/index.ts";
import { ofcom } from "../gb/sources/ofcom/index.ts";
import { uke } from "../pl/sources/uke/index.ts";
import type { OfficialSourceDefinition } from "./sources.ts";

export const officialSources: readonly OfficialSourceDefinition[] = [uke, anfr, ofcom];

const sourceByKey = new Map(officialSources.map((source) => [source.key, source]));
const countryCodesWithSites = new Set(
  officialSources.filter((source) => source.datasets.some((dataset) => dataset.layer === "sites")).map((source) => source.countryCode),
);

export function officialSourceByKey(key: string): OfficialSourceDefinition | null {
  return sourceByKey.get(key) ?? null;
}

export function hasOfficialSites(countryCode: string): boolean {
  return countryCodesWithSites.has(countryCode);
}
