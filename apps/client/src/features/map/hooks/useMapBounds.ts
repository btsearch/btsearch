import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

type UseMapBoundsArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  debounceMs?: number;
};

function formatBounds(map: MapLibreMap): string {
  const b = map.getBounds();
  const span = Math.max(b.getNorth() - b.getSouth(), 1e-7);
  const step = 2 ** Math.floor(Math.log2(span / 64));
  const snap = (value: number, up: boolean) => (up ? Math.ceil(value / step) : Math.floor(value / step)) * step;
  return `${snap(b.getSouth(), false)},${snap(b.getWest(), false)},${snap(b.getNorth(), true)},${snap(b.getEast(), true)}`;
}

export function useMapBounds({ map, isLoaded, debounceMs = 300 }: UseMapBoundsArgs) {
  const [bounds, setBounds] = useState("");
  const [zoom, setZoom] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceMsRef = useRef(debounceMs);
  debounceMsRef.current = debounceMs;

  useEffect(() => {
    if (!map || !isLoaded) {
      setIsMoving(false);
      return;
    }

    try {
      setIsMoving(false);
      setZoom(map.getZoom());
      setBounds(formatBounds(map));
    } catch {}

    const updateBounds = () => {
      setZoom(map.getZoom());

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setBounds(formatBounds(map));
      }, debounceMsRef.current);
    };

    const onMoveStart = () => setIsMoving(true);
    const onMoveEnd = () => {
      setIsMoving(false);
      updateBounds();
    };

    map.on("movestart", onMoveStart);
    map.on("moveend", onMoveEnd);

    return () => {
      map.off("movestart", onMoveStart);
      map.off("moveend", onMoveEnd);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [map, isLoaded]);

  return { bounds, zoom, isMoving };
}
