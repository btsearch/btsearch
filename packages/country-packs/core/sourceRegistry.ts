import { uke } from "../pl/sources/uke/index.ts";
import type { OfficialSourceDefinition } from "./sources.ts";

export const officialSources: readonly OfficialSourceDefinition[] = [uke];

const sourceByKey = new Map(officialSources.map((source) => [source.key, source]));

export function officialSourceByKey(key: string): OfficialSourceDefinition | null {
  return sourceByKey.get(key) ?? null;
}
