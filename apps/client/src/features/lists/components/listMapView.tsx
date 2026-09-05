import { TaskDaily01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LngLatBounds } from "maplibre-gl";
import { type JSX, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Map as LibreMap, MapControls, useMap } from "@/components/ui/map";
import { useListDetail } from "@/features/lists/hooks/useListDetail";
import type { LocationsResponse } from "@/features/map/api";
import { buildFilterParams, fetchLocations, fetchRadioLines } from "@/features/map/api";
import { MapSearchOverlay } from "@/features/map/components/search-overlay";
import { DEFAULT_FILTERS, StationsLayer, loadMapFilters, saveMapFilters } from "@/features/map/components/stationsLayer";
import { FLOATING_NAV_MAP_OFFSET_CLASS, POLAND_BOUNDS, POLAND_CENTER } from "@/features/map/constants";
import { useMapBounds } from "@/features/map/hooks/useMapBounds";
import { useMapKeybinds } from "@/features/map/hooks/useMapKeybinds";
import type { MapPopupLocation } from "@/features/map/hooks/useMapPopup";
import { useMapPositionPersistence } from "@/features/map/hooks/useMapPositionPersistence";
import { useStationPopupActions } from "@/features/map/hooks/useStationPopupActions";
import type { SearchStation } from "@/features/map/searchApi";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { authClient } from "@/lib/auth/client";
import type { LocationWithStations, StationFilters, StationWithoutCells } from "@/types/station";

const RadioLinesLayer = lazy(() => import("@/features/map/components/radioLinesLayer"));

const LIST_MAP_FILTERS_STORAGE_KEY = "list-map:filters";
const LIST_FETCH_LIMIT = 1000;

type ListMapContextProps = { name: string };

function ListMapContext({ name }: ListMapContextProps): JSX.Element {
  return (
    <div className="flex w-fit max-w-full min-w-0 items-center gap-1.5 rounded-md border bg-background/95 px-2 py-1.5 shadow-md backdrop-blur-md md:max-w-64">
      <HugeiconsIcon icon={TaskDaily01Icon} className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
      <span className="truncate text-xs font-semibold leading-none" title={name}>
        {name}
      </span>
    </div>
  );
}

