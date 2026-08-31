import { TaskDaily01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import { LngLatBounds } from "maplibre-gl";
import { type JSX, Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";

import { Map as LibreMap, MapControls, useMap } from "@/components/ui/map";
import { useListDetail } from "@/features/lists/hooks/useListDetail";
import type { LocationsResponse } from "@/features/map/api";
import { MapSearchOverlay } from "@/features/map/components/search-overlay";
import { DEFAULT_FILTERS, StationsLayer, loadMapFilters, saveMapFilters } from "@/features/map/components/stationsLayer";
import { FLOATING_NAV_MAP_OFFSET_CLASS, POLAND_BOUNDS, POLAND_CENTER } from "@/features/map/constants";
import { useMapBounds } from "@/features/map/hooks/useMapBounds";
import { type MapPopupLocation, useMapPopup } from "@/features/map/hooks/useMapPopup";
import { useMapPositionPersistence } from "@/features/map/hooks/useMapPositionPersistence";
import type { SearchStation } from "@/features/map/searchApi";
import { useFloatingDialogStack } from "@/features/station-details/components/floatingDialogStackProvider";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { authClient } from "@/lib/authClient";
import { isEditableKeyboardTarget } from "@/lib/keyboard";
import type { LocationWithStations, RadioLine, StationFilters, StationSource, StationWithoutCells, UkeStation } from "@/types/station";

const RadioLinesLayer = lazy(() => import("@/features/map/components/radioLinesLayer"));

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
    const saved = loadMapFilters() ?? DEFAULT_FILTERS;
    return { ...saved, showStations: true };
  });
  const setFilters = useCallback((update: StationFilters | ((prev: StationFilters) => StationFilters)) => {
    setFiltersState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      saveMapFilters(next);
      return next;
    });
  }, []);
  const wantAzimuths = preferences.showAzimuths;
  const { data: listData, isLoading, isError } = useListDetail(uuid, wantAzimuths);

  const { openStationDialog, openUkePermitDialog } = useFloatingDialogStack();
  const [activeMarker, setActiveMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [tempLocations, setTempLocations] = useState<LocationWithStations[]>([]);

  const locationsResponse = useMemo<LocationsResponse | undefined>(() => {
    if (!listData) return undefined;
    const locationMap = new Map<number, LocationWithStations>();
    for (const station of listData.stations) {
      if (!station.location) continue;
      const locId = station.location.id;
      if (!locationMap.has(locId)) {
        locationMap.set(locId, {
          id: locId,
          latitude: station.location.latitude,
          longitude: station.location.longitude,
          city: station.location.city ?? undefined,
          address: station.location.address ?? undefined,
          region: station.location.region,
          updatedAt: station.location.updatedAt,
          createdAt: station.location.createdAt,
          stations: [],
        });
      }
      locationMap.get(locId)!.stations.push(station as unknown as StationWithoutCells);
    }
    for (const tempLoc of tempLocations) {
      if (!locationMap.has(tempLoc.id)) {
        locationMap.set(tempLoc.id, tempLoc);
      }
    }
    return { data: Array.from(locationMap.values()), totalCount: listData.stations.length };
  }, [listData, tempLocations]);

  const ukeLocations = listData?.ukeLocations;
  const ukeLocationsResponse = useMemo<LocationsResponse | undefined>(() => {
    if (!ukeLocations?.length) return undefined;
    return { data: ukeLocations as unknown as LocationsResponse["data"], totalCount: ukeLocations.length };
  }, [ukeLocations]);

  const listStations = listData?.stations;
  const listStationIds = useMemo(() => new Set(listStations?.map((station) => station.id) ?? []), [listStations]);
  const listRadiolines = listData?.radiolines;
  useEffect(() => {
    if (!map || !isLoaded || !listStations) return;
    const bounds = new LngLatBounds();
    for (const station of listStations) {
      if (station.location) bounds.extend([station.location.longitude, station.location.latitude]);
    }
    for (const rl of listRadiolines ?? []) {
      bounds.extend([rl.tx.longitude, rl.tx.latitude]);
      bounds.extend([rl.rx.longitude, rl.rx.latitude]);
    }
    for (const loc of ukeLocations ?? []) {
      bounds.extend([loc.longitude, loc.latitude]);
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 80, maxZoom: 14 });
  }, [map, isLoaded, listStations, listRadiolines, ukeLocations]);

  const handleOpenStationDetails = useCallback((id: number, source: StationSource) => openStationDialog(id, source), [openStationDialog]);
  const handleOpenUkeStationDetails = useCallback((station: UkeStation) => openUkePermitDialog(station), [openUkePermitDialog]);
  const handlePopupClose = useCallback((closedLocation: MapPopupLocation) => {
    if (closedLocation.source !== "internal") return;
    setTempLocations((locations) => locations.filter((location) => location.id !== closedLocation.locationId));
  }, []);

  const filterListStations = useCallback(
    (stations: StationWithoutCells[]) => {
      const listStations = stations.filter((station) => listStationIds.has(station.id));
      return listStations.length > 0 ? listStations : stations;
    },
    [listStationIds],
  );

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
    detailsFilters: DEFAULT_FILTERS,
    filterStations: filterListStations,
    onOpenStationDetails: handleOpenStationDetails,
    onOpenUkeStationDetails: handleOpenUkeStationDetails,
    onClose: handlePopupClose,
  });

  useEffect(() => {
    closePopups((location) => location.source !== filters.source);
  }, [filters.source, closePopups]);

  const handleActiveMarkerClear = useCallback(() => setActiveMarker(null), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableKeyboardTarget(event.target)) return;
      if (event.key.toLowerCase() !== "m") return;

      event.preventDefault();
      void navigate({ to: "/" });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

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
      const alreadyInList = listData?.stations.some((s) => s.location?.id === locationId);
      if (!alreadyInList) {
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
    [map, listData, showPopup],
  );

  const popupActions = useMemo(() => ({ show: showPopup, cleanup: cleanupPopup }), [showPopup, cleanupPopup]);

  const stationActions = useMemo(
    () => ({
      openDetails: handleOpenStationDetails,
      openUkeDetails: handleOpenUkeStationDetails,
    }),
    [handleOpenStationDetails, handleOpenUkeStationDetails],
  );

  const locationCount = (locationsResponse?.data.length ?? 0) + (listData?.ukeLocations?.length ?? 0);
  const radiolineCount = listData?.radiolines.length ?? 0;
  const listName = listData?.name;
  const listMapContext = useMemo(() => (listName !== undefined ? <ListMapContext name={listName} /> : undefined), [listName]);

  return (
    <>
      <MapSearchOverlay
        locationCount={locationCount}
        totalCount={locationCount}
        radioLineCount={radiolineCount}
        radioLineTotalCount={radiolineCount}
        filters={filters}
        zoom={zoom}
        activeMarker={activeMarker}
        onActiveMarkerClear={handleActiveMarkerClear}
        onFiltersChange={setFilters}
        onLocationSelect={handleLocationSelect}
        onStationSelect={handleStationSelect}
        hideAPIFilters
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
        locationsResponse={filters.source === "uke" ? ukeLocationsResponse : locationsResponse}
        zoom={zoom}
        onActiveMarkerChange={setActiveMarker}
        stationActions={stationActions}
        popupActions={popupActions}
        activePopupLocations={openLocations}
      />

      {filters.showRadiolines && (listData?.radiolines.length ?? 0) > 0 ? (
        <Suspense fallback={null}>
          <RadioLinesLayer radioLines={listData!.radiolines as RadioLine[]} showAddToList={showAddToList} />
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
