import { isCountryCode } from "@/lib/apiValues";
import { joinSearchValues, parseSearchQuery, parseSearchValues } from "@/lib/urlSearch";

export type StructureOwnerListSort = "name" | "locations" | "-locations";

export type StructureOwnerListSearch = {
  q?: string;
  countries?: string;
  sort?: Exclude<StructureOwnerListSort, "name">;
};

export const NO_COUNTRY_FACET = "none";

function parseCountryFacet(value: string): string | null {
  return value === NO_COUNTRY_FACET || isCountryCode(value) ? value : null;
}

export function listCountryFacets(value: unknown): string[] {
  return parseSearchValues(value, parseCountryFacet);
}

function parseSort(value: unknown): StructureOwnerListSearch["sort"] {
  return value === "locations" || value === "-locations" ? value : undefined;
}

export function parseStructureOwnerListSearch(search: Record<string, unknown>): StructureOwnerListSearch {
  return {
    q: parseSearchQuery(search.q),
    countries: joinSearchValues(listCountryFacets(search.countries)),
    sort: parseSort(search.sort),
  };
}
