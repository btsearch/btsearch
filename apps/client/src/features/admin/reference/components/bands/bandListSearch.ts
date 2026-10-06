import { BAND_GROUPS, type BandGroupKey } from "../../utils/bands";
import { joinSearchValues, listSearchValues, parseSearchQuery } from "@/lib/urlSearch";

export type BandCodePresence = "all" | "with" | "without";

export type BandListSearch = {
  q?: string;
  tech?: string;
  code?: Exclude<BandCodePresence, "all">;
};

export const BAND_GROUP_KEYS: readonly BandGroupKey[] = BAND_GROUPS.map((group) => group.key);

export function listBandGroups(value: unknown): BandGroupKey[] {
  const requestedGroups = new Set(listSearchValues(value));
  return BAND_GROUP_KEYS.filter((group) => requestedGroups.has(group));
}

function parseCodePresence(value: unknown): BandListSearch["code"] {
  return value === "with" || value === "without" ? value : undefined;
}

export function parseBandListSearch(search: Record<string, unknown>): BandListSearch {
  return {
    q: parseSearchQuery(search.q),
    tech: joinSearchValues(listBandGroups(search.tech)),
    code: parseCodePresence(search.code),
  };
}
