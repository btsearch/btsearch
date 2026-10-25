import type { ErrorEvent, ExpressionSpecification, FilterSpecification, Map as MapLibreMap, MapSourceDataEvent, VectorTileSource } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { LAYER_FADE } from "./layerFade";
import { type LayerPlacement, findLayerAbove } from "./layerOrder";
import { useFadedLayerGroup } from "./useFadedLayerGroup";

export type TileStatus = "idle" | "loading" | "ready" | "empty" | "error";

type UseVectorFillLayerArgs = LayerPlacement & {
  map: MapLibreMap | null;
  isLoaded: boolean;
  sourceId: string;
  layerId: string;
  sourceLayer: string;
  tileJsonUrl: string | null;
  fillColor: ExpressionSpecification;
  opacity: number;
  filter?: FilterSpecification;
  sortKey?: ExpressionSpecification;
};

type SettledStatus = { key: string; status: TileStatus };

const NO_STATUS: SettledStatus = { key: "", status: "idle" };

export function useVectorFillLayer({
  map,
  isLoaded,
  sourceId,
  layerId,
  sourceLayer,
  tileJsonUrl,
  fillColor,
  opacity,
  filter,
  sortKey,
  ...placement
}: UseVectorFillLayerArgs) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<SettledStatus>(NO_STATUS);
  const appliedTilesRef = useRef<string | null>(null);
  const isShown = tileJsonUrl !== null;
  const tilesKey = tileJsonUrl === null ? null : `${tileJsonUrl}#${attempt}`;
  const colorKey = JSON.stringify(fillColor);
  const filterKey = JSON.stringify(filter ?? null);
  const readPaint = useEffectEvent(() => ({ fillColor, opacity, filter }));

  useFadedLayerGroup({
    map,
    isLoaded,
    isShown,
    layers: [{ id: layerId, property: "fill-opacity", opacity }],
    sourceIds: [sourceId],
    ensureLayers: (target) => {
      if (tileJsonUrl === null) return;
      if (!target.getSource(sourceId)) {
        target.addSource(sourceId, { type: "vector", url: tileJsonUrl });
        appliedTilesRef.current = tilesKey;
      }
      if (target.getLayer(layerId)) return;
      target.addLayer(
        {
          id: layerId,
          type: "fill",
          source: sourceId,
          "source-layer": sourceLayer,
          ...(filter === undefined ? {} : { filter }),
          ...(sortKey === undefined ? {} : { layout: { "fill-sort-key": sortKey } }),
          paint: { "fill-color": fillColor, "fill-opacity": 0, "fill-opacity-transition": LAYER_FADE, "fill-antialias": false },
        },
        findLayerAbove(target, layerId, placement),
      );
    },
  });

  useEffect(() => {
    if (!map || !isLoaded || tileJsonUrl === null || tilesKey === appliedTilesRef.current) return;
    try {
      const source = map.getSource(sourceId) as VectorTileSource | undefined;
      if (source === undefined) return;
      source.setUrl(tileJsonUrl);
      appliedTilesRef.current = tilesKey;
    } catch {}
  }, [map, isLoaded, sourceId, tileJsonUrl, tilesKey]);

  useEffect(() => {
    if (!map || !isLoaded || !isShown) return;
    const paint = readPaint();
    try {
      if (!map.getLayer(layerId)) return;
      map.setPaintProperty(layerId, "fill-color", paint.fillColor);
      map.setPaintProperty(layerId, "fill-opacity", paint.opacity);
      map.setFilter(layerId, paint.filter ?? null);
    } catch {}
  }, [map, isLoaded, isShown, layerId, colorKey, filterKey, opacity]);

  useEffect(() => {
    if (!map || !isLoaded || tilesKey === null) return;
    let hasFailed = false;

    const settle = () => {
      try {
        const source = map.getSource(sourceId) as VectorTileSource | undefined;
        if (hasFailed || source === undefined || !source.loaded()) return;
        if (map.getZoom() < source.minzoom) {
          setSettled({ key: tilesKey, status: "idle" });
          return;
        }
        if (!map.isSourceLoaded(sourceId)) return;
        const isEmpty = map.querySourceFeatures(sourceId, { sourceLayer }).length === 0;
        setSettled({ key: tilesKey, status: isEmpty ? "empty" : "ready" });
      } catch {}
    };
    const markLoading = (event: MapSourceDataEvent) => {
      if (event.sourceId === sourceId && !hasFailed) setSettled({ key: tilesKey, status: "loading" });
    };
    const markFailed = (event: ErrorEvent) => {
      if (!("sourceId" in event) || event.sourceId !== sourceId) return;
      hasFailed = true;
      setSettled({ key: tilesKey, status: "error" });
    };

    map.on("sourcedataloading", markLoading);
    map.on("idle", settle);
    map.on("error", markFailed);
    return () => {
      map.off("sourcedataloading", markLoading);
      map.off("idle", settle);
      map.off("error", markFailed);
    };
  }, [map, isLoaded, sourceId, sourceLayer, tilesKey]);

  let status: TileStatus = "idle";
  if (tilesKey !== null) status = settled.key === tilesKey ? settled.status : "loading";

  return { status, retry: () => setAttempt((current) => current + 1) };
}
