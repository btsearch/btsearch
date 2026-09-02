import { FILTER_KEYWORDS } from "@/features/map/constants";
import type { Operator, Region, StationFilters } from "@/types/station";

export const STATIONS_FILTER_KEYWORDS = FILTER_KEYWORDS.filter((keyword) => keyword.availableOn.includes("stations"));

export type StationsFilterControlProps = {
  filters: StationFilters;
  operators: Operator[];
  regions: Region[];
  uniqueBandValues: number[];
  selectedRegions: number[];
  searchQuery: string;
  onFiltersChange: (update: StationFilters | ((current: StationFilters) => StationFilters)) => void;
  onRegionsChange: (update: number[] | ((current: number[]) => number[])) => void;
  onClearAllFilters: () => void;
  onSearchQueryChange: (query: string) => void;
};
