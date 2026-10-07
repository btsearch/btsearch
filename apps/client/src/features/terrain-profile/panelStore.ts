import type { TerrainProfilePanelModel } from "./hooks/useTerrainProfileController";

export type TerrainPanelStore = {
  get: () => TerrainProfilePanelModel;
  set: (panel: TerrainProfilePanelModel) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createTerrainPanelStore(initialPanel: TerrainProfilePanelModel): TerrainPanelStore {
  const listeners = new Set<() => void>();
  let current = initialPanel;

  function get() {
    return current;
  }

  function set(panel: TerrainProfilePanelModel) {
    if (panel === current) return;
    current = panel;
    for (const listener of listeners) listener();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { get, set, subscribe };
}
