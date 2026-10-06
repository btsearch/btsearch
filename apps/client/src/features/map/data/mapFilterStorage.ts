import { DEFAULT_MAP_FILTERS, type MapFilters, readStoredMapFilters, readStoredOperatorMncs } from "./mapFilters";
import { readStoredRecord } from "@/lib/storedRecord";

export type MapFiltersScope = "map" | "list-map";

export type SavedMapFilters = {
  filters: MapFilters;
  legacyOperatorMncs: readonly number[];
};

const STORAGE_KEYS: Record<MapFiltersScope, string> = { map: "map:filters:v2", "list-map": "list-map:filters:v2" };
const LEGACY_STORAGE_KEYS: Record<MapFiltersScope, string> = { map: "map:filters", "list-map": "list-map:filters" };
const LEGACY_OPERATORS_FIELD = "operators";
const PENDING_OPERATORS_FIELD = "legacyOperatorMncs";

export function readSavedMapFilters(scope: MapFiltersScope): SavedMapFilters {
  const saved = readStoredRecord(STORAGE_KEYS[scope]);
  if (saved !== null) return { filters: readStoredMapFilters(saved), legacyOperatorMncs: readStoredOperatorMncs(saved, PENDING_OPERATORS_FIELD) };

  const legacy = readStoredRecord(LEGACY_STORAGE_KEYS[scope]);
  if (legacy === null) return { filters: DEFAULT_MAP_FILTERS, legacyOperatorMncs: [] };
  return { filters: readStoredMapFilters(legacy), legacyOperatorMncs: readStoredOperatorMncs(legacy, LEGACY_OPERATORS_FIELD) };
}

export function writeSavedMapFilters(scope: MapFiltersScope, saved: SavedMapFilters): void {
  const stored: Record<string, unknown> = { ...saved.filters };
  if (saved.legacyOperatorMncs.length > 0) stored[PENDING_OPERATORS_FIELD] = saved.legacyOperatorMncs;

  try {
    localStorage.setItem(STORAGE_KEYS[scope], JSON.stringify(stored));
  } catch {}
}
