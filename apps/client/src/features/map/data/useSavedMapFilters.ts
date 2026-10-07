import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { registerBandsQueryOptions } from "../api";
import { type MapFilters, type MapFiltersChange, sanitizeMapFilters } from "./mapFilters";
import { type MapFiltersScope, type SavedMapFilters, readSavedMapFilters, writeSavedMapFilters } from "./mapFilterStorage";
import { findOperatorIdsByMncs } from "./mapLookups";
import { operatorsQueryOptions } from "@/features/shared/lookups";
import { listRegisterRatOptions } from "@/features/shared/rat";

const NO_OVERRIDES: Partial<MapFilters> = {};
const NO_LEGACY_OPERATORS: readonly number[] = [];

export function useSavedMapFilters(scope: MapFiltersScope = "map", loadOverrides: Partial<MapFilters> = NO_OVERRIDES) {
  const [saved, setSaved] = useState<SavedMapFilters>(() => {
    const stored = readSavedMapFilters(scope);
    return { ...stored, filters: { ...stored.filters, ...loadOverrides } };
  });
  const hasLegacyOperators = saved.legacyOperatorMncs.length > 0;
  const { data: operators } = useQuery({ ...operatorsQueryOptions(), enabled: hasLegacyOperators });
  const { data: registerRatOptions, isError: hasRegisterRatListFailed } = useQuery({
    ...registerBandsQueryOptions(),
    select: listRegisterRatOptions,
    enabled: saved.filters.source === "uke",
  });

  if (saved.filters.source === "uke" && saved.filters.rat.length > 0 && registerRatOptions !== undefined) {
    const filters = sanitizeMapFilters(
      saved.filters,
      registerRatOptions.map((rat) => rat.value),
    );
    if (filters.rat.length !== saved.filters.rat.length) setSaved({ ...saved, filters });
  }

  if (hasLegacyOperators && operators !== undefined) {
    const convertedIds = findOperatorIdsByMncs(operators, saved.legacyOperatorMncs);
    const operatorIds = [...new Set([...saved.filters.operatorIds, ...convertedIds])];
    setSaved((previous) => ({ filters: { ...previous.filters, operatorIds }, legacyOperatorMncs: NO_LEGACY_OPERATORS }));
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

  return [saved.filters, setFilters, registerRatOptions !== undefined || hasRegisterRatListFailed] as const;
}
