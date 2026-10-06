import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import type { MapFilters, MapFiltersChange } from "./mapFilters";
import { type MapFiltersScope, type SavedMapFilters, readSavedMapFilters, writeSavedMapFilters } from "./mapFilterStorage";
import { findOperatorIdsByMncs } from "./mapLookups";
import { operatorsQueryOptions } from "@/features/shared/lookups";

const NO_OVERRIDES: Partial<MapFilters> = {};
const NO_LEGACY_OPERATORS: readonly number[] = [];

export function useSavedMapFilters(scope: MapFiltersScope = "map", loadOverrides: Partial<MapFilters> = NO_OVERRIDES) {
  const [saved, setSaved] = useState<SavedMapFilters>(() => {
    const stored = readSavedMapFilters(scope);
    return { ...stored, filters: { ...stored.filters, ...loadOverrides } };
  });
  const hasLegacyOperators = saved.legacyOperatorMncs.length > 0;
  const { data: operators } = useQuery({ ...operatorsQueryOptions(), enabled: hasLegacyOperators });

  if (hasLegacyOperators && operators !== undefined) {
    const convertedIds = findOperatorIdsByMncs(operators, saved.legacyOperatorMncs);
    const operatorIds = [...new Set([...saved.filters.operatorIds, ...convertedIds])];
    setSaved({ filters: { ...saved.filters, operatorIds }, legacyOperatorMncs: NO_LEGACY_OPERATORS });
  }

  useEffect(() => {
    writeSavedMapFilters(scope, saved);
  }, [scope, saved]);

  const setFilters = useCallback((change: MapFiltersChange) => {
    setSaved((previous) => {
      const filters = typeof change === "function" ? change(previous.filters) : change;
      const keepsOperatorChoice = filters.operatorIds === previous.filters.operatorIds;
      return { filters, legacyOperatorMncs: keepsOperatorChoice ? previous.legacyOperatorMncs : NO_LEGACY_OPERATORS };
    });
  }, []);

  return [saved.filters, setFilters] as const;
}
