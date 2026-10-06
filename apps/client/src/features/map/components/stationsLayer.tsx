import { useQueryClient } from "@tanstack/react-query";
import type { Map as MapLibreMap, MapMouseEvent, MapTouchEvent } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PLANNED_PEM_LAYER_ID, POINT_LAYER_ID } from "../constants";
import type { MapFilters } from "../data/mapFilters";
import { useMapLookups } from "../data/mapLookups";
import { type MapPlace, type MapPoint, listRegisterStations, toMapPlace } from "../data/mapPoints";
import { mapPointsToGeoJSON } from "../geojson";
import { useAzimuthLayer } from "../hooks/useAzimuthLayer";
import { useHeatmapLayer } from "../hooks/useHeatmapLayer";
import { useMapKeybinds } from "../hooks/useMapKeybinds";
import { type FeatureClickData, useMapLayer } from "../hooks/useMapLayer";
import type { FollowMapPoints, MapPopupLocation, ShowMapPopup } from "../hooks/useMapPopup";
import { type UrlInitialization, useUrlSync } from "../hooks/useURLSync";
import { groupPermitsByStation } from "../utils";
import { StationHoverTooltipContent } from "./stationHoverTooltipContent";
import { useMap } from "@/components/ui/map";
import { fetchUkePermit, fetchUkeStation } from "@/features/station-details/api";
import { locationRecordQueryOptions, stationRecordQueryOptions } from "@/features/station-details/station/api";
import { usePreferences } from "@/hooks/usePreferences";
import { showApiError } from "@/lib/api";
import type { StationSource, UkeStation } from "@/types/station";

const EMPTY_GEOJSON = { type: "FeatureCollection" as const, features: [] };
const EMPTY_BLOCKED_LAYERS: string[] = [];
const PLANNED_PEM_BLOCKED_LAYERS = [PLANNED_PEM_LAYER_ID];
const MAP_TOUCH_LONG_PRESS_MS = 500;
const MAP_TOUCH_MOVE_TOLERANCE_PX = 12;
const SHARED_STATION_COORDINATE_TOLERANCE = 0.00001;
const SHARED_TARGET_ZOOM = 16;

class LegacyUkeStationLinkError extends Error {
  constructor(readonly reason: "ambiguous" | "notFound") {
    super(reason);
  }
}

async function resolveLegacyUkeStation(stationId: string, center?: [number, number]): Promise<UkeStation> {
  const numericId = Number(stationId);
  const hasNumericId = /^\d+$/.test(stationId) && Number.isSafeInteger(numericId) && numericId > 0;
  const [permitsResult, stationResult] = await Promise.allSettled([
    fetchUkePermit(stationId),
    hasNumericId ? fetchUkeStation(numericId) : Promise.resolve(null),
  ]);
  const candidates = new Map<number, UkeStation>();
  if (permitsResult.status === "fulfilled") for (const station of groupPermitsByStation(permitsResult.value)) candidates.set(station.id, station);
  if (stationResult.status === "fulfilled" && stationResult.value) candidates.set(stationResult.value.id, stationResult.value);

  const coordinateMatches = center
    ? [...candidates.values()].filter(
        (station) =>
          station.location &&
          Math.abs(station.location.latitude - center[1]) < SHARED_STATION_COORDINATE_TOLERANCE &&
          Math.abs(station.location.longitude - center[0]) < SHARED_STATION_COORDINATE_TOLERANCE,
      )
    : [];
  if (coordinateMatches.length === 1) return coordinateMatches[0];
  if (coordinateMatches.length > 1) throw new LegacyUkeStationLinkError("ambiguous");

  const [onlyStation] = candidates.values();
  if (candidates.size === 1 && onlyStation) return onlyStation;
  if (candidates.size > 1) throw new LegacyUkeStationLinkError("ambiguous");
  if (permitsResult.status === "rejected") throw permitsResult.reason;
  if (stationResult.status === "rejected") throw stationResult.reason;
  throw new LegacyUkeStationLinkError("notFound");
}

function flyToSharedTarget(map: MapLibreMap, longitude: number, latitude: number): void {
  map.flyTo({ center: [longitude, latitude], zoom: SHARED_TARGET_ZOOM, essential: true, speed: 1.5 });
}

