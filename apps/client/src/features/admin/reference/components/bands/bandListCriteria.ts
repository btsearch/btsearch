import type { Band } from "../../types";
import type { BandGroupKey } from "../../utils/bands";
import { BAND_GROUP_KEYS, type BandCodePresence, type BandListSearch, listBandGroups } from "./bandListSearch";
import { joinSearchValues } from "@/lib/urlSearch";

export type BandListCriteria = {
  query: string;
  groups: readonly BandGroupKey[];
  codePresence: BandCodePresence;
};

type BandFacets = Pick<BandListCriteria, "groups" | "codePresence">;

export const BAND_SEARCH_MAX_LENGTH = 40;

export function readBandListCriteria(search: BandListSearch): BandListCriteria {
  return {
    query: (search.q ?? "").slice(0, BAND_SEARCH_MAX_LENGTH),
    groups: listBandGroups(search.tech),
    codePresence: search.code ?? "all",
  };
}

export function toBandListSearch(criteria: BandListCriteria): BandListSearch {
  return {
    q: criteria.query === "" ? undefined : criteria.query,
    tech: joinSearchValues(BAND_GROUP_KEYS.filter((group) => criteria.groups.includes(group))),
    code: criteria.codePresence === "all" ? undefined : criteria.codePresence,
  };
}

export function filterBands(bands: readonly Band[], searchText: string, { groups, codePresence }: BandFacets): Band[] {
  const query = searchText.trim().toLowerCase();

  return bands.filter((band) => {
    if (codePresence === "with" && band.code === null) return false;
    if (codePresence === "without" && band.code !== null) return false;
    if (groups.length > 0 && !groups.includes(band.rat)) return false;
    return query === "" || `${band.name} ${band.code ?? ""}`.toLowerCase().includes(query);
  });
}
