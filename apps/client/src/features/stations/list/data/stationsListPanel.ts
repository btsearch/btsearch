import { type ListPanel, useListPanelScope } from "./listPanel";
import {
  type StationsListFilters,
  type StationsListVariant,
  countActiveStationsListFilters,
  pickStationsListCountries,
  toMapPanelFilters,
} from "./stationsListFilters";
import { useCountryBandPlans } from "@/features/map/data/mapLookups";

export type StationsListPanel = ListPanel<StationsListFilters>;

export function useStationsListPanel(filters: StationsListFilters, variant: StationsListVariant): StationsListPanel {
  const { area, ...scope } = useListPanelScope(filters.countryCodes, variant === "admin");
  const { labelsByCountry } = useCountryBandPlans(scope.countries.inPlay, "internal", scope.lookups);

  function pickCountries(current: StationsListFilters, countryCodes: readonly string[]): StationsListFilters {
    return pickStationsListCountries(current, countryCodes, { lookups: scope.lookups, area, labelsByCountry });
  }

  return { ...scope, mapFilters: toMapPanelFilters(filters), activeFilterCount: countActiveStationsListFilters(filters), pickCountries };
}
