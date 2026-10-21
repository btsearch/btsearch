import type { BandFacet, FacetCounts } from "../model/filters";
import type { AnalyzerFilters } from "../model/filterValues";
import type { MapLookups } from "@/features/map/data/mapLookups";

export type AnalyzerFiltersChange = (change: (current: AnalyzerFilters) => AnalyzerFilters) => void;

export type AnalyzerPanelData = {
  counts: FacetCounts;
  hasResults: boolean;
  bandFacets: readonly BandFacet[];
  operatorLookups: MapLookups | undefined;
  fileCountryCodes: readonly string[];
  hasLookupsError: boolean;
  isRetryingLookups: boolean;
  retryLookups: () => void;
};

export type AnalyzerPanelProps = {
  filters: AnalyzerFilters;
  panel: AnalyzerPanelData;
  onFiltersChange: AnalyzerFiltersChange;
};
