import { useCallback } from "react";

import { toggleValue } from "@/lib/utils.js";
import type { StationFilters, StationStatus } from "@/types/station.js";

import type { StationFiltersUpdater } from "../filterKeybinds.js";

type UseFilterHandlersArgs = {
  filters: StationFilters;
  onFiltersChange: (update: StationFilters | StationFiltersUpdater) => void;
};

export function useFilterHandlers({ filters, onFiltersChange }: UseFilterHandlersArgs) {
  const handleToggleOperator = useCallback(
    (mnc: number) => {
      onFiltersChange((current) => ({ ...current, operators: toggleValue(current.operators, mnc) }));
    },
    [onFiltersChange],
  );

  const handleToggleBand = useCallback(
    (value: number) => {
      onFiltersChange((current) => ({ ...current, bands: toggleValue(current.bands, value) }));
    },
    [onFiltersChange],
  );

  const handleToggleRat = useCallback(
    (rat: string) => {
      onFiltersChange((current) => ({ ...current, rat: toggleValue(current.rat, rat) }));
    },
    [onFiltersChange],
  );

  const handleToggleStatus = useCallback(
    (status: StationStatus) => {
      onFiltersChange((current) => {
        const nextStatus = toggleValue(current.status, status);
        if (nextStatus.length === 0) return current;
        return { ...current, status: nextStatus };
      });
    },
    [onFiltersChange],
  );

  const handleClearAllRats = useCallback(() => {
    onFiltersChange((current) => ({ ...current, rat: [] }));
  }, [onFiltersChange]);

  const handleClearAllBands = useCallback(() => {
    onFiltersChange((current) => ({ ...current, bands: [] }));
  }, [onFiltersChange]);

  const handleRecentDaysChange = useCallback(
    (days: number | null) => {
      onFiltersChange((current) => ({ ...current, recentDays: days }));
    },
    [onFiltersChange],
  );

  const handleRecentDateFieldChange = useCallback(
    (fields: ("createdAt" | "updatedAt")[]) => {
      onFiltersChange((current) => ({ ...current, recentDateFields: fields }));
    },
    [onFiltersChange],
  );

  const handleClearFilters = useCallback(() => {
    onFiltersChange((current) => ({
      operators: [],
      bands: [],
      rat: [],
      status: ["published"],
      source: current.source,
      recentDays: null,
      recentDateFields: ["createdAt"],
      showStations: current.showStations,
      showRadiolines: current.showRadiolines,
      radiolineOperators: [],
      showHeatmap: current.showHeatmap,
      showPlannedMeasurements: current.showPlannedMeasurements,
    }));
  }, [onFiltersChange]);

  const activeFilterCount =
    filters.operators.length +
    filters.bands.length +
    filters.rat.length +
    (filters.status.length === 1 && filters.status.includes("published") ? 0 : filters.status.length) +
    (filters.recentDays !== null ? 1 : 0) +
    (filters.showRadiolines ? (filters.radiolineOperators?.length ?? 0) : 0);

  return {
    handleToggleOperator,
    handleToggleBand,
    handleToggleRat,
    handleToggleStatus,
    handleClearAllRats,
    handleClearAllBands,
    handleRecentDaysChange,
    handleRecentDateFieldChange,
    handleClearFilters,
    activeFilterCount,
  };
}
