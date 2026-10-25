import type { ObservedSite } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import type { MapLayerMouseEvent, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useEffectEvent, useMemo } from "react";
import { createPortal } from "react-dom";

import { ESTIMATED_SITES_LAYER_ID, ESTIMATED_SITES_SOURCE_ID, ESTIMATED_SITE_AREA_SOURCE_ID, POINT_LAYER_ID } from "../../constants";
import type { MapLookups } from "../../data/mapLookups";
import type { CrowdAccess } from "../access/useCrowdAccess";
import { type EstimatedSiteSource, observedCellsQueryOptions, observedSiteQueryOptions } from "../api/observedQueries";
import { useGeoJsonLayers } from "../layers/useGeoJsonLayers";
import type { CrowdTheme } from "../style/palette";
import { EstimatedSitePopupContent } from "./estimatedSitePopup";
import { type EstimatedSiteMarker, toEstimatedSiteMarker } from "./estimatedSites";
import { AREA_LAYERS, RING_LAYERS, toAreaFeatures, toRingFeatures } from "./siteLayers";
import { addRingImages } from "./siteRingImages";
import { useEstimatedSitePopup } from "./useEstimatedSitePopup";
import { useMap } from "@/components/ui/map";
import { hasReliableHoverPointer } from "@/lib/dom/pointer";
import { queryClient } from "@/lib/queryClient";

type EstimatedSitesLayerProps = {
  markers: readonly EstimatedSiteMarker[];
  access: CrowdAccess;
  lookups: MapLookups | undefined;
  theme: CrowdTheme;
  isPickingReceiver: boolean;
  sharedSiteId: number | null;
  onSharedSiteHandled: () => void;
  onOpenStation: (stationId: number) => void;
};

const STATION_LAYER_IDS = [POINT_LAYER_ID, `${POINT_LAYER_ID}-symbol`];

function hasStationUnder(map: MapLibreMap, event: MapLayerMouseEvent): boolean {
  const layers = STATION_LAYER_IDS.filter((layerId) => map.getLayer(layerId) !== undefined);
  return layers.length > 0 && map.queryRenderedFeatures(event.point, { layers }).length > 0;
}

function readMarkerKey(event: MapLayerMouseEvent): string | null {
  const key: unknown = event.features?.[0]?.properties.key;
  return typeof key === "string" ? key : null;
}

function readSharedSiteSource(site: ObservedSite, isStaff: boolean): EstimatedSiteSource {
  if (site.isPublic) return "public";
  return isStaff ? "staff" : "mine";
}

export function EstimatedSitesLayer({
  markers,
  access,
  lookups,
  theme,
  isPickingReceiver,
  sharedSiteId,
  onSharedSiteHandled,
  onOpenStation,
}: EstimatedSitesLayerProps) {
  const { map, isLoaded } = useMap();
  const { openPopup, showPopup, flyToPopup } = useEstimatedSitePopup(map);
  const rings = useMemo(() => markers.map((marker) => marker.ring), [markers]);
  const ringFeatures = useMemo(() => toRingFeatures(markers), [markers]);
  const markersByKey = useMemo(() => new Map(markers.map((marker) => [marker.key, marker])), [markers]);
  const { data: sharedSite, isError: hasSharedSiteFailed } = useQuery(observedSiteQueryOptions(sharedSiteId));
  const markSharedSiteHandled = useEffectEvent(onSharedSiteHandled);

  const findMarker = (event: MapLayerMouseEvent) => {
    const key = readMarkerKey(event);
    return key === null ? undefined : markersByKey.get(key);
  };
  const openClickedSite = useEffectEvent((target: MapLibreMap, event: MapLayerMouseEvent) => {
    if (isPickingReceiver || hasStationUnder(target, event)) return;
    const marker = findMarker(event);
    if (marker !== undefined) showPopup(marker);
  });
  const prefetchPressedSite = useEffectEvent((event: MapLayerMouseEvent) => {
    const marker = findMarker(event);
    if (marker === undefined) return;
    void queryClient.prefetchQuery(observedCellsQueryOptions({ kind: "sites", observedSiteIds: marker.entries.map((entry) => entry.site.id) }));
  });

  useGeoJsonLayers({
    map,
    isLoaded,
    sourceId: ESTIMATED_SITES_SOURCE_ID,
    data: ringFeatures,
    layers: RING_LAYERS,
    level: "rings",
    addImages: (target) => addRingImages(target, rings),
  });

  useGeoJsonLayers({
    map,
    isLoaded,
    sourceId: ESTIMATED_SITE_AREA_SOURCE_ID,
    data: openPopup === null ? null : toAreaFeatures(openPopup.marker),
    layers: AREA_LAYERS,
    level: "marks",
  });

  useEffect(() => {
    if (!map || !isLoaded) return;
    const usesHover = hasReliableHoverPointer();
    const handleClick = (event: MapLayerMouseEvent) => openClickedSite(map, event);
    const handleMouseDown = (event: MapLayerMouseEvent) => prefetchPressedSite(event);
    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", ESTIMATED_SITES_LAYER_ID, handleClick);
    map.on("mousedown", ESTIMATED_SITES_LAYER_ID, handleMouseDown);
    if (usesHover) {
      map.on("mouseenter", ESTIMATED_SITES_LAYER_ID, handleMouseEnter);
      map.on("mouseleave", ESTIMATED_SITES_LAYER_ID, handleMouseLeave);
    }
    return () => {
      map.off("click", ESTIMATED_SITES_LAYER_ID, handleClick);
      map.off("mousedown", ESTIMATED_SITES_LAYER_ID, handleMouseDown);
      if (!usesHover) return;
      map.off("mouseenter", ESTIMATED_SITES_LAYER_ID, handleMouseEnter);
      map.off("mouseleave", ESTIMATED_SITES_LAYER_ID, handleMouseLeave);
      map.getCanvas().style.cursor = "";
    };
  }, [map, isLoaded]);

  useEffect(() => {
    if (sharedSiteId === null) return;
    if (hasSharedSiteFailed) {
      markSharedSiteHandled();
      return;
    }
    if (!map || sharedSite?.id !== sharedSiteId) return;
    markSharedSiteHandled();
    const marker = toEstimatedSiteMarker({ site: sharedSite, source: readSharedSiteSource(sharedSite, access.isStaff) }, lookups, theme);
    if (marker !== null) flyToPopup(marker);
  }, [map, sharedSiteId, sharedSite, hasSharedSiteFailed, access.isStaff, lookups, theme, flyToPopup]);

  if (openPopup === null) return null;
  return createPortal(
    <EstimatedSitePopupContent
      marker={openPopup.marker}
      lookups={lookups}
      isStaff={access.isStaff}
      onClose={() => openPopup.popup.remove()}
      onOpenStation={(stationId) => {
        onOpenStation(stationId);
        openPopup.popup.remove();
      }}
    />,
    openPopup.container,
  );
}
