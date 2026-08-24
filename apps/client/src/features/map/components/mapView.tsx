import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Map as LibreMap, MapControls, MapMarker, MarkerContent, useMap } from "@/components/ui/map";
import { useFloatingDialogStack } from "@/features/station-details/components/floatingDialogStackProvider";
import ZabkaIcon from "@/features/station-details/components/logos/zabka.svg?react";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { authClient } from "@/lib/authClient";
import type { LocationInfo, Station, StationFilters, StationSource, UkeLocationWithPermits, UkeStation } from "@/types/station";

import { fetchLocations, fetchRadioLines } from "../api";
import { FLOATING_NAV_MAP_OFFSET_CLASS, POLAND_BOUNDS, POLAND_CENTER } from "../constants";
import { useTerrainProfileController } from "@/features/terrain-profile/hooks/useTerrainProfileController";

import { useMapBounds } from "../hooks/useMapBounds";
import { useMapPopup } from "../hooks/useMapPopup";
import { useWakeLock } from "../hooks/useWakeLock";
import type { UkeSearchPermitStation, UkeSearchRadioline } from "../searchApi";
import { attachUkeLocationToStations } from "../utils";
import { MapSearchOverlay } from "./search-overlay";
import { DEFAULT_FILTERS, StationsLayer, loadMapFilters, saveMapFilters } from "./stationsLayer";

const RadioLinesLayer = lazy(() => import("./radioLinesLayer"));
const TerrainProfileSurface = lazy(() => import("@/features/terrain-profile/components/terrainProfileSurface"));

const MAP_POSITION_KEY = "map:position";
const ZABKA_EASTER_EGG_SEQUENCE = "ZABKA";
const ZABKA_EASTER_EGG_TIMEOUT_MS = 3000;
type SavedMapPosition = { center: [number, number]; zoom: number };

