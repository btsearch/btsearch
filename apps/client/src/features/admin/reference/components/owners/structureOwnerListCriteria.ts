import type { StructureOwner } from "../../types";
import { NO_COUNTRY_FACET, type StructureOwnerListSearch, type StructureOwnerListSort, listCountryFacets } from "./structureOwnerListSearch";
import { foldText } from "@/lib/foldText";
import { joinSearchValues } from "@/lib/urlSearch";

export type StructureOwnerListCriteria = {
  query: string;
  countryFacets: readonly string[];
  sort: StructureOwnerListSort;
};

export const STRUCTURE_OWNER_SEARCH_MAX_LENGTH = 100;

export function readStructureOwnerListCriteria(search: StructureOwnerListSearch): StructureOwnerListCriteria {
  return {
    query: (search.q ?? "").slice(0, STRUCTURE_OWNER_SEARCH_MAX_LENGTH),
    countryFacets: listCountryFacets(search.countries),
    sort: search.sort ?? "name",
  };
}

export function toStructureOwnerListSearch(criteria: StructureOwnerListCriteria): StructureOwnerListSearch {
  return {
    q: criteria.query === "" ? undefined : criteria.query,
    countries: joinSearchValues([...criteria.countryFacets].sort()),
    sort: criteria.sort === "name" ? undefined : criteria.sort,
  };
}

export function filterStructureOwners(owners: readonly StructureOwner[], searchText: string, countryFacets: readonly string[]): StructureOwner[] {
  const query = foldText(searchText.trim());

  return owners.filter((owner) => {
    if (countryFacets.length > 0 && !countryFacets.includes(owner.countryCode ?? NO_COUNTRY_FACET)) return false;
    return query === "" || foldText(owner.name).includes(query);
  });
}
