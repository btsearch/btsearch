import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useState } from "react";

import { formatV1Bounds, formatV2Bbox, readSnappedMapBox } from "../data/mapBox";

type UseMapBoundsArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  debounceMs?: number;
};

type MapBoundsStrings = {
  bounds: string;
  bbox: string;
};

const NO_BOUNDS: MapBoundsStrings = { bounds: "", bbox: "" };

function readBoundsStrings(map: MapLibreMap): MapBoundsStrings {
  const box = readSnappedMapBox(map);
  return { bounds: formatV1Bounds(box), bbox: formatV2Bbox(box) };
}

export function useMapBounds({ map, isLoaded, debounceMs = 300 }: UseMapBoundsArgs) {
  const [boundsStrings, setBoundsStrings] = useState(NO_BOUNDS);
  const [zoom, setZoom] = useState(0);
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    if (!map || !isLoaded) return;

    let boundsTimer: ReturnType<typeof setTimeout> | undefined;

    const applyBounds = () => {
      const next = readBoundsStrings(map);
      setBoundsStrings((previous) => (previous.bounds === next.bounds ? previous : next));
    };

    const initialFrame = requestAnimationFrame(() => {
      try {
        setIsMoving(map.isMoving());
        setZoom(map.getZoom());
        applyBounds();
      } catch {}
    });

    const updateBounds = () => {
      setZoom(map.getZoom());

      clearTimeout(boundsTimer);
      boundsTimer = setTimeout(applyBounds, debounceMs);
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
      cancelAnimationFrame(initialFrame);
      clearTimeout(boundsTimer);
    };
  }, [map, isLoaded, debounceMs]);

  return { bounds: boundsStrings.bounds, bbox: boundsStrings.bbox, zoom, isMoving: map !== null && isLoaded && isMoving };
}
