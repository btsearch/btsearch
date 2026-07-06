import { useQuery } from "@tanstack/react-query";
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Map as LibreMap, MapControls, MapMarker, MarkerContent, useMap } from "@/components/ui/map";
import ZabkaIcon from "@/features/station-details/components/logos/zabka.svg?react";
import { useStationDialogStack } from "@/features/station-details/components/stationDialogStackProvider";
import { useUkePermitDialogStack } from "@/features/station-details/components/ukePermitDialogStackProvider";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { showApiError } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import type { LocationInfo, Station, StationFilters, StationSource, StationWithoutCells, UkeLocationWithPermits, UkeStation } from "@/types/station";

import { fetchLocationWithStations, fetchLocations, fetchRadioLines } from "../api";
import { FLOATING_NAV_MAP_OFFSET_CLASS, POLAND_BOUNDS, POLAND_CENTER } from "../constants";
import { useMapBounds } from "../hooks/useMapBounds";
import { useMapPopup } from "../hooks/useMapPopup";
import { useWakeLock } from "../hooks/useWakeLock";
import type { UkeSearchPermitStation, UkeSearchRadioline } from "../searchApi";
import { attachUkeLocationToStations, toLocationInfo } from "../utils";
import { MapSearchOverlay } from "./search-overlay";
import { DEFAULT_FILTERS, StationsLayer, loadMapFilters, locationQueryKey, saveMapFilters } from "./stationsLayer";

const RadioLinesLayer = lazy(() => import("./radioLinesLayer"));

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
  const [activePopupLocation, setActivePopupLocation] = useState<{ locationId: number; source: StationSource } | null>(null);
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

  const handlePopupClose = useCallback(() => {
    setActivePopupLocation(null);
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

  const [pendingRadiolineId, setPendingRadiolineId] = useState<number | null>(null);
  const { openStationDialog } = useStationDialogStack();
  const { openUkePermitDialog } = useUkePermitDialogStack();

  const handleOpenStationDetails = useCallback((id: number, source: StationSource) => openStationDialog(id, source), [openStationDialog]);
  const handleOpenUkeStationDetails = useCallback((station: UkeStation) => openUkePermitDialog(station), [openUkePermitDialog]);

  const {
    showPopup,
    updatePopupStations,
    cleanup: cleanupPopup,
  } = useMapPopup({
    map,
    showAddToList,
    onOpenStationDetails: handleOpenStationDetails,
    onOpenUkeStationDetails: handleOpenUkeStationDetails,
    onClose: handlePopupClose,
  });

  const wantAzimuths = preferences.showAzimuths && zoom >= preferences.azimuthsMinZoom;
  const effectiveMapQuery = filters.source === "internal" ? mapQuery : undefined;

  const {
    data: locationsResponse,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["locations", bounds, filters, preferences.mapStationsLimit, wantAzimuths, effectiveMapQuery],
    queryFn: () =>
      fetchLocations(bounds, filters, preferences.mapStationsLimit, {
        azimuths: wantAzimuths,
        q: effectiveMapQuery,
      }),
    enabled: isLoaded && !!bounds && !isMoving,
    staleTime: 1000 * 60 * 2,
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
    placeholderData: (prev) => prev,
  });

  const radioLines = radioLinesResponse?.data ?? [];
  const radioLineCount = radioLines.length;
  const radioLineTotalCount = radioLinesResponse?.totalCount ?? 0;

  const { data: popupLocationData } = useQuery({
    queryKey: locationQueryKey(activePopupLocation?.locationId ?? 0, filters),
    queryFn: () => fetchLocationWithStations(activePopupLocation?.locationId ?? 0, filters),
    enabled: !!activePopupLocation && activePopupLocation.source !== "uke",
    staleTime: 1000 * 60 * 2,
    throwOnError: (error) => {
      showApiError(error);
      return false;
    },
  });

  useEffect(() => {
    if (!popupLocationData || !activePopupLocation || activePopupLocation.source === "uke") return;
    if (popupLocationData.id !== activePopupLocation.locationId) return;
    updatePopupStations(toLocationInfo(popupLocationData), popupLocationData.stations as StationWithoutCells[], activePopupLocation.source);
  }, [popupLocationData, activePopupLocation, updatePopupStations]);

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

        const location: LocationInfo = {
          id: ukeLocation?.id ?? station.id,
          city: ukeLocation?.city ?? station.location?.city,
          address: ukeLocation?.address ?? station.location?.address,
          region: ukeLocation?.region?.name ?? station.location?.region?.name,
          latitude: lat,
          longitude: lng,
        };
        showPopup([lng, lat], location, null, attachUkeLocationToStations(ukeLocation?.stations ?? [], ukeLocation), currentFilters.source);
        setActivePopupLocation({ locationId: ukeLocation?.id ?? station.id, source: currentFilters.source });
        return;
      }

      const locationId = station.location?.id;
      const location: LocationInfo = {
        id: locationId,
        city: station.location?.city,
        address: station.location?.address,
        region: station.location?.region?.name,
        latitude: lat,
        longitude: lng,
      };
      showPopup([lng, lat], location, null, null, currentFilters.source);
      setActivePopupLocation({ locationId, source: currentFilters.source });
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
      setActivePopupLocation({ locationId: station.location.id, source: "uke" });
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

  const popupActions = useMemo(
    () => ({
      show: showPopup,
      updateStations: updatePopupStations,
      cleanup: cleanupPopup,
      setLocation: setActivePopupLocation,
    }),
    [showPopup, updatePopupStations, cleanupPopup],
  );

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
        activePopupLocationId={activePopupLocation?.locationId}
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
