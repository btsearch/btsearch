import type { Map as MaplibreMap } from "maplibre-gl";
import { useEffect } from "react";

const MAP_POSITION_KEY = "map:position";

type SavedMapPosition = { center: [number, number]; zoom: number };
type MapPositionPersistenceOptions = { map: MaplibreMap | null; isLoaded: boolean };

export function loadMapPosition(): SavedMapPosition | null {
  try {
    const raw = localStorage.getItem(MAP_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.center) && parsed.center.length === 2 && typeof parsed.zoom === "number") {
      return parsed as SavedMapPosition;
    }
  } catch {}
  return null;
}

function saveMapPosition(center: [number, number], zoom: number): void {
  try {
    localStorage.setItem(MAP_POSITION_KEY, JSON.stringify({ center, zoom }));
  } catch {}
}

export function useMapPositionPersistence({ map, isLoaded }: MapPositionPersistenceOptions): void {
  useEffect(() => {
    if (!map || !isLoaded) return;
    const handleMoveEnd = () => {
      const center = map.getCenter();
      saveMapPosition([center.lng, center.lat], map.getZoom());
    };
    map.on("moveend", handleMoveEnd);
    return () => {
      map.off("moveend", handleMoveEnd);
    };
  }, [map, isLoaded]);
}
