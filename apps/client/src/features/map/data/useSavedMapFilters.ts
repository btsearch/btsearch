import type { OfficialBandLabel } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  type MapFilters,
  type MapFiltersChange,
  areMapFiltersUrlEquivalent,
  listMapRegisterRatOptions,
  readStoredMapFilters,
  sanitizeMapFilters,
} from "./mapFilters";
import { useCloudMapFilters } from "./mapFiltersCloud";
import { type MapFiltersScope, type SavedMapFilters, readSavedMapFilters, writeSavedMapFilters } from "./mapFilterStorage";
import { findOperatorIdsByMncs } from "./mapLookups";
import { officialBandLabelsQueryOptions } from "@/features/official/queries";
import { operatorsQueryOptions } from "@/features/shared/lookups";

const NO_OVERRIDES: Partial<MapFilters> = {};
const NO_LEGACY_OPERATORS: readonly number[] = [];
const appliedCloudMapFilters = new WeakSet<object>();

type MapFiltersOrigin = "load" | "local" | "cloud" | "url";
type SavedMapFiltersState = SavedMapFilters & { origin: MapFiltersOrigin; cloudSnapshot: object | null };

function listRegisterRatValues(labels: readonly OfficialBandLabel[]): string[] {
  return listMapRegisterRatOptions(labels).map((option) => option.value);
}

export function useSavedMapFilters(scope: MapFiltersScope = "map", loadOverrides: Partial<MapFilters> = NO_OVERRIDES) {
  const [state, setState] = useState<SavedMapFiltersState>(() => {
    const stored = readSavedMapFilters(scope);
    return { ...stored, filters: { ...stored.filters, ...loadOverrides }, origin: "load", cloudSnapshot: null };
  });
  const mountFiltersRef = useRef(state.filters);
  const { cloudFilters, queueFilters } = useCloudMapFilters(scope);
  const hasLegacyOperators = state.legacyOperatorMncs.length > 0;
  const { data: operators } = useQuery({ ...operatorsQueryOptions(), enabled: hasLegacyOperators });
  const { data: registerRats, isError: hasRegisterRatListFailed } = useQuery({
    ...officialBandLabelsQueryOptions(),
    select: listRegisterRatValues,
    enabled: state.filters.source === "official",
  });

  if (state.filters.source === "official" && state.filters.rat.length > 0 && registerRats !== undefined) {
    const filters = sanitizeMapFilters(state.filters, registerRats);
    if (filters.rat.length !== state.filters.rat.length) setState({ ...state, filters });
  }

  if (hasLegacyOperators && operators !== undefined) {
    const convertedIds = findOperatorIdsByMncs(operators, state.legacyOperatorMncs);
    const operatorIds = [...new Set([...state.filters.operatorIds, ...convertedIds])];
    setState((previous) => ({ ...previous, filters: { ...previous.filters, operatorIds }, legacyOperatorMncs: NO_LEGACY_OPERATORS }));
  }

  if (cloudFilters !== null && cloudFilters !== state.cloudSnapshot && !appliedCloudMapFilters.has(cloudFilters)) {
    const cloudState: SavedMapFilters & { origin: MapFiltersOrigin } =
      state.origin === "url" ? state : { filters: readStoredMapFilters(cloudFilters), legacyOperatorMncs: NO_LEGACY_OPERATORS, origin: "cloud" };
    setState({ ...cloudState, cloudSnapshot: cloudFilters });
  }

  useEffect(() => {
    if (state.cloudSnapshot !== null) appliedCloudMapFilters.add(state.cloudSnapshot);
    if (state.origin === "url") return;
    writeSavedMapFilters(scope, state);
    if (state.origin === "local" && state.legacyOperatorMncs.length === 0) queueFilters(state.filters);
  }, [queueFilters, scope, state]);

  const setFilters = useCallback((change: MapFiltersChange) => {
    setState((previous) => {
      const filters = typeof change === "function" ? change(previous.filters) : change;
      const keepsOperatorChoice = filters.operatorIds === previous.filters.operatorIds;
      return {
        filters,
        legacyOperatorMncs: keepsOperatorChoice ? previous.legacyOperatorMncs : NO_LEGACY_OPERATORS,
        origin: "local",
        cloudSnapshot: previous.cloudSnapshot,
      };
    });
  }, []);

  const setFiltersFromUrl = useCallback((filters: MapFilters) => {
    if (areMapFiltersUrlEquivalent(filters, mountFiltersRef.current)) return;
    setState((previous) => ({ filters, legacyOperatorMncs: NO_LEGACY_OPERATORS, origin: "url", cloudSnapshot: previous.cloudSnapshot }));
  }, []);

  return [state.filters, setFilters, registerRats !== undefined || hasRegisterRatListFailed, setFiltersFromUrl] as const;
}
