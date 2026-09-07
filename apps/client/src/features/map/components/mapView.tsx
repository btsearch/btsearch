import { useQuery } from "@tanstack/react-query";
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Map as LibreMap, MapControls, MapMarker, MarkerContent, useMap } from "@/components/ui/map";
import { useFloatingDialogStack } from "@/features/station-details/components/floatingDialogStackProvider";
import ZabkaIcon from "@/features/station-details/components/logos/zabka.svg?react";
import { useTerrainProfileController } from "@/features/terrain-profile/hooks/useTerrainProfileController";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { authClient } from "@/lib/auth/client";
import { isNsgStationsQueryScope } from "@/lib/nsg/stationQuery";
import type { LocationInfo, StationFilters, UkeLocationWithPermits, UkeStation } from "@/types/station";

import { fetchLocations, fetchRadioLines } from "../api";
import { FLOATING_NAV_MAP_OFFSET_CLASS, POLAND_BOUNDS, POLAND_CENTER } from "../constants";
import { useMapBounds } from "../hooks/useMapBounds";
import { useMapKeybinds } from "../hooks/useMapKeybinds";
import { loadMapPosition, useMapPositionPersistence } from "../hooks/useMapPositionPersistence";
import { useMapQueryHousekeeping } from "../hooks/useMapQueryHousekeeping";
import { useStationPopupActions } from "../hooks/useStationPopupActions";
import { useWakeLock } from "../hooks/useWakeLock";
import type { SearchStation, UkeSearchPermitStation, UkeSearchRadioline } from "../searchApi";
import { attachUkeLocationToStations } from "../utils";
import { MapSearchOverlay } from "./search-overlay";
import { DEFAULT_FILTERS, StationsLayer, loadMapFilters, saveMapFilters } from "./stationsLayer";

const RadioLinesLayer = lazy(() => import("./radioLinesLayer"));
const TerrainProfileSurface = lazy(() => import("@/features/terrain-profile/components/terrainProfileSurface"));

const ZABKA_EASTER_EGG_SEQUENCE = "ZABKA";
const ZABKA_EASTER_EGG_TIMEOUT_MS = 3000;
const MAP_QUERY_FAMILIES = new Set(["locations", "radiolines"]);

function isMainMapQuery(queryKey: readonly unknown[]): boolean {
  return !isNsgStationsQueryScope(queryKey.at(-1));
}

