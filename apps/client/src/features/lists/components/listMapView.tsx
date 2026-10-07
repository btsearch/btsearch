import { TaskDaily01Icon, TaskRemove01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { MAX_LOCATION_LIST_LIMIT } from "@openbts/shared/contract";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LngLatBounds } from "maplibre-gl";
import { type JSX, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { MapLinkButton } from "@/components/app/errorScreens";
import { ErrorState } from "@/components/ui/error-state";
import { Map as LibreMap, MapControls, useMap } from "@/components/ui/map";
import { Spinner } from "@/components/ui/spinner";
import { listQueryOptions } from "@/features/lists/api";
import { fetchRadioLines, mapLocationsQueryOptions } from "@/features/map/api";
import { MapSearchOverlay } from "@/features/map/components/search-overlay";
import { StationsLayer } from "@/features/map/components/stationsLayer";
import { FLOATING_NAV_MAP_OFFSET_CLASS, POLAND_CENTER } from "@/features/map/constants";
import { getEffectiveMapFilters, isMapSourceUndecided, useMapCountries, useRegisterOnScreen } from "@/features/map/data/mapCountries";
import type { MapFilters } from "@/features/map/data/mapFilters";
import { useMapLookups, useMapMaxBounds } from "@/features/map/data/mapLookups";
import { type MapPoint, type MapPopupStation, locationRecordToMapPoint, useMapPoints } from "@/features/map/data/mapPoints";
import { useSavedMapFilters } from "@/features/map/data/useSavedMapFilters";
import { useMapBounds } from "@/features/map/hooks/useMapBounds";
import { useMapKeybinds } from "@/features/map/hooks/useMapKeybinds";
import type { MapPopupLocation } from "@/features/map/hooks/useMapPopup";
import { useMapPositionPersistence } from "@/features/map/hooks/useMapPositionPersistence";
import { useMapQueryHousekeeping } from "@/features/map/hooks/useMapQueryHousekeeping";
import { usePlannedMeasurementsLayer } from "@/features/map/hooks/usePlannedMeasurementsLayer";
import { useStationPopupActions } from "@/features/map/hooks/useStationPopupActions";
import { type StationSearchHit, type StationSearchHitLocation, toSearchHitLocation, toSearchHitPlace } from "@/features/map/searchApi";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { useSettledSession } from "@/hooks/useSettledSession";
import { ApiResponseError } from "@/lib/api";

const RadioLinesLayer = lazy(() => import("@/features/map/components/radioLinesLayer"));

const LIST_RADIOLINES_LIMIT = 1000;
const LIST_MAP_QUERY_FAMILIES = new Set(["list-locations", "list-radiolines"]);
const LIST_UNAVAILABLE_STATUSES = new Set([401, 403, 404]);
const LIST_MAP_FILTER_OVERRIDES: Partial<MapFilters> = { showStations: true };
const NO_POINTS: MapPoint[] = [];

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
  const { t } = useTranslation(["lists", "common"]);
  const navigate = useNavigate();
  const { map, isLoaded } = useMap();
  useMapPositionPersistence({ map, isLoaded });
  const { bounds, bbox, zoom, isMoving } = useMapBounds({ map, isLoaded });
  const { data: runtimeSettings } = useSettings();
  const { data: session } = useSettledSession();
  const showAddToList = !!session?.user && !!runtimeSettings?.features.lists;
  const { preferences } = usePreferences();
  const [savedFilters, setSavedFilters] = useSavedMapFilters("list-map", LIST_MAP_FILTER_OVERRIDES);
  const { lookups } = useMapLookups();
  const registerOnScreen = useRegisterOnScreen(bounds);

  const { data: listData, error: listError, isLoading, isPaused, isFetching, refetch } = useQuery(listQueryOptions(uuid));

  useMapMaxBounds(map);

  const wantAzimuths = preferences.showAzimuths && zoom >= preferences.azimuthsMinZoom;
  const isSourceUndecided = isMapSourceUndecided(savedFilters, registerOnScreen);
  useMapQueryHousekeeping({ bounds, isMoving, queryFamilies: LIST_MAP_QUERY_FAMILIES });

  const shownFilters = getEffectiveMapFilters(savedFilters, registerOnScreen);
  const { data: page } = useQuery({
    ...mapLocationsQueryOptions({
      bounds,
      family: "list-locations",
      request: { filters: shownFilters, lookups, limit: MAX_LOCATION_LIST_LIMIT, wantAzimuths, listId: uuid },
    }),
    enabled: isLoaded && bounds !== "" && !isMoving && !isSourceUndecided,
    placeholderData: keepPreviousData,
  });

  const { data: radioLinesResponse } = useQuery({
    queryKey: ["list-radiolines", bounds, uuid, shownFilters.radiolineOperators, shownFilters.recentDays],
    queryFn: ({ signal }) =>
      fetchRadioLines(bounds, {
        signal,
        operatorIds: shownFilters.radiolineOperators,
        limit: LIST_RADIOLINES_LIMIT,
        recentDays: shownFilters.recentDays,
        list: uuid,
      }),
    enabled: shownFilters.showRadiolines && bounds !== "" && !isMoving,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60,
    placeholderData: keepPreviousData,
  });
  const radioLines = radioLinesResponse?.data;

  const [activeMarker, setActiveMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [searchedLocations, setSearchedLocations] = useState<StationSearchHitLocation[]>([]);

  const listedPoints = useMapPoints(page, lookups);
  const isDatabasePage = page?.source === "internal";
  const searchedPoints = useMemo(() => {
    if (!isDatabasePage || lookups === undefined || searchedLocations.length === 0) return NO_POINTS;

    const listedIds = new Set(listedPoints.map((point) => point.id));
    return searchedLocations
      .filter((location) => !listedIds.has(location.id))
      .map((location): MapPoint => ({ ...locationRecordToMapPoint(location, lookups), isUnlisted: true }));
  }, [isDatabasePage, lookups, searchedLocations, listedPoints]);
  const points = useMemo(() => (searchedPoints.length === 0 ? listedPoints : [...listedPoints, ...searchedPoints]), [listedPoints, searchedPoints]);
  const mapCountries = useMapCountries({ bounds, points });

  const listStationIds = listData?.items.stationIds;
  const listStationIdSet = useMemo(() => new Set(listStationIds ?? []), [listStationIds]);

  const hasFitBoundsRef = useRef(false);
  useEffect(() => {
    if (!map || !isLoaded || hasFitBoundsRef.current || !page) return;
    const listBounds = new LngLatBounds();
    for (const location of page.locations) {
      listBounds.extend([location.longitude, location.latitude]);
    }
    for (const rl of radioLines ?? []) {
      listBounds.extend([rl.tx.longitude, rl.tx.latitude]);
      listBounds.extend([rl.rx.longitude, rl.rx.latitude]);
    }
    if (listBounds.isEmpty()) return;
    hasFitBoundsRef.current = true;
    map.fitBounds(listBounds, { padding: 80, maxZoom: 14 });
  }, [map, isLoaded, page, radioLines]);

  const handlePopupClose = useCallback((closedLocation: MapPopupLocation) => {
    if (closedLocation.source !== "internal") return;
    setSearchedLocations((locations) => locations.filter((location) => location.id !== closedLocation.locationId));
  }, []);

  const filterListStations = useCallback(
    (stations: MapPopupStation[]) => {
      const memberStations = stations.filter((station) => listStationIdSet.has(station.id));
      return memberStations.length > 0 ? memberStations : stations;
    },
    [listStationIdSet],
  );

  const { showPopup, openLocations, popupContents, closePopups, popupActions, stationActions } = useStationPopupActions({
    map,
    showAddToList,
    allowMultipleMapPopups: preferences.allowMultipleMapPopups,
    closeMapPopupsOnMapClick: preferences.closeMapPopupsOnMapClick,
    statusFilter: shownFilters.status,
    filterStations: filterListStations,
    onClose: handlePopupClose,
  });

  useEffect(() => {
    closePopups((location) => location.source !== shownFilters.source);
  }, [shownFilters.source, closePopups]);

  const { openDetails: openStationDetails } = stationActions;
  usePlannedMeasurementsLayer({
    map,
    isLoaded,
    enabled: shownFilters.showPlannedMeasurements,
    bbox,
    isMoving,
    operatorIds: shownFilters.operatorIds,
    onOpenStation: (stationId) => openStationDetails(stationId, "internal"),
  });

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
    (hit: StationSearchHit) => {
      const hitLocation = toSearchHitLocation(hit);
      if (hitLocation === null || !map) return;

      const { id: locationId, latitude, longitude } = hitLocation;
      const isListed = page !== undefined && page.source === "internal" && page.locations.some((location) => location.id === locationId);
      if (!isListed) setSearchedLocations((locations) => [...locations.filter((location) => location.id !== locationId), hitLocation]);

      const place = toSearchHitPlace(hitLocation);

      map.flyTo({ center: [longitude, latitude], zoom: 16, essential: true, speed: 1.5 });
      void map.once("moveend", () => {
        showPopup([longitude, latitude], place, null, null, "internal");
      });
    },
    [map, page, showPopup],
  );

  const locationCount = (page?.locations.length ?? 0) + searchedPoints.length;
  const totalCount = page?.total ?? 0;
  const radioLineCount = shownFilters.showRadiolines ? (radioLines?.length ?? 0) : 0;
  const radioLineTotalCount = shownFilters.showRadiolines ? (radioLinesResponse?.totalCount ?? 0) : 0;
  const listName = listData?.name;
  const listMapContext = useMemo(() => (listName !== undefined ? <ListMapContext name={listName} /> : undefined), [listName]);
  const isListLoading = isLoading || (isPaused && listData === undefined);
  const isListUnavailable = !isListLoading && !listData;
  const isListNotFound = !uuid || (listError instanceof ApiResponseError && LIST_UNAVAILABLE_STATUSES.has(listError.status));

  return (
    <>
      {popupContents}
      <MapSearchOverlay
        locationCount={locationCount}
        totalCount={totalCount}
        radioLineCount={radioLineCount}
        radioLineTotalCount={radioLineTotalCount}
        filters={shownFilters}
        mapCountries={mapCountries}
        zoom={zoom}
        activeMarker={activeMarker}
        onActiveMarkerClear={handleActiveMarkerClear}
        onFiltersChange={setSavedFilters}
        onLocationSelect={handleLocationSelect}
        onStationSelect={handleStationSelect}
        mapContext={listMapContext}
      />

      {isListLoading || isListUnavailable ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm">
          {isListLoading ? (
            <div role="status" className="flex items-center gap-2 rounded-xl bg-background px-4 py-3 text-sm text-muted-foreground shadow-lg">
              <Spinner />
              {t("common:actions.loading")}
            </div>
          ) : (
            <div className="w-full max-w-md rounded-xl bg-background shadow-lg">
              {isListNotFound ? (
                <ErrorState
                  tone="neutral"
                  icon={TaskRemove01Icon}
                  title={t("notFoundTitle")}
                  description={t("notFoundDescription")}
                  action={<MapLinkButton variant="outline" size="sm" />}
                />
              ) : (
                <ErrorState onRetry={() => refetch()} isRetrying={isFetching} />
              )}
            </div>
          )}
        </div>
      ) : null}

      <StationsLayer
        filters={shownFilters}
        savedFilters={savedFilters}
        onFiltersChange={setSavedFilters}
        points={points}
        wantAzimuths={wantAzimuths}
        onActiveMarkerChange={setActiveMarker}
        stationActions={stationActions}
        popupActions={popupActions}
        activePopupLocations={openLocations}
      />

      {shownFilters.showRadiolines && radioLines && radioLines.length > 0 ? (
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
    <LibreMap center={POLAND_CENTER} zoom={6} minZoom={5} className={preferences.navMode === "floating" ? FLOATING_NAV_MAP_OFFSET_CLASS : undefined}>
      <ListMapInner uuid={uuid} />
    </LibreMap>
  );
}
