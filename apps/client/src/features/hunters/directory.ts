import type { Hunter, Region } from "@openbts/shared/contract";

export type HunterFilters = {
  search: string;
  countryCodes: readonly string[];
  regionIds: readonly number[];
};

export type PlacedHunter = {
  hunter: Hunter;
  regionsByCountry: Map<string, Region[]>;
};

export type CountryFacet = { countryCode: string; count: number };

export type HunterEntry = {
  hunter: Hunter;
  regions: Region[];
  otherCountryCodes: string[];
};

export type CountrySection = { countryCode: string; entries: HunterEntry[] };

export function placeHunters(hunters: readonly Hunter[], regionById: ReadonlyMap<number, Region>): PlacedHunter[] {
  return hunters.map((hunter) => {
    const regionsByCountry = new Map<string, Region[]>();
    for (const regionId of hunter.regionIds) {
      const region = regionById.get(regionId);
      if (region === undefined) continue;
      const countryRegions = regionsByCountry.get(region.countryCode);
      if (countryRegions === undefined) regionsByCountry.set(region.countryCode, [region]);
      else countryRegions.push(region);
    }
    for (const regions of regionsByCountry.values()) regions.sort((left, right) => left.name.localeCompare(right.name));
    return { hunter, regionsByCountry };
  });
}

export function countHuntersByCountry(placed: readonly PlacedHunter[]): CountryFacet[] {
  const counts = new Map<string, number>();
  for (const { regionsByCountry } of placed) {
    for (const countryCode of regionsByCountry.keys()) counts.set(countryCode, (counts.get(countryCode) ?? 0) + 1);
  }
  return [...counts]
    .map(([countryCode, count]) => ({ countryCode, count }))
    .sort((left, right) => right.count - left.count || left.countryCode.localeCompare(right.countryCode));
}

export function listHunterRegions(placed: readonly PlacedHunter[], facets: readonly CountryFacet[], countryCodes: readonly string[]): Region[] {
  const regionsById = new Map<number, Region>();
  for (const { regionsByCountry } of placed) {
    for (const region of [...regionsByCountry.values()].flat()) regionsById.set(region.id, region);
  }

  const countryOrder = new Map(facets.map((facet, index) => [facet.countryCode, index]));
  const orderOf = (region: Region) => countryOrder.get(region.countryCode) ?? facets.length;
  return [...regionsById.values()]
    .filter((region) => countryCodes.length === 0 || countryCodes.includes(region.countryCode))
    .sort((left, right) => orderOf(left) - orderOf(right) || left.name.localeCompare(right.name));
}

function matchesSearch(hunter: Hunter, query: string): boolean {
  if (query === "") return true;
  return (hunter.name?.toLowerCase().includes(query) ?? false) || (hunter.username?.toLowerCase().includes(query) ?? false);
}

function hasSelectedRegion(regions: Region[], regionIds: readonly number[]): boolean {
  return regionIds.length === 0 || regions.some((region) => regionIds.includes(region.id));
}

export function buildSections(placed: readonly PlacedHunter[], facets: readonly CountryFacet[], filters: HunterFilters): CountrySection[] {
  const sections = facets
    .filter((facet) => filters.countryCodes.length === 0 || filters.countryCodes.includes(facet.countryCode))
    .map((facet): CountrySection => ({ countryCode: facet.countryCode, entries: [] }));
  const query = filters.search.trim().toLowerCase();

  for (const { hunter, regionsByCountry } of placed) {
    if (!matchesSearch(hunter, query)) continue;
    for (const section of sections) {
      const regions = regionsByCountry.get(section.countryCode);
      if (regions === undefined || !hasSelectedRegion(regions, filters.regionIds)) continue;
      const otherCountryCodes = [...regionsByCountry.keys()].filter((countryCode) => countryCode !== section.countryCode);
      section.entries.push({ hunter, regions, otherCountryCodes });
    }
  }
  return sections.filter((section) => section.entries.length > 0);
}

export function countListedHunters(sections: readonly CountrySection[]): number {
  return new Set(sections.flatMap((section) => section.entries.map((entry) => entry.hunter.id))).size;
}
