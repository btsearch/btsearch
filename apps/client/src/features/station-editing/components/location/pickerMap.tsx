import { useQuery } from "@tanstack/react-query";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { type PickerLocation, pickerLocationsQueryOptions, registerLocationsQueryOptions, roundCoordinate } from "../../data/places";
import { NearbyLocationsPanel } from "./nearbyLocationsPanel";
import {
  type NearbyLocation,
  findLocationAt,
  hasStations,
  isSamePoint,
  listNearbyLocations,
  pickerLocationToMapPoint,
  toPickerGeoJSON,
} from "./pickerMapPoints";
import { RegisterStationOverlay } from "./registerStationOverlay";
import { usePickerMapLayers } from "./usePickerMapLayers";
import { MapControls, Map as MapGL, MapMarker, MarkerContent, useMap } from "@/components/ui/map";
import { PICKER_LAYER_IDS, PICKER_UKE_LAYER_IDS, POLAND_CENTER } from "@/features/map/constants";
import { useMapLookups } from "@/features/map/data/mapLookups";
import { type MapPoint, registerLocationToMapPoint } from "@/features/map/data/mapPoints";
import { useAzimuthLayer } from "@/features/map/hooks/useAzimuthLayer";
import { useMapBounds } from "@/features/map/hooks/useMapBounds";
import { attachUkeLocationToStations } from "@/features/map/utils";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettledSession } from "@/hooks/useSettledSession";
import { STAFF_ROLES } from "@/lib/auth/roles";
import type { PlacePoint } from "@/lib/geo/geocoding";
import type { UkeLocationWithPermits, UkeStation } from "@/types/station";

export type PickerMatchMode = "select" | "compare";

type PickerMapProps = {
  latitude: number | null;
  longitude: number | null;
  basePoint: PlacePoint | null;
  matchMode: PickerMatchMode | null;
  ownLocationId: number | null;
  knownLocationId: number | null;
  azimuthStationId: number | null;
  showsRegister: boolean;
  isDisabled: boolean;
  onPointSet: (point: PlacePoint) => void;
  onPlacePick: (location: PickerLocation) => void;
  onPlaceDetect: (location: PickerLocation) => void;
  onMatchChange: (location: PickerLocation | null) => void;
  onRegisterStationPick: (station: UkeStation) => void;
};

type MapView = {
  center: [number, number];
  zoom: number;
};

type PickerPanel =
  | { kind: "nearby"; point: PlacePoint; locations: NearbyLocation[] }
  | { kind: "register"; location: UkeLocationWithPermits; stations: UkeStation[] };

const NO_LOCATIONS: PickerLocation[] = [];
const NO_REGISTER_LOCATIONS: UkeLocationWithPermits[] = [];
const NO_POINTS: MapPoint[] = [];
const COUNTRY_ZOOM = 6;
const PLACE_ZOOM = 15;
const VIEW_DEBOUNCE_MS = 500;
const FLY_DURATION_MS = 1000;
const FLY_SPEED = 1.5;
const MARKER_SELECTOR = ".maplibregl-marker";

function getInitialView(latitude: number | null, longitude: number | null): MapView {
  if (latitude === null || longitude === null) return { center: POLAND_CENTER, zoom: COUNTRY_ZOOM };
  return { center: [longitude, latitude], zoom: PLACE_ZOOM };
}

function toPointKey(point: PlacePoint): string {
  return `${roundCoordinate(point.latitude)},${roundCoordinate(point.longitude)}`;
}

function isMarkerClick(event: MapMouseEvent): boolean {
  const { target } = event.originalEvent;
  return target instanceof Element && target.closest(MARKER_SELECTOR) !== null;
}

function findClickedId(map: MapLibreMap, event: MapMouseEvent, layerIds: readonly string[]): number | null {
  const [feature] = map.queryRenderedFeatures(event.point, { layers: [...layerIds] });
  const locationId: unknown = feature?.properties?.locationId;
  return typeof locationId === "number" ? locationId : null;
}

function hasSize(element: HTMLElement): boolean {
  return element.clientWidth > 0 && element.clientHeight > 0;
}

function fitCanvasToContainer(map: MapLibreMap): void {
  const container = map.getContainer();
  const canvas = map.getCanvas();
  if (canvas.clientWidth !== container.clientWidth || canvas.clientHeight !== container.clientHeight) map.resize();
}

