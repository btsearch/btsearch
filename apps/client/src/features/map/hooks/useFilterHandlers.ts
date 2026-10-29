import type { OfficialPermitStatus, Operator } from "@openbts/shared/contract";

import {
  type CapableCountries,
  type MapFilters,
  type MapFiltersChange,
  type MapRecentDateField,
  clearMapFilters,
  countActiveMapFilters,
} from "../data/mapFilters";
import { toggleValue } from "@/lib/utils";
import type { StationStatus } from "@/types/station";

type UseFilterHandlersArgs = {
  filters: MapFilters;
  operators: readonly Operator[] | undefined;
  countries: CapableCountries;
  onFiltersChange: (update: MapFiltersChange) => void;
};

export function useFilterHandlers({ filters, operators, countries, onFiltersChange }: UseFilterHandlersArgs) {
  function handleToggleOperator(operatorId: number) {
    onFiltersChange((current) => ({ ...current, operatorIds: toggleValue(current.operatorIds, operatorId) }));
  }

  function handleToggleCountry(countryCode: string) {
    onFiltersChange((current) => ({ ...current, countryCodes: toggleValue(current.countryCodes, countryCode) }));
  }

  function handleToggleBand(value: number) {
    onFiltersChange((current) => ({ ...current, bands: toggleValue(current.bands, value) }));
  }

  function handleToggleRat(rat: string) {
    onFiltersChange((current) => ({ ...current, rat: toggleValue(current.rat, rat) }));
  }

  function handleToggleStatus(status: StationStatus) {
    onFiltersChange((current) => {
      const nextStatus = toggleValue(current.status, status);
      if (nextStatus.length === 0) return current;
      return { ...current, status: nextStatus };
    });
  }

  function handleToggleOfficialStatus(status: OfficialPermitStatus) {
    onFiltersChange((current) => {
      const nextStatuses = toggleValue(current.officialStatuses, status);
      if (nextStatuses.length === 0) return current;
      return { ...current, officialStatuses: nextStatuses };
    });
  }

  function handleClearAllRats() {
    onFiltersChange((current) => ({ ...current, rat: [] }));
  }

  function handleClearAllBands() {
    onFiltersChange((current) => ({ ...current, bands: [] }));
  }

  function handleRecentDaysChange(days: number | null) {
    onFiltersChange((current) => ({ ...current, recentDays: days }));
  }

  function handleRecentDateFieldChange(fields: MapRecentDateField[]) {
    onFiltersChange((current) => ({ ...current, recentDateFields: fields }));
  }

  function handleClearFilters() {
    onFiltersChange(clearMapFilters);
  }

  return {
    handleToggleOperator,
    handleToggleCountry,
    handleToggleBand,
    handleToggleRat,
    handleToggleStatus,
    handleToggleOfficialStatus,
    handleClearAllRats,
    handleClearAllBands,
    handleRecentDaysChange,
    handleRecentDateFieldChange,
    handleClearFilters,
    activeFilterCount: countActiveMapFilters(filters, operators, countries),
  };
}
