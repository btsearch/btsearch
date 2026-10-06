import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { fetchRadioLines, mapLocationsQueryOptions } from "../api";
import { FLOATING_NAV_MAP_OFFSET_CLASS, POLAND_CENTER } from "../constants";
import { getEffectiveMapFilters, isMapSourceUndecided, useMapCountries, useRegisterOnScreen } from "../data/mapCountries";
import { useMapLookups, useMapMaxBounds } from "../data/mapLookups";
import { type MapPlace, useMapPoints } from "../data/mapPoints";
import { useSavedMapFilters } from "../data/useSavedMapFilters";
import { useMapBounds } from "../hooks/useMapBounds";
import { loadMapPosition, useMapPositionPersistence } from "../hooks/useMapPositionPersistence";
import { useMapQueryHousekeeping } from "../hooks/useMapQueryHousekeeping";
import { usePlannedMeasurementsLayer } from "../hooks/usePlannedMeasurementsLayer";
import { useStationPopupActions } from "../hooks/useStationPopupActions";
import { useWakeLock } from "../hooks/useWakeLock";
import { type StationSearchHit, type UkeSearchPermitStation, type UkeSearchRadioline, isRejectedSearchQuery, toSearchHitPlace } from "../searchApi";
import { MapSearchOverlay } from "./search-overlay";
import { StationsLayer } from "./stationsLayer";
import { Map as LibreMap, MapControls, MapMarker, MarkerContent, useMap } from "@/components/ui/map";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { isStationsQueryScope } from "@/features/nsg-explorer/stations/queryScope";
import { useTerrainProfileController } from "@/features/terrain-profile/hooks/useTerrainProfileController";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { useSettledSession } from "@/hooks/useSettledSession";
import type { RadioLine, UkeStation } from "@/types/station";

const RadioLinesLayer = lazy(() => import("./radioLinesLayer"));
const TerrainProfileSurface = lazy(() => import("@/features/terrain-profile/components/terrainProfileSurface"));

const MAP_QUERY_FAMILIES = new Set(["locations", "radiolines"]);
const NO_RADIO_LINES: RadioLine[] = [];
const SELECTED_DOT_TOLERANCE = 0.0001;

type SearchTextAnswer = {
  searchText?: string;
  isRejected: boolean;
  isAccepted: boolean;
};

function isMainMapQuery(queryKey: readonly unknown[]): boolean {
  return !isStationsQueryScope(queryKey.at(-1));
}

function useRejectedSearchText({ searchText, isRejected, isAccepted }: SearchTextAnswer): string | undefined {
  const [lastRejectedSearchText, setLastRejectedSearchText] = useState<string>();

  let rejectedSearchText = lastRejectedSearchText;
  if (isRejected) rejectedSearchText = searchText;
  else if (isAccepted || lastRejectedSearchText !== searchText) rejectedSearchText = undefined;

  if (rejectedSearchText !== lastRejectedSearchText) setLastRejectedSearchText(rejectedSearchText);
  return rejectedSearchText;
}