function waitForMoveEnd(map: MapLibreMap): Promise<void> {
  return new Promise((resolve) => map.once("moveend", () => resolve()));
}

function findPoint(pointsById: ReadonlyMap<number, MapPoint>, locationId: number, source: StationSource): MapPoint | undefined {
  const point = pointsById.get(locationId);
  return point?.source === source ? point : undefined;
}

type PopupActions = {
  show: ShowMapPopup;
  followPoints: FollowMapPoints;
  cleanup: () => void;
};

type StationActions = {
  openDetails: (id: number, source: StationSource) => boolean | void;
  openUkeDetails: (station: UkeStation) => boolean | void;
};

type CommonStationsLayerProps = {
  filters: MapFilters;
  points: MapPoint[];
  wantAzimuths: boolean;
  isPickingReceiver?: boolean;
  onActiveMarkerChange?: (marker: { latitude: number; longitude: number } | null) => void;
  stationActions: StationActions;
  popupActions: PopupActions;
  onRadiolineIdFromUrl?: (id: number) => void;
  activePopupLocations?: MapPopupLocation[];
};

type StationsLayerProps = CommonStationsLayerProps &
  (
    | { urlSyncEnabled?: true; savedFilters: MapFilters; onFiltersChange: (filters: MapFilters) => void }
    | { urlSyncEnabled: false; savedFilters?: never; onFiltersChange?: never }
  );