function ChosenPointMarker() {
  return (
    <div className="relative flex items-center justify-center">
      <span className="absolute h-7 w-7 rounded-full bg-foreground/20 animate-ping motion-reduce:animate-none" />
      <span className="absolute h-5 w-5 rounded-full bg-foreground/10" />
      <div className="relative h-4 w-4 rounded-full border-[3px] border-foreground bg-background shadow-lg" />
    </div>
  );
}

function BasePointMarker() {
  return (
    <div className="relative flex items-center justify-center">
      <div className="h-3.5 w-3.5 rounded-full bg-red-500 border-2 border-white shadow-md" />
    </div>
  );
}

function PickerMapContent({
  latitude,
  longitude,
  basePoint,
  matchMode,
  ownLocationId,
  knownLocationId,
  azimuthStationId,
  showsRegister,
  isDisabled,
  onPointSet,
  onPlacePick,
  onPlaceDetect,
  onMatchChange,
  onRegisterStationPick,
}: PickerMapProps) {
  const { map, isLoaded } = useMap();
  const { bounds, bbox, zoom } = useMapBounds({ map, isLoaded, debounceMs: VIEW_DEBOUNCE_MS });
  const { preferences } = usePreferences();
  const { lookups } = useMapLookups();
  const { data: session } = useSettledSession();
  const [panel, setPanel] = useState<PickerPanel | null>(null);
  const mapPointRef = useRef<PlacePoint | null>(null);
  const handledPointRef = useRef<string | null>(null);
  const hasTouchedMapRef = useRef(false);

  const role = session?.user?.role;
  const isStaff = typeof role === "string" && STAFF_ROLES.has(role);
  const showsAzimuths = azimuthStationId !== null && preferences.showAzimuths && zoom >= preferences.azimuthsMinZoom;

  const { data: locations = NO_LOCATIONS } = useQuery(pickerLocationsQueryOptions(bbox, isStaff, showsAzimuths));
  const { data: registerLocations = NO_REGISTER_LOCATIONS } = useQuery({
    ...registerLocationsQueryOptions(bounds, showsAzimuths),
    enabled: showsRegister,
  });

  const placePoints = useMemo(
    () => (lookups === undefined ? NO_POINTS : locations.map((location) => pickerLocationToMapPoint(location, lookups))),
    [locations, lookups],
  );
  const registerPoints = useMemo(
    () => (lookups === undefined ? NO_POINTS : registerLocations.map((location) => registerLocationToMapPoint(location, lookups))),
    [registerLocations, lookups],
  );
  const places = useMemo(() => toPickerGeoJSON(placePoints), [placePoints]);
  const registerPlaces = useMemo(() => toPickerGeoJSON(registerPoints.filter(hasStations)), [registerPoints]);
  const azimuthPoints = useMemo(() => {
    const stationPoints = placePoints.flatMap((placePoint) => {
      const station = placePoint.stations.find((candidate) => candidate.id === azimuthStationId);
      return station === undefined ? [] : [{ ...placePoint, stations: [station] }];
    });
    return showsRegister ? [...stationPoints, ...registerPoints] : stationPoints;
  }, [azimuthStationId, placePoints, registerPoints, showsRegister]);
  const matched = useMemo(
    () => findLocationAt(locations, latitude === null || longitude === null ? null : { latitude, longitude }),
    [locations, latitude, longitude],
  );

  usePickerMapLayers({ map, isLoaded, places, registerPlaces, showsRegister });
  useAzimuthLayer({
    map,
    isLoaded,
    points: azimuthPoints,
    enabled: showsAzimuths,
    minZoom: preferences.azimuthsMinZoom,
    lineLength: preferences.azimuthLineLength,
    spread: preferences.azimuthSpread,
  });

  function setPointFromMap(point: PlacePoint) {
    const roundedPoint = { latitude: roundCoordinate(point.latitude), longitude: roundCoordinate(point.longitude) };
    hasTouchedMapRef.current = true;
    mapPointRef.current = roundedPoint;
    onPointSet(roundedPoint);
  }

  function pickFromMap(location: PickerLocation) {
    hasTouchedMapRef.current = true;
    mapPointRef.current = { latitude: location.latitude, longitude: location.longitude };
    handledPointRef.current = toPointKey(location);
    onPlacePick(location);
  }

  const reportMatch = useEffectEvent(onMatchChange);
  const detectPlace = useEffectEvent(onPlaceDetect);
  const adoptMatch = useEffectEvent((location: PickerLocation) => {
    if (!hasTouchedMapRef.current && (matchMode !== "select" || location.id === ownLocationId)) return;
    onPlacePick(location);
  });
  const handleMapClick = useEffectEvent((event: MapMouseEvent) => {
    if (map === null || isDisabled || isMarkerClick(event)) return;

    const placeId = findClickedId(map, event, PICKER_LAYER_IDS);
    if (placeId !== null) {
      const location = locations.find((candidate) => candidate.id === placeId);
      if (location === undefined) return;
      pickFromMap(location);
      setPanel(null);
      return;
    }

    const registerId = showsRegister ? findClickedId(map, event, PICKER_UKE_LAYER_IDS) : null;
    if (registerId !== null) {
      const location = registerLocations.find((candidate) => candidate.id === registerId);
      if (location !== undefined) setPanel({ kind: "register", location, stations: attachUkeLocationToStations(location.stations, location) });
      return;
    }

    const point = { latitude: event.lngLat.lat, longitude: event.lngLat.lng };
    const nearbyLocations = listNearbyLocations(point, locations);
    if (nearbyLocations.length > 0) {
      setPanel({ kind: "nearby", point, locations: nearbyLocations });
      return;
    }
    setPointFromMap(point);
    setPanel(null);
  });

  useEffect(() => {
    if (map === null || !isLoaded) return;

    const onClick = (event: MapMouseEvent) => handleMapClick(event);
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, isLoaded]);

  useEffect(() => {
    if (map === null || latitude === null || longitude === null) return;

    const mapPoint = mapPointRef.current;
    mapPointRef.current = null;
    if (mapPoint !== null && isSamePoint(mapPoint, { latitude, longitude })) return;

    map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), PLACE_ZOOM), duration: FLY_DURATION_MS, speed: FLY_SPEED });
  }, [map, latitude, longitude]);

  useEffect(() => {
    reportMatch(matched);
  }, [matched]);

  useEffect(() => {
    const pointKey = latitude === null || longitude === null ? null : toPointKey({ latitude, longitude });
    if (handledPointRef.current === pointKey) return;

    handledPointRef.current = matched === null ? null : pointKey;
    if (matched !== null) adoptMatch(matched);
  }, [matched, latitude, longitude]);

  useEffect(() => {
    if (matched !== null && matched.id !== knownLocationId) detectPlace(matched);
  }, [matched, knownLocationId]);

  const shownPanel = isDisabled ? null : panel;

  return (
    <>
      {basePoint === null ? null : (
        <MapMarker longitude={basePoint.longitude} latitude={basePoint.latitude}>
          <MarkerContent>
            <BasePointMarker />
          </MarkerContent>
        </MapMarker>
      )}
      {latitude === null || longitude === null ? null : (
        <MapMarker
          longitude={longitude}
          latitude={latitude}
          draggable={!isDisabled}
          onDragEnd={(lngLat) => setPointFromMap({ latitude: lngLat.lat, longitude: lngLat.lng })}
        >
          <MarkerContent>
            <ChosenPointMarker />
          </MarkerContent>
        </MapMarker>
      )}
      {shownPanel?.kind === "nearby" ? (
        <NearbyLocationsPanel
          point={shownPanel.point}
          locations={shownPanel.locations}
          onLocationPick={(location) => {
            pickFromMap(location);
            setPanel(null);
          }}
          onNewLocation={() => {
            setPointFromMap(shownPanel.point);
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {shownPanel?.kind === "register" ? (
        <RegisterStationOverlay
          location={shownPanel.location}
          stations={shownPanel.stations}
          onStationPick={(station) => {
            onRegisterStationPick(station);
            setPanel(null);
          }}
        />
      ) : null}
    </>
  );
}

function MapSizeWatch() {
  const { map } = useMap();

  useEffect(() => {
    if (map === null) return;

    const container = map.getContainer();
    let wasShown = hasSize(container);
    const observer = new ResizeObserver(() => {
      const isShown = hasSize(container);
      if (isShown && !wasShown) fitCanvasToContainer(map);
      wasShown = isShown;
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  return null;
}

export function PickerMap(props: PickerMapProps) {
  const [initialView] = useState(() => getInitialView(props.latitude, props.longitude));

  return (
    <MapGL center={initialView.center} zoom={initialView.zoom}>
      <PickerMapContent {...props} />
      <MapControls showZoom showLocate position="bottom-right" />
      <MapSizeWatch />
    </MapGL>
  );
}
