import type { StructureOwner } from "@openbts/shared/contract";

import { type LocationsListFilters, countActiveLocationsListFilters, toMapOperatorFilters } from "./locationsListFilters";
import { type ListPanel, useListPanelScope } from "@/features/stations/list/data/listPanel";
import { narrowListToCountries } from "@/features/stations/list/data/listScope";

export type LocationsListPanel = ListPanel<LocationsListFilters>;

export function listStructureOwnerOptions(
  owners: readonly StructureOwner[] | undefined,
  countryCodesInPlay: readonly string[],
  language: string,
): StructureOwner[] {
  if (owners === undefined) return [];

  return owners
    .filter((owner) => owner.countryCode === null || countryCodesInPlay.includes(owner.countryCode))
    .sort((left, right) => left.name.localeCompare(right.name, language));
}

export function useLocationsListPanel(filters: LocationsListFilters): LocationsListPanel {
  const { area, ...scope } = useListPanelScope(filters.countryCodes, true);

  function pickCountries(current: LocationsListFilters, countryCodes: readonly string[]): LocationsListFilters {
    return narrowListToCountries(current, countryCodes, { lookups: scope.lookups, area });
  }

  return { ...scope, mapFilters: toMapOperatorFilters(filters), activeFilterCount: countActiveLocationsListFilters(filters), pickCountries };
}