function MapViewInner() {
  useWakeLock();
  const { map, isLoaded } = useMap();
  useMapPositionPersistence({ map, isLoaded });
  const { bounds, zoom, isMoving } = useMapBounds({ map, isLoaded });
  const { preferences } = usePreferences();
  const { data: runtimeSettings } = useSettings();
  const { data: session } = authClient.useSession();
  const showAddToList = !!session?.user && !!runtimeSettings?.enableUserLists;
  const [filters, setFiltersState] = useState<StationFilters>(() => loadMapFilters() ?? DEFAULT_FILTERS);
  const [activeMarker, setActiveMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapQuery, setMapQuery] = useState<string | undefined>(undefined);
  const [useZabkaMarkers, setUseZabkaMarkers] = useState(false);
  const zabkaSequenceRef = useRef("");
  const zabkaLastKeyAtRef = useRef(0);

  const setFilters = useCallback((update: StationFilters | ((prev: StationFilters) => StationFilters)) => {
    setFiltersState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      saveMapFilters(next);
      return next;
    });
  }, []);

  useMapKeybinds(
    ({ altKey, code, ctrlKey, metaKey, shiftKey }) => {
      if (!shiftKey || ctrlKey || metaKey || altKey || !code.startsWith("Key")) {
        zabkaSequenceRef.current = "";
        return false;
      }

      const now = Date.now();
      if (now - zabkaLastKeyAtRef.current > ZABKA_EASTER_EGG_TIMEOUT_MS) zabkaSequenceRef.current = "";
      zabkaLastKeyAtRef.current = now;

      zabkaSequenceRef.current = `${zabkaSequenceRef.current}${code.slice(3)}`.slice(-ZABKA_EASTER_EGG_SEQUENCE.length);
      if (zabkaSequenceRef.current !== ZABKA_EASTER_EGG_SEQUENCE) return false;

      zabkaSequenceRef.current = "";
      setUseZabkaMarkers((prev) => !prev);
      return true;
    },
    { includeModifiedKeys: true },
  );

  const terrainProfile = useTerrainProfileController({ map, isLoaded });

  const [pendingRadiolineId, setPendingRadiolineId] = useState<number | null>(null);
  const { setTerrainProfileStartHandler } = useFloatingDialogStack();

  useEffect(() => {
    setTerrainProfileStartHandler(terrainProfile.start);
    return () => setTerrainProfileStartHandler(null);
  }, [setTerrainProfileStartHandler, terrainProfile.start]);

  const { showPopup, openLocations, closePopups, popupActions, stationActions } = useStationPopupActions({
    map,
    showAddToList,
    allowMultipleMapPopups: preferences.allowMultipleMapPopups,
    closeMapPopupsOnMapClick: preferences.closeMapPopupsOnMapClick,
    detailsFilters: filters,
  });

  useEffect(() => {
    closePopups((location) => location.source !== filters.source);
  }, [filters.source, closePopups]);

  const wantAzimuths = preferences.showAzimuths && zoom >= preferences.azimuthsMinZoom;
  const effectiveMapQuery = filters.source === "internal" ? mapQuery : undefined;
  useMapQueryHousekeeping({ bounds, isMoving, queryFamilies: MAP_QUERY_FAMILIES, isInScope: isMainMapQuery });

  const { data: locationsResponse } = useQuery({
    queryKey: ["locations", bounds, filters, preferences.mapStationsLimit, wantAzimuths, effectiveMapQuery],
    queryFn: ({ signal }) =>
      fetchLocations(bounds, filters, preferences.mapStationsLimit, {
        azimuths: wantAzimuths,
        q: effectiveMapQuery,
        signal,
      }),
    enabled: isLoaded && !!bounds && !isMoving,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60,
    placeholderData: (prev) => prev,
  });

  const locations = useMemo(() => locationsResponse?.data ?? [], [locationsResponse]);
  const locationsRef = useRef(locations);
  useLayoutEffect(() => {
    locationsRef.current = locations;
  });
  const locationCount = locations.length;
  const totalCount = locationsResponse?.totalCount ?? 0;

  const { data: radioLinesResponse, isFetching: isRadioLinesFetching } = useQuery({
    queryKey: ["radiolines", bounds, filters.radiolineOperators, filters.recentDays, preferences.mapRadiolinesLimit],
    queryFn: ({ signal }) =>
      fetchRadioLines(bounds, {
        signal,
        operatorIds: filters.radiolineOperators,
        limit: preferences.mapRadiolinesLimit,
        recentDays: filters.recentDays,
      }),
    enabled: filters.showRadiolines && !!bounds && !isMoving && zoom >= preferences.radiolinesMinZoom,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60,
    placeholderData: (prev) => prev,
  });

  const radioLines = radioLinesResponse?.data ?? [];
  const radioLineCount = radioLines.length;
  const radioLineTotalCount = radioLinesResponse?.totalCount ?? 0;

  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);

  const handleLocationSelect = useCallback(
    (lat: number, lng: number) => {
      map?.flyTo({ center: [lng, lat], zoom: 15, essential: true, speed: 1.5 });
      setSelectedLocation({ lat, lng });
    },
    [map],
  );

  const showSelectedDot =
    selectedLocation !== null &&
    !locations.some((loc) => Math.abs(loc.latitude - selectedLocation.lat) < 0.0001 && Math.abs(loc.longitude - selectedLocation.lng) < 0.0001);

  const filtersRef = useRef(filters);
  useLayoutEffect(() => {
    filtersRef.current = filters;
  });

  const handleStationSelect = useCallback(
    async (station: SearchStation) => {
      if (!map) return;

      const stationLocation = station.location;
      if (!stationLocation) return;
      const { latitude: lat, longitude: lng } = stationLocation;

      map.flyTo({ center: [lng, lat], zoom: 16, essential: true, speed: 1.5 });

      await new Promise<void>((resolve) => map.once("moveend", () => resolve()));

      const currentFilters = filtersRef.current;
      if (currentFilters.source === "uke") {
        const ukeLocations = locationsRef.current as unknown as UkeLocationWithPermits[];
        const ukeLocation = ukeLocations.find((loc) => loc.latitude.toFixed(6) === lat.toFixed(6) && loc.longitude.toFixed(6) === lng.toFixed(6));
        if (!ukeLocation) return;

        const location: LocationInfo = {
          id: ukeLocation.id,
          city: ukeLocation.city ?? stationLocation.city ?? undefined,
          address: ukeLocation.address ?? stationLocation.address ?? undefined,
          region: ukeLocation.region?.name ?? stationLocation.region.name,
          latitude: lat,
          longitude: lng,
        };
        showPopup([lng, lat], location, null, attachUkeLocationToStations(ukeLocation.stations ?? [], ukeLocation), currentFilters.source);
        return;
      }

      const locationInfo: LocationInfo = {
        id: stationLocation.id,
        city: stationLocation.city ?? undefined,
        address: stationLocation.address ?? undefined,
        region: stationLocation.region.name,
        latitude: lat,
        longitude: lng,
      };
      showPopup([lng, lat], locationInfo, null, null, currentFilters.source);
    },
    [map, showPopup],
  );

  const handleActiveMarkerClear = useCallback(() => setActiveMarker(null), []);
  const handleToggleHeatmap = useCallback(() => setFilters((prev) => ({ ...prev, showHeatmap: !prev.showHeatmap })), [setFilters]);
  const handleTogglePlannedMeasurements = useCallback(
    () => setFilters((prev) => ({ ...prev, showPlannedMeasurements: !prev.showPlannedMeasurements })),
    [setFilters],
  );
  const handleUkeStationSelectFromSearch = useCallback(
    async (station: UkeSearchPermitStation) => {
      if (!map || !station.location) return;
      const { latitude: lat, longitude: lng } = station.location;
      map.flyTo({ center: [lng, lat], zoom: 16, essential: true, speed: 1.5 });
      await new Promise<void>((resolve) => map.once("moveend", () => resolve()));
      const location: LocationInfo = {
        id: station.location.id,
        city: station.location.city ?? undefined,
        address: station.location.address ?? undefined,
        latitude: lat,
        longitude: lng,
      };
      const popupStation: UkeStation = {
        id: station.id,
        station_id: station.station_id,
        operator: station.operator,
        permits: station.permits,
      };
      showPopup([lng, lat], location, null, [popupStation], "uke");
    },
    [map, showPopup],
  );

  const handleRadiolineSelectFromSearch = useCallback(
    (radioline: UkeSearchRadioline) => {
      handleLocationSelect(radioline.tx.latitude, radioline.tx.longitude);
      setPendingRadiolineId(radioline.id);
    },
    [handleLocationSelect],
  );

  return (
    <>
      <MapSearchOverlay
        locationCount={locationCount}
        totalCount={totalCount}
        radioLineCount={filters.showRadiolines ? radioLineCount : 0}
        radioLineTotalCount={filters.showRadiolines ? radioLineTotalCount : 0}
        isRadioLinesFetching={filters.showRadiolines && isRadioLinesFetching}
        filters={filters}
        zoom={zoom}
        activeMarker={activeMarker}
        onActiveMarkerClear={handleActiveMarkerClear}
        onFiltersChange={setFilters}
        onLocationSelect={handleLocationSelect}
        onStationSelect={handleStationSelect}
        onUkeStationSelect={handleUkeStationSelectFromSearch}
        onRadiolineSelect={handleRadiolineSelectFromSearch}
        showHeatmap={filters.showHeatmap}
        onToggleHeatmap={handleToggleHeatmap}
        showPlannedMeasurements={filters.showPlannedMeasurements}
        onTogglePlannedMeasurements={handleTogglePlannedMeasurements}
        onFilterQueryChange={setMapQuery}
      />
      {showSelectedDot && selectedLocation && (
        <MapMarker longitude={selectedLocation.lng} latitude={selectedLocation.lat}>
          <MarkerContent>
            {useZabkaMarkers ? (
              <ZabkaIcon className="h-5 w-auto drop-shadow-md" />
            ) : (
              <div className="relative flex items-center justify-center">
                <div className="absolute h-5 w-5 animate-ping rounded-full bg-blue-500/40" />
                <div className="relative h-3 w-3 rounded-full border-2 border-white bg-blue-500 shadow-md" />
              </div>
            )}
          </MarkerContent>
        </MapMarker>
      )}
      <StationsLayer
        filters={filters}
        onFiltersChange={setFilters}
        locationsResponse={locationsResponse}
        zoom={zoom}
        onActiveMarkerChange={setActiveMarker}
        stationActions={stationActions}
        popupActions={popupActions}
        onRadiolineIdFromUrl={setPendingRadiolineId}
        activePopupLocations={openLocations}
        useZabkaMarkers={useZabkaMarkers}
      />
      {filters.showRadiolines || !!pendingRadiolineId ? (
        <Suspense fallback={null}>
          <RadioLinesLayer
            radioLines={radioLines}
            pendingRadiolineId={pendingRadiolineId}
            showAddToList={showAddToList}
            onPendingRadiolineConsumed={setPendingRadiolineId}
          />
        </Suspense>
      ) : null}
      <MapControls showLocate showCompass showScale showFullscreen />
      {terrainProfile.isOpen && terrainProfile.receiver && (
        <MapMarker
          draggable
          longitude={terrainProfile.receiver.longitude}
          latitude={terrainProfile.receiver.latitude}
          onDragEnd={terrainProfile.handleReceiverDragEnd}
        >
          <MarkerContent>
            <div className="relative flex items-center justify-center">
              <div className="absolute h-5 w-5 animate-ping rounded-full bg-sky-500/30" />
              <div className="relative h-3.5 w-3.5 rounded-full border-2 border-white bg-sky-500 shadow-md" />
            </div>
          </MarkerContent>
        </MapMarker>
      )}
      {terrainProfile.isOpen && (
        <Suspense fallback={null}>
          <TerrainProfileSurface
            analysis={terrainProfile.analysis}
            station={terrainProfile.station}
            receiver={terrainProfile.receiver}
            antennaKey={terrainProfile.antennaKey}
            isWorking={terrainProfile.isWorking}
            isLocating={terrainProfile.isLocating}
            gpsError={terrainProfile.gpsError}
            error={terrainProfile.error}
            onClose={terrainProfile.close}
            onRetry={terrainProfile.retry}
            onUseCurrentLocation={terrainProfile.useCurrentLocation}
            onReceiverHeightChange={terrainProfile.setReceiverHeight}
            onAntennaChange={terrainProfile.setAntenna}
            onHoverSample={terrainProfile.setHoveredSample}
          />
        </Suspense>
      )}
    </>
  );
}

export default function MapView() {
  const [saved] = useState(() => loadMapPosition());
  const { preferences } = usePreferences();

  return (
    <LibreMap
      center={saved?.center ?? POLAND_CENTER}
      zoom={saved?.zoom ?? 7}
      maxBounds={POLAND_BOUNDS}
      minZoom={5}
      className={preferences.navMode === "floating" ? FLOATING_NAV_MAP_OFFSET_CLASS : undefined}
    >
      <MapViewInner />
    </LibreMap>
  );
}
