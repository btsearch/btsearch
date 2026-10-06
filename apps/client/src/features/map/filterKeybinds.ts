import { DEFAULT_RECENT_DAYS, type MapFiltersUpdater, changeMapFilterSource, clearMapFilters } from "./data/mapFilters";
import { toggleValue } from "@/lib/utils";

const OPERATOR_KEYS = ["1", "2", "3", "4"];
const RAT_KEYBINDS: Record<string, string> = { g: "GSM", u: "UMTS", l: "LTE", n: "NR", i: "iot" };

export type MapVisibilityKeybind = "azimuths" | "stations";

export type MapFilterKeybindContext = {
  operatorIds: readonly number[];
  isRegisterOnScreen: boolean;
};

const MAP_VISIBILITY_KEYBINDS: ReadonlyMap<string, MapVisibilityKeybind> = new Map([
  ["a", "azimuths"],
  ["s", "stations"],
]);

export function getMapVisibilityKeybind(key: string, shiftKey: boolean): MapVisibilityKeybind | undefined {
  if (shiftKey) return undefined;
  return MAP_VISIBILITY_KEYBINDS.get(key.toLowerCase());
}

export function getMapFilterKeybindUpdater(key: string, shiftKey: boolean, context: MapFilterKeybindContext): MapFiltersUpdater | undefined {
  const normalizedKey = key.toLowerCase();

  if (shiftKey) {
    if (normalizedKey === "f") return clearMapFilters;
    const rat = RAT_KEYBINDS[normalizedKey];
    if (rat === undefined) return undefined;
    return (filters) => ({ ...filters, rat: toggleValue(filters.rat, rat) });
  }

  switch (normalizedKey) {
    case "r":
      if (!context.isRegisterOnScreen) return undefined;
      return (filters) => ({ ...filters, showRadiolines: !filters.showRadiolines });
    case "z":
      if (!context.isRegisterOnScreen) return undefined;
      return (filters) => changeMapFilterSource(filters, filters.source === "uke" ? "internal" : "uke");
    case "n":
      return (filters) => ({ ...filters, recentDays: filters.recentDays === null ? DEFAULT_RECENT_DAYS : null });
    default: {
      const keyIndex = OPERATOR_KEYS.indexOf(normalizedKey);
      const operatorId = keyIndex === -1 ? undefined : context.operatorIds.at(keyIndex);
      if (operatorId === undefined) return undefined;
      return (filters) => ({ ...filters, operatorIds: toggleValue(filters.operatorIds, operatorId) });
    }
  }
}
