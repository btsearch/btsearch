type HoverSource = "chart" | "map";

type HoveredDistance = {
  distanceMeters: number;
  source: HoverSource;
};

export type HoveredDistanceStore = {
  get: () => HoveredDistance | null;
  set: (hovered: HoveredDistance) => void;
  release: (source: HoverSource) => void;
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
};

export function createHoveredDistanceStore(): HoveredDistanceStore {
  const listeners = new Set<() => void>();
  let current: HoveredDistance | null = null;

  function replace(next: HoveredDistance | null) {
    current = next;
    for (const listener of listeners) listener();
  }

  function get() {
    return current;
  }

  function set(hovered: HoveredDistance) {
    if (current !== null && current.distanceMeters === hovered.distanceMeters && current.source === hovered.source) return;
    replace(hovered);
  }

  function release(source: HoverSource) {
    if (current !== null && current.source === source) replace(null);
  }

  function clear() {
    if (current !== null) replace(null);
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { get, set, release, clear, subscribe };
}

export function getMapHoveredDistance(store: HoveredDistanceStore): number | null {
  const hovered = store.get();
  return hovered !== null && hovered.source === "map" ? hovered.distanceMeters : null;
}
