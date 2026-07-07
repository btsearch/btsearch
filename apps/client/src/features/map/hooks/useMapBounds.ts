import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

type UseMapBoundsArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  debounceMs?: number;
};

function formatBounds(map: MapLibreMap): string {
  const b = map.getBounds();
  return `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
}

export function useMapBounds({ map, isLoaded, debounceMs = 300 }: UseMapBoundsArgs) {
  const [bounds, setBounds] = useState("");
  const [zoom, setZoom] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceMsRef = useRef(debounceMs);
  const initializedRef = useRef(false);
  debounceMsRef.current = debounceMs;

  useEffect(() => {
    if (!map || initializedRef.current) return;

    try {
      initializedRef.current = true;
      setZoom(map.getZoom());
      setBounds(formatBounds(map));
    } catch {}
  }, [map]);

  useEffect(() => {
    if (!map || !isLoaded) return;

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