function loadMapPosition(): SavedMapPosition | null {
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

function saveMapPosition(center: [number, number], zoom: number) {
  try {
    localStorage.setItem(MAP_POSITION_KEY, JSON.stringify({ center, zoom }));
  } catch {}
}

function MapViewInner() {
  useWakeLock();
  const { map, isLoaded } = useMap();
  const { bounds, zoom, isMoving } = useMapBounds({ map, isLoaded });
  const { preferences } = usePreferences();
  const { data: runtimeSettings } = useSettings();
  const { data: session } = authClient.useSession();
  const showAddToList = !!session?.user && !!runtimeSettings?.enableUserLists;
  const [filters, setFiltersState] = useState<StationFilters>(() => loadMapFilters() ?? DEFAULT_FILTERS);
  const [activeMarker, setActiveMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapQuery, setMapQuery] = useState<string | undefined>(undefined);
  const [useZabkaMarkers, setUseZabkaMarkers] = useState(false);

  const handleFilterQueryChange = useCallback((q: string | undefined) => {
    setMapQuery((prev) => (prev === q ? prev : q));
  }, []);

  const setFilters = useCallback((update: StationFilters | ((prev: StationFilters) => StationFilters)) => {
    setFiltersState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      saveMapFilters(next);
      return next;
    });
  }, []);

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

  useEffect(() => {
    let sequence = "";
    let lastKeyAt = 0;

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || !event.code.startsWith("Key")) {
        sequence = "";
        return;
      }

      const now = Date.now();
      if (now - lastKeyAt > ZABKA_EASTER_EGG_TIMEOUT_MS) sequence = "";
      lastKeyAt = now;

      sequence = `${sequence}${event.code.slice(3)}`.slice(-ZABKA_EASTER_EGG_SEQUENCE.length);
      if (sequence !== ZABKA_EASTER_EGG_SEQUENCE) return;

      event.preventDefault();
      sequence = "";
      setUseZabkaMarkers((prev) => !prev);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const terrainProfile = useTerrainProfileController({ map, isLoaded });

  const [pendingRadiolineId, setPendingRadiolineId] = useState<number | null>(null);
  const { openStationDialog, openUkePermitDialog } = useFloatingDialogStack();

  const handleOpenStationDetails = useCallback((id: number, source: StationSource) => openStationDialog(id, source), [openStationDialog]);
  const handleOpenUkeStationDetails = useCallback((station: UkeStation) => openUkePermitDialog(station), [openUkePermitDialog]);

  const {
    showPopup,
    openLocations,
    closePopups,
    cleanup: cleanupPopup,
  } = useMapPopup({
    map,
    showAddToList,
    allowMultipleMapPopups: preferences.allowMultipleMapPopups,
    closeMapPopupsOnMapClick: preferences.closeMapPopupsOnMapClick,
    detailsFilters: filters,
    onOpenStationDetails: handleOpenStationDetails,
    onOpenUkeStationDetails: handleOpenUkeStationDetails,
    onStartTerrainProfile: terrainProfile.start,
  });

  useEffect(() => {
    closePopups((location) => location.source !== filters.source);
  }, [filters.source, closePopups]);

  const wantAzimuths = preferences.showAzimuths && zoom >= preferences.azimuthsMinZoom;
  const effectiveMapQuery = filters.source === "internal" ? mapQuery : undefined;
  const queryClient = useQueryClient();

  const {
    data: locationsResponse,
    isLoading,
    isFetching,
  } = useQuery({
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

  useEffect(() => {
    if (!isMoving || !bounds) return;
    void queryClient.cancelQueries({
      predicate: (query) => (query.queryKey[0] === "locations" || query.queryKey[0] === "radiolines") && query.queryKey[1] === bounds,
    });
  }, [bounds, isMoving, queryClient]);

  useEffect(() => {
    if (!bounds) return;
    queryClient.removeQueries({
      predicate: (query) =>
        (query.queryKey[0] === "locations" || query.queryKey[0] === "radiolines") &&
        typeof query.queryKey[1] === "string" &&
        query.queryKey[1].includes(",") &&
        query.queryKey[1] !== bounds &&
        query.getObserversCount() === 0,
    });
  }, [bounds, queryClient]);

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
    async (station: Station) => {
      if (!map) return;

      const lat = station.location?.latitude;
      const lng = station.location?.longitude;
      if (!lat || !lng) return;

      map.flyTo({ center: [lng, lat], zoom: 16, essential: true, speed: 1.5 });

      await new Promise<void>((resolve) => map.once("moveend", () => resolve()));

      const currentFilters = filtersRef.current;
      if (currentFilters.source === "uke") {
        const ukeLocations = locationsRef.current as unknown as UkeLocationWithPermits[];
        const ukeLocation = ukeLocations.find((loc) => loc.latitude.toFixed(6) === lat.toFixed(6) && loc.longitude.toFixed(6) === lng.toFixed(6));
        if (!ukeLocation) return;

        const location: LocationInfo = {
          id: ukeLocation.id,
          city: ukeLocation.city ?? station.location?.city,
          address: ukeLocation.address ?? station.location?.address,
          region: ukeLocation.region?.name ?? station.location?.region?.name,
          latitude: lat,
          longitude: lng,
        };
        showPopup([lng, lat], location, null, attachUkeLocationToStations(ukeLocation.stations ?? [], ukeLocation), currentFilters.source);
        return;
      }

      const location: LocationInfo = {
        id: station.location?.id,
        city: station.location?.city,
        address: station.location?.address,
        region: station.location?.region?.name,
        latitude: lat,
        longitude: lng,
      };
      showPopup([lng, lat], location, null, null, currentFilters.source);
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
        address: undefined,
        latitude: lat,
        longitude: lng,
      };
      showPopup([lng, lat], location, null, [station], "uke");
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

  const popupActions = useMemo(() => ({ show: showPopup, cleanup: cleanupPopup }), [showPopup, cleanupPopup]);

  const stationActions = useMemo(
    () => ({
      openDetails: handleOpenStationDetails,
      openUkeDetails: handleOpenUkeStationDetails,
    }),
    [handleOpenStationDetails, handleOpenUkeStationDetails],
  );

  return (
    <>
      <MapSearchOverlay
        locationCount={locationCount}
        totalCount={totalCount}
        radioLineCount={filters.showRadiolines ? radioLineCount : 0}
        radioLineTotalCount={filters.showRadiolines ? radioLineTotalCount : 0}
        isRadioLinesFetching={filters.showRadiolines && isRadioLinesFetching}
        isLoading={isLoading}
        isFetching={isFetching}
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
        onFilterQueryChange={handleFilterQueryChange}
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
