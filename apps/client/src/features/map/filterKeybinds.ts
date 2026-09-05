import { toggleValue } from "@/lib/utils.js";
import type { StationFilters, StationSource } from "@/types/station.js";

import { RAT_OPTIONS, UKE_RAT_OPTIONS } from "./constants.js";

const OPERATOR_KEYBINDS: Record<string, number> = { "1": 26001, "2": 26002, "3": 26003, "4": 26006 };
const RAT_KEYBINDS: Record<string, string> = { g: "GSM", u: "UMTS", l: "LTE", n: "NR", i: "iot" };
const VALID_RATS_BY_SOURCE: Record<StationSource, ReadonlySet<string>> = {
  internal: new Set<string>(RAT_OPTIONS.map((rat) => rat.value)),
  uke: new Set<string>(UKE_RAT_OPTIONS.map((rat) => rat.value)),
};

export type StationFiltersUpdater = (filters: StationFilters) => StationFilters;
export type MapVisibilityKeybind = "azimuths" | "stations";

const MAP_VISIBILITY_KEYBINDS: ReadonlyMap<string, MapVisibilityKeybind> = new Map([
  ["a", "azimuths"],
  ["s", "stations"],
]);

export function getMapVisibilityKeybind(key: string, shiftKey: boolean): MapVisibilityKeybind | undefined {
  if (shiftKey) return undefined;
  return MAP_VISIBILITY_KEYBINDS.get(key.toLowerCase());
}

export function changeFilterSource(filters: StationFilters, source: StationSource): StationFilters {
  const validRats = VALID_RATS_BY_SOURCE[source];
  return { ...filters, source, rat: filters.rat.filter((rat) => validRats.has(rat)) };
}

function clearFilters(filters: StationFilters): StationFilters {
  return {
    operators: [],
    bands: [],
    rat: [],
    status: ["published"],
    source: filters.source,
    recentDays: null,
    recentDateFields: ["createdAt"],
    showStations: filters.showStations,
    showRadiolines: filters.showRadiolines,
    radiolineOperators: [],
    showHeatmap: filters.showHeatmap,
    showPlannedMeasurements: filters.showPlannedMeasurements,
  };
}

export function getMapFilterKeybindUpdater(key: string, shiftKey: boolean): StationFiltersUpdater | undefined {
  const normalizedKey = key.toLowerCase();

  if (shiftKey) {
    if (normalizedKey === "f") return clearFilters;
    const rat = RAT_KEYBINDS[normalizedKey];
    if (rat === undefined) return undefined;
    return (filters) => ({ ...filters, rat: toggleValue(filters.rat, rat) });
  }

  switch (normalizedKey) {
    case "r":
      return (filters) => ({ ...filters, showRadiolines: !filters.showRadiolines });
    case "z":
      return (filters) => changeFilterSource(filters, filters.source === "uke" ? "internal" : "uke");
    case "n":
      return (filters) => ({ ...filters, recentDays: filters.recentDays === null ? 30 : null });
    default: {
      const operator = OPERATOR_KEYBINDS[normalizedKey];
      if (operator === undefined) return undefined;
      return (filters) => ({ ...filters, operators: toggleValue(filters.operators, operator) });
    }
  }
}