function ListMapInner({ uuid }: { uuid: string }): JSX.Element {
  const navigate = useNavigate();
  const { map, isLoaded } = useMap();
  useMapPositionPersistence({ map, isLoaded });
  const { zoom } = useMapBounds({ map, isLoaded });
  const { data: runtimeSettings } = useSettings();
  const { data: session } = authClient.useSession();
  const showAddToList = !!session?.user && !!runtimeSettings?.enableUserLists;
  const { preferences } = usePreferences();

  const [filters, setFiltersState] = useState<StationFilters>(() => {
    const saved = loadMapFilters(LIST_MAP_FILTERS_STORAGE_KEY) ?? DEFAULT_FILTERS;
    return { ...saved, showStations: true };
  });
  const setFilters = useCallback((update: StationFilters | ((prev: StationFilters) => StationFilters)) => {
    setFiltersState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      saveMapFilters(next, LIST_MAP_FILTERS_STORAGE_KEY);
      return next;
    });
  }, []);

  const { data: listData, isLoading, isError } = useListDetail(uuid);

  const wantAzimuths = preferences.showAzimuths && zoom >= preferences.azimuthsMinZoom;
  const filterParams = buildFilterParams(filters).toString();
  const { data: fetchedLocations } = useQuery({
    queryKey: ["list-locations", uuid, filters.source, filterParams, wantAzimuths],
    queryFn: ({ signal }) => fetchLocations(undefined, filters, LIST_FETCH_LIMIT, { azimuths: wantAzimuths, list: uuid, signal }),
    staleTime: 1000 * 60 * 2,
    placeholderData: (prev) => prev,
  });

  const { data: radioLinesResponse } = useQuery({
    queryKey: ["list-radiolines", uuid, filters.radiolineOperators, filters.recentDays],
    queryFn: ({ signal }) =>
      fetchRadioLines(undefined, {
        signal,
        operatorIds: filters.radiolineOperators,
        limit: LIST_FETCH_LIMIT,
        recentDays: filters.recentDays,
        list: uuid,
      }),
    enabled: filters.showRadiolines,
    staleTime: 1000 * 60 * 5,
    placeholderData: (prev) => prev,
  });
  const radioLines = radioLinesResponse?.data;

  const [activeMarker, setActiveMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [tempLocations, setTempLocations] = useState<LocationWithStations[]>([]);

  const locationsResponse = useMemo<LocationsResponse | undefined>(() => {
    if (!fetchedLocations) return undefined;
    if (filters.source !== "internal" || tempLocations.length === 0) return fetchedLocations;
    const existingIds = new Set(fetchedLocations.data.map((location) => location.id));
    const extras = tempLocations.filter((location) => !existingIds.has(location.id));
    if (extras.length === 0) return fetchedLocations;
    return { data: [...fetchedLocations.data, ...extras], totalCount: fetchedLocations.totalCount };
  }, [fetchedLocations, tempLocations, filters.source]);

  const internalMemberIds = listData?.stations.internal;
  const listStationIds = useMemo(() => new Set(internalMemberIds ?? []), [internalMemberIds]);

  const hasFitBoundsRef = useRef(false);
  useEffect(() => {
    if (!map || !isLoaded || hasFitBoundsRef.current || !fetchedLocations) return;
    const bounds = new LngLatBounds();
    for (const location of fetchedLocations.data) {
      bounds.extend([location.longitude, location.latitude]);
    }
    for (const rl of radioLines ?? []) {
      bounds.extend([rl.tx.longitude, rl.tx.latitude]);
      bounds.extend([rl.rx.longitude, rl.rx.latitude]);
    }
    if (bounds.isEmpty()) return;
    hasFitBoundsRef.current = true;
    map.fitBounds(bounds, { padding: 80, maxZoom: 14 });
  }, [map, isLoaded, fetchedLocations, radioLines]);

  const handlePopupClose = useCallback((closedLocation: MapPopupLocation) => {
    if (closedLocation.source !== "internal") return;
    setTempLocations((locations) => locations.filter((location) => location.id !== closedLocation.locationId));
  }, []);

  const filterListStations = useCallback(
    (stations: StationWithoutCells[]) => {
      const memberStations = stations.filter((station) => listStationIds.has(station.id));
      return memberStations.length > 0 ? memberStations : stations;
    },
    [listStationIds],
  );

  const { showPopup, openLocations, closePopups, popupActions, stationActions } = useStationPopupActions({
    map,
    showAddToList,
    allowMultipleMapPopups: preferences.allowMultipleMapPopups,
    closeMapPopupsOnMapClick: preferences.closeMapPopupsOnMapClick,
    detailsFilters: filters,
    filterStations: filterListStations,
    onClose: handlePopupClose,
  });

  useEffect(() => {
    closePopups((location) => location.source !== filters.source);
  }, [filters.source, closePopups]);

  const handleActiveMarkerClear = useCallback(() => setActiveMarker(null), []);

  useMapKeybinds(({ key }) => {
    if (key !== "m") return false;
    void navigate({ to: "/" });
    return true;
  });

  const handleLocationSelect = useCallback(
    (lat: number, lng: number) => {
      map?.flyTo({ center: [lng, lat], zoom: 15, essential: true, speed: 1.5 });
    },
    [map],
  );

  const handleStationSelect = useCallback(
    (station: SearchStation) => {
      const location = station.location;
      if (!location || !map) return;

      const { id: locationId, latitude: lat, longitude: lng } = location;
      const alreadyOnMap = fetchedLocations?.data.some((loc) => loc.id === locationId) ?? false;
      if (!alreadyOnMap) {
        const tempLoc: LocationWithStations = {
          id: locationId,
          latitude: lat,
          longitude: lng,
          city: location.city ?? undefined,
          address: location.address ?? undefined,
          region: location.region,
          updatedAt: location.updatedAt,
          createdAt: location.createdAt,
          stations: [station as unknown as StationWithoutCells],
        };
        setTempLocations((locations) => [...locations.filter((location) => location.id !== locationId), tempLoc]);
      }

      const locationInfo = {
        id: locationId,
        city: location.city ?? undefined,
        address: location.address ?? undefined,
        region: location.region.name,
        latitude: lat,
        longitude: lng,
      };

      map.flyTo({ center: [lng, lat], zoom: 16, essential: true, speed: 1.5 });
      void map.once("moveend", () => {
        showPopup([lng, lat], locationInfo, [station as unknown as StationWithoutCells], null, "internal");
      });
    },
    [map, fetchedLocations, showPopup],
  );

  const locationCount = locationsResponse?.data.length ?? 0;
  const totalCount = fetchedLocations?.totalCount ?? 0;
  const radioLineCount = radioLines?.length ?? 0;
  const radioLineTotalCount = radioLinesResponse?.totalCount ?? 0;
  const listName = listData?.name;
  const listMapContext = useMemo(() => (listName !== undefined ? <ListMapContext name={listName} /> : undefined), [listName]);

  return (
    <>
      <MapSearchOverlay
        locationCount={locationCount}
        totalCount={totalCount}
        radioLineCount={radioLineCount}
        radioLineTotalCount={radioLineTotalCount}
        filters={filters}
        zoom={zoom}
        activeMarker={activeMarker}
        onActiveMarkerClear={handleActiveMarkerClear}
        onFiltersChange={setFilters}
        onLocationSelect={handleLocationSelect}
        onStationSelect={handleStationSelect}
        mapContext={listMapContext}
      />

      {(isError || (!isLoading && !listData)) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">This list was not found or is private.</p>
        </div>
      )}

      <StationsLayer
        filters={filters}
        onFiltersChange={setFilters}
        locationsResponse={locationsResponse}
        zoom={zoom}
        onActiveMarkerChange={setActiveMarker}
        stationActions={stationActions}
        popupActions={popupActions}
        activePopupLocations={openLocations}
      />

      {filters.showRadiolines && radioLines && radioLines.length > 0 ? (
        <Suspense fallback={null}>
          <RadioLinesLayer radioLines={radioLines} showAddToList={showAddToList} />
        </Suspense>
      ) : null}

      <MapControls showLocate showCompass showScale showFullscreen />
    </>
  );
}

export function ListMapView({ uuid }: { uuid: string }): JSX.Element {
  const { preferences } = usePreferences();

  return (
    <LibreMap
      center={POLAND_CENTER}
      zoom={6}
      maxBounds={POLAND_BOUNDS}
      minZoom={5}
      className={preferences.navMode === "floating" ? FLOATING_NAV_MAP_OFFSET_CLASS : undefined}
    >
      <ListMapInner uuid={uuid} />
    </LibreMap>
  );
}
