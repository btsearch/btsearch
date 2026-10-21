import { anfr } from "../fr/sources/anfr/index.ts";
import { uke } from "../pl/sources/uke/index.ts";
import type { OfficialSourceDefinition } from "./sources.ts";

export const officialSources: readonly OfficialSourceDefinition[] = [uke, anfr];

const sourceByKey = new Map(officialSources.map((source) => [source.key, source]));

export function officialSourceByKey(key: string): OfficialSourceDefinition | null {
  return sourceByKey.get(key) ?? null;
}