export function StationsLayer({
  filters,
  savedFilters = filters,
  onFiltersChange,
  points,
  wantAzimuths,
  isPickingReceiver = false,
  onActiveMarkerChange,
  stationActions,
  popupActions,
  onRadiolineIdFromUrl,
  activePopupLocations,
  urlSyncEnabled = true,
}: StationsLayerProps) {
  const { t } = useTranslation("stationDetails");
  const { map, isLoaded } = useMap();
  const { preferences } = usePreferences();
  const { lookups } = useMapLookups();
  const queryClient = useQueryClient();
  const [linkedLocation, setLinkedLocation] = useState<MapPopupLocation | null>(null);
  const hasOpenedLinkedLocation = useRef(false);

  const { show: showPopup, followPoints, cleanup: cleanupPopup } = popupActions;
  const { openDetails: onOpenStationDetails, openUkeDetails: onOpenUkeStationDetails } = stationActions;

  function handleUrlInitialize({ filters: urlFilters, center, stationId, ukeStationId, locationId, radiolineId }: UrlInitialization) {
    if (urlFilters) onFiltersChange?.(urlFilters);
    const activeFilters = urlFilters ?? savedFilters;

    if (ukeStationId && map) {
      queryClient
        .query({ queryKey: ["uke-station", ukeStationId], queryFn: () => fetchUkeStation(ukeStationId) })
        .then((station) => {
          if (station.location?.latitude && station.location?.longitude) {
            flyToSharedTarget(map, station.location.longitude, station.location.latitude);
            onOpenUkeStationDetails(station);
          }
        })
        .catch((error) => {
          console.error("Failed to fetch shared station:", error);
          showApiError(error);
        });
    } else if (stationId && map) {
      const stationPromise =
        activeFilters.source === "uke"
          ? resolveLegacyUkeStation(stationId, center).then((ukeStation) => {
              if (ukeStation?.location?.latitude && ukeStation?.location?.longitude) {
                flyToSharedTarget(map, ukeStation.location.longitude, ukeStation.location.latitude);
                onOpenUkeStationDetails(ukeStation);
              }
            })
          : queryClient.query(stationRecordQueryOptions(Number(stationId))).then((station) => {
              if (station.location === null) return;
              flyToSharedTarget(map, station.location.longitude, station.location.latitude);
              onOpenStationDetails(station.id, "internal");
            });
      stationPromise.catch((error) => {
        if (error instanceof LegacyUkeStationLinkError) {
          toast.error(t(error.reason === "ambiguous" ? "page.ambiguousUkeStationLink" : "page.stationNotFoundTitle"));
          return;
        }
        console.error("Failed to fetch shared station:", error);
        showApiError(error);
      });
    } else if (radiolineId) onRadiolineIdFromUrl?.(radiolineId);
    else if (locationId) setLinkedLocation({ locationId, source: activeFilters.source });
  }

  useUrlSync({
    map,
    isLoaded,
    filters: savedFilters,
    enabled: urlSyncEnabled,
    onInitialize: handleUrlInitialize,
  });

  const pointsById = useMemo(() => new Map<number, MapPoint>(points.map((point) => [point.id, point])), [points]);

  useEffect(() => {
    followPoints(pointsById);
  }, [followPoints, pointsById]);

  const geoJSON = useMemo(() => {
    if (!filters.showStations && !filters.showHeatmap) return EMPTY_GEOJSON;
    return mapPointsToGeoJSON(points);
  }, [points, filters.showStations, filters.showHeatmap]);

  useEffect(() => {
    if (!map || !isLoaded) return;

    const apply = () => {
      const visibility = filters.showStations ? "visible" : "none";
      if (map.getLayer(POINT_LAYER_ID)) map.setLayoutProperty(POINT_LAYER_ID, "visibility", visibility);
      if (map.getLayer(`${POINT_LAYER_ID}-symbol`)) map.setLayoutProperty(`${POINT_LAYER_ID}-symbol`, "visibility", visibility);
    };

    apply();
    map.on("styledata", apply);
    return () => {
      map.off("styledata", apply);
    };
  }, [map, isLoaded, filters.showStations]);

  useEffect(() => {
    if (linkedLocation === null || hasOpenedLinkedLocation.current) return;

    if (linkedLocation.source === "uke") {
      if (filters.source !== "uke") return;

      const point = findPoint(pointsById, linkedLocation.locationId, "uke");
      if (point === undefined) return;

      hasOpenedLinkedLocation.current = true;
      showPopup([point.longitude, point.latitude], point, null, listRegisterStations(point), "uke");
      return;
    }

    if (!map || lookups === undefined) return;

    hasOpenedLinkedLocation.current = true;
    queryClient
      .query(locationRecordQueryOptions(linkedLocation.locationId))
      .then(async (record) => {
        const place = toMapPlace(record, lookups);
        flyToSharedTarget(map, place.longitude, place.latitude);
        await waitForMoveEnd(map);
        showPopup([place.longitude, place.latitude], place, null, null, "internal");
      })
      .catch((error) => {
        console.error("Failed to fetch shared location:", error);
        showApiError(error);
      });
  }, [linkedLocation, filters.source, pointsById, map, lookups, queryClient, showPopup]);

  function handleFeatureMouseDown(locationId: number) {
    if (isPickingReceiver || findPoint(pointsById, locationId, "internal") === undefined) return;
    void queryClient.query(locationRecordQueryOptions(locationId)).catch(() => undefined);
  }

  function handleFeatureClick({ coordinates, locationId, city, address, source }: FeatureClickData) {
    if (isPickingReceiver) return;

    const [longitude, latitude] = coordinates;
    const point = findPoint(pointsById, locationId, source);
    const place: MapPlace = point ?? { id: locationId, city: city ?? null, address: address ?? null, regionName: null, latitude, longitude };

    if (source === "uke") {
      showPopup(coordinates, place, null, point === undefined ? [] : listRegisterStations(point), source);
      return;
    }

    showPopup(coordinates, place, point === undefined || point.isUnlisted ? null : point.stations, null, source);
  }

  function handleFeatureContextMenu({ coordinates }: FeatureClickData) {
    const [longitude, latitude] = coordinates;
    onActiveMarkerChange?.({ latitude, longitude });
  }

  function renderHoverTooltip({ locationId, source }: FeatureClickData) {
    if (isPickingReceiver) return null;
    if (activePopupLocations?.some((location) => location.locationId === locationId && location.source === source)) return null;

    const point = findPoint(pointsById, locationId, source);
    if (point === undefined || point.stations.length === 0) return null;

    return <StationHoverTooltipContent point={point} />;
  }

  useMapLayer({
    map,
    isLoaded,
    geoJSON,
    onFeatureClick: handleFeatureClick,
    onFeatureContextMenu: onActiveMarkerChange ? handleFeatureContextMenu : undefined,
    onFeatureMouseDown: handleFeatureMouseDown,
    renderHoverTooltip: preferences.showMapHoverTooltip ? renderHoverTooltip : undefined,
    pointStyle: preferences.mapPointStyle,
    blockedByLayers: filters.showPlannedMeasurements ? PLANNED_PEM_BLOCKED_LAYERS : EMPTY_BLOCKED_LAYERS,
  });

  useHeatmapLayer({ map, isLoaded, enabled: filters.showHeatmap, showStations: filters.showStations });

  useAzimuthLayer({
    map,
    isLoaded,
    points,
    enabled: wantAzimuths,
    minZoom: preferences.azimuthsMinZoom,
    lineLength: preferences.azimuthLineLength,
    spread: preferences.azimuthSpread,
  });

  useEffect(() => cleanupPopup, [cleanupPopup]);

  const onActiveMarkerChangeRef = useRef(onActiveMarkerChange);
  const mapRightClickMeasureRef = useRef(preferences.mapRightClickMeasure);
  useEffect(() => {
    onActiveMarkerChangeRef.current = onActiveMarkerChange;
  }, [onActiveMarkerChange]);
  useEffect(() => {
    mapRightClickMeasureRef.current = preferences.mapRightClickMeasure;
  }, [preferences.mapRightClickMeasure]);

  useMapKeybinds(({ key }) => {
    if (key === "escape") onActiveMarkerChangeRef.current?.(null);
    return false;
  });

  useEffect(() => {
    if (!map || onActiveMarkerChange === undefined) return;

    let longPressTimer: number | null = null;
    let longPressStartPoint: { x: number; y: number } | null = null;
    let longPressLngLat: { lat: number; lng: number } | null = null;

    const clearLongPressTimer = () => {
      if (longPressTimer === null) return;
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressStartPoint = null;
      longPressLngLat = null;
    };

    const handleContextMenu = (e: MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [POINT_LAYER_ID, `${POINT_LAYER_ID}-symbol`] });
      if (features.length === 0) {
        if (mapRightClickMeasureRef.current) {
          onActiveMarkerChangeRef.current?.({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
        } else {
          onActiveMarkerChangeRef.current?.(null);
        }
      }
    };

    const handleTouchStart = (e: MapTouchEvent) => {
      if (!mapRightClickMeasureRef.current) return;
      if (e.originalEvent.touches.length !== 1) return;

      const features = map.queryRenderedFeatures(e.point, { layers: [POINT_LAYER_ID, `${POINT_LAYER_ID}-symbol`] });
      if (features.length > 0) return;

      clearLongPressTimer();
      longPressStartPoint = { x: e.point.x, y: e.point.y };
      longPressLngLat = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      longPressTimer = window.setTimeout(() => {
        const lngLat = longPressLngLat;
        clearLongPressTimer();
        if (!lngLat) return;
        e.preventDefault();
        onActiveMarkerChangeRef.current?.({ latitude: lngLat.lat, longitude: lngLat.lng });
      }, MAP_TOUCH_LONG_PRESS_MS);
    };

    const handleTouchMove = (e: MapTouchEvent) => {
      if (longPressTimer === null || longPressStartPoint === null) return;
      if (e.originalEvent.touches.length !== 1) {
        clearLongPressTimer();
        return;
      }
      const dx = e.point.x - longPressStartPoint.x;
      const dy = e.point.y - longPressStartPoint.y;
      if (Math.hypot(dx, dy) > MAP_TOUCH_MOVE_TOLERANCE_PX) clearLongPressTimer();
    };

    const handleTouchEnd = () => {
      clearLongPressTimer();
    };

    map.on("contextmenu", handleContextMenu);
    map.on("touchstart", handleTouchStart);
    map.on("touchmove", handleTouchMove);
    map.on("touchend", handleTouchEnd);
    map.on("touchcancel", handleTouchEnd);
    return () => {
      map.off("contextmenu", handleContextMenu);
      map.off("touchstart", handleTouchStart);
      map.off("touchmove", handleTouchMove);
      map.off("touchend", handleTouchEnd);
      map.off("touchcancel", handleTouchEnd);
      clearLongPressTimer();
    };
  }, [map, onActiveMarkerChange]);

  return null;
}