function MapViewInner() {
  useWakeLock();
  const { map, isLoaded } = useMap();
  useMapPositionPersistence({ map, isLoaded });
  const { bounds, bbox, zoom, isMoving } = useMapBounds({ map, isLoaded });
  const { preferences } = usePreferences();
  const { data: runtimeSettings } = useSettings();
  const { data: session } = useSettledSession();
  const showAddToList = !!session?.user && !!runtimeSettings?.features.lists;
  const [savedFilters, setSavedFilters] = useSavedMapFilters();
  const { lookups } = useMapLookups();
  const registerOnScreen = useRegisterOnScreen(bounds);
  const [activeMarker, setActiveMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapQuery, setMapQuery] = useState<string | undefined>(undefined);

  const terrainProfile = useTerrainProfileController({ map, isLoaded });

  const [pendingRadiolineId, setPendingRadiolineId] = useState<number | null>(null);
  const { setTerrainProfileStartHandler } = useFloatingDialogStack();

  useEffect(() => {
    setTerrainProfileStartHandler(terrainProfile.start);
    return () => setTerrainProfileStartHandler(null);
  }, [setTerrainProfileStartHandler, terrainProfile.start]);

  useMapMaxBounds(map);

  const shownFilters = getEffectiveMapFilters(savedFilters, registerOnScreen);
  const { showPopup, openLocations, closePopups, popupActions, stationActions } = useStationPopupActions({
    map,
    showAddToList,
    allowMultipleMapPopups: preferences.allowMultipleMapPopups,
    closeMapPopupsOnMapClick: preferences.closeMapPopupsOnMapClick,
    statusFilter: shownFilters.status,
  });

  useEffect(() => {
    closePopups((location) => location.source !== shownFilters.source);
  }, [shownFilters.source, closePopups]);

  const wantAzimuths = preferences.showAzimuths && zoom >= preferences.azimuthsMinZoom;
  const searchText = shownFilters.source === "internal" ? mapQuery : undefined;
  const isSourceUndecided = isMapSourceUndecided(savedFilters, registerOnScreen);
  useMapQueryHousekeeping({ bounds, isMoving, queryFamilies: MAP_QUERY_FAMILIES, isInScope: isMainMapQuery });

  const {
    data: page,
    error: listError,
    isPlaceholderData: isPreviousPage,
  } = useQuery({
    ...mapLocationsQueryOptions({
      bounds,
      request: { filters: shownFilters, lookups, limit: preferences.mapStationsLimit, wantAzimuths, searchText },
    }),
    enabled: isLoaded && bounds !== "" && !isMoving && !isSourceUndecided,
    placeholderData: keepPreviousData,
  });
  const rejectedSearchText = useRejectedSearchText({
    searchText,
    isRejected: searchText !== undefined && isRejectedSearchQuery(listError),
    isAccepted: page !== undefined && !isPreviousPage,
  });

  const points = useMapPoints(page, lookups);
  const mapCountries = useMapCountries({ bounds, points });
  const locationCount = page?.locations.length ?? 0;
  const totalCount = page?.total ?? 0;

  const { data: radioLinesResponse, isFetching: isRadioLinesFetching } = useQuery({
    queryKey: ["radiolines", bounds, shownFilters.radiolineOperators, shownFilters.recentDays, preferences.mapRadiolinesLimit],
    queryFn: ({ signal }) =>
      fetchRadioLines(bounds, {
        signal,
        operatorIds: shownFilters.radiolineOperators,
        limit: preferences.mapRadiolinesLimit,
        recentDays: shownFilters.recentDays,
      }),
    enabled: shownFilters.showRadiolines && bounds !== "" && !isMoving && zoom >= preferences.radiolinesMinZoom,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60,
    placeholderData: keepPreviousData,
  });

  const radioLines = radioLinesResponse?.data ?? NO_RADIO_LINES;
  const radioLineCount = shownFilters.showRadiolines ? radioLines.length : 0;
  const radioLineTotalCount = shownFilters.showRadiolines ? (radioLinesResponse?.totalCount ?? 0) : 0;

  const { openDetails: openStationDetails } = stationActions;
  usePlannedMeasurementsLayer({
    map,
    isLoaded,
    enabled: shownFilters.showPlannedMeasurements,
    bbox,
    isMoving,
    operatorIds: shownFilters.operatorIds,
    isPickingReceiver: terrainProfile.isPickingReceiver,
    onOpenStation: (stationId) => openStationDetails(stationId, "internal"),
  });

  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const latestSearchPickRef = useRef(0);

  useEffect(() => {
    return () => {
      latestSearchPickRef.current += 1;
    };
  }, []);

  const handleLocationSelect = useCallback(
    (lat: number, lng: number) => {
      latestSearchPickRef.current += 1;
      map?.flyTo({ center: [lng, lat], zoom: 15, essential: true, speed: 1.5 });
      setSelectedLocation({ lat, lng });
    },
    [map],
  );

  const showSelectedDot =
    selectedLocation !== null &&
    !points.some(
      (point) =>
        Math.abs(point.latitude - selectedLocation.lat) < SELECTED_DOT_TOLERANCE &&
        Math.abs(point.longitude - selectedLocation.lng) < SELECTED_DOT_TOLERANCE,
    );

  const shownSourceRef = useRef(shownFilters.source);
  useLayoutEffect(() => {
    shownSourceRef.current = shownFilters.source;
  }, [shownFilters.source]);

  const handleStationSelect = useCallback(
    async (hit: StationSearchHit) => {
      const hitLocation = hit.location;
      if (!map || hitLocation === null) return;

      const { latitude, longitude } = hitLocation;
      const place = toSearchHitPlace(hitLocation);

      latestSearchPickRef.current += 1;
      const searchPick = latestSearchPickRef.current;
      map.flyTo({ center: [longitude, latitude], zoom: 16, essential: true, speed: 1.5 });

      await new Promise<void>((resolve) => map.once("moveend", () => resolve()));

      if (searchPick !== latestSearchPickRef.current || shownSourceRef.current !== "internal") return;
      showPopup([longitude, latitude], place, null, null, "internal");
    },
    [map, showPopup],
  );

  const handleActiveMarkerClear = useCallback(() => setActiveMarker(null), []);
  const handleToggleHeatmap = useCallback(() => setSavedFilters((prev) => ({ ...prev, showHeatmap: !prev.showHeatmap })), [setSavedFilters]);
  const handleTogglePlannedMeasurements = useCallback(
    () => setSavedFilters((prev) => ({ ...prev, showPlannedMeasurements: !prev.showPlannedMeasurements })),
    [setSavedFilters],
  );
  const handleUkeStationSelectFromSearch = useCallback(
    async (station: UkeSearchPermitStation) => {
      if (!map || !station.location) return;
      const { latitude, longitude } = station.location;
      latestSearchPickRef.current += 1;
      const searchPick = latestSearchPickRef.current;
      map.flyTo({ center: [longitude, latitude], zoom: 16, essential: true, speed: 1.5 });
      await new Promise<void>((resolve) => map.once("moveend", () => resolve()));
      if (searchPick !== latestSearchPickRef.current || shownSourceRef.current !== "uke") return;

      const place: MapPlace = {
        id: station.location.id,
        city: station.location.city,
        address: station.location.address,
        regionName: null,
        latitude,
        longitude,
      };
      const popupStation: UkeStation = {
        id: station.id,
        station_id: station.station_id,
        operator: station.operator,
        permits: station.permits,
      };
      showPopup([longitude, latitude], place, null, [popupStation], "uke");
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
        radioLineCount={radioLineCount}
        radioLineTotalCount={radioLineTotalCount}
        isRadioLinesFetching={shownFilters.showRadiolines && isRadioLinesFetching}
        filters={shownFilters}
        mapCountries={mapCountries}
        zoom={zoom}
        activeMarker={activeMarker}
        onActiveMarkerClear={handleActiveMarkerClear}
        onFiltersChange={setSavedFilters}
        onLocationSelect={handleLocationSelect}
        onStationSelect={handleStationSelect}
        onUkeStationSelect={handleUkeStationSelectFromSearch}
        onRadiolineSelect={handleRadiolineSelectFromSearch}
        onToggleHeatmap={handleToggleHeatmap}
        onTogglePlannedMeasurements={handleTogglePlannedMeasurements}
        onFilterQueryChange={setMapQuery}
        rejectedSearchText={rejectedSearchText}
      />
      {showSelectedDot && selectedLocation ? (
        <MapMarker longitude={selectedLocation.lng} latitude={selectedLocation.lat}>
          <MarkerContent>
            <div className="relative flex items-center justify-center">
              <div className="absolute h-5 w-5 animate-ping rounded-full bg-blue-500/40" />
              <div className="relative h-3 w-3 rounded-full border-2 border-white bg-blue-500 shadow-md" />
            </div>
          </MarkerContent>
        </MapMarker>
      ) : null}
      <StationsLayer
        filters={shownFilters}
        savedFilters={savedFilters}
        onFiltersChange={setSavedFilters}
        points={points}
        wantAzimuths={wantAzimuths}
        isPickingReceiver={terrainProfile.isPickingReceiver}
        onActiveMarkerChange={setActiveMarker}
        stationActions={stationActions}
        popupActions={popupActions}
        onRadiolineIdFromUrl={setPendingRadiolineId}
        activePopupLocations={openLocations}
      />
      {shownFilters.showRadiolines || pendingRadiolineId !== null ? (
        <Suspense fallback={null}>
          <RadioLinesLayer
            radioLines={radioLines}
            pendingRadiolineId={pendingRadiolineId}
            showAddToList={showAddToList}
            isPickingReceiver={terrainProfile.isPickingReceiver}
            onPendingRadiolineConsumed={setPendingRadiolineId}
          />
        </Suspense>
      ) : null}
      <MapControls showLocate showCompass showScale showFullscreen />
      {terrainProfile.hasOpened ? (
        <Suspense fallback={null}>
          <TerrainProfileSurface panel={terrainProfile.panel} />
        </Suspense>
      ) : null}
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
      minZoom={5}
      className={preferences.navMode === "floating" ? FLOATING_NAV_MAP_OFFSET_CLASS : undefined}
    >
      <MapViewInner />
    </LibreMap>
  );
}
