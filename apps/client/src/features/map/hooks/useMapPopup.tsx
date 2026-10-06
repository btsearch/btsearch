import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { type MapMouseEvent, type Map as MaplibreMap, Popup } from "maplibre-gl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Root, createRoot } from "react-dom/client";

import { PopupContent, type PopupStationEntry } from "../components/popupContent";
import { POINT_LAYER_ID } from "../constants";
import type { MapFilters } from "../data/mapFilters";
import { type MapLookups, useMapLookups } from "../data/mapLookups";
import { type MapPlace, type MapPoint, type MapPointStation, type MapPopupStation, toMapPlace, toMapPopupStations } from "../data/mapPoints";
import { locationRecordQueryOptions, seedStationRecord } from "@/features/station-details/station/api";
import { toV1StationStatus } from "@/features/station-details/station/utils/stations";
import { queryClient } from "@/lib/queryClient";
import type { StationSource, UkeStation } from "@/types/station";

type UseMapPopupArgs = {
  map: MaplibreMap | null;
  showAddToList?: boolean;
  allowMultipleMapPopups: boolean;
  closeMapPopupsOnMapClick: boolean;
  statusFilter: MapFilters["status"];
  filterStations?: (stations: MapPopupStation[]) => MapPopupStation[];
  onOpenStationDetails: (id: number, source: StationSource, locationId?: number) => boolean | void;
  onOpenUkeStationDetails: (station: UkeStation) => boolean | void;
  onClose?: (location: MapPopupLocation) => void;
};

export type MapPopupLocation = { locationId: number; source: StationSource };

export type ShowMapPopup = (
  coordinates: [number, number],
  location: MapPlace,
  stations: readonly MapPointStation[] | null,
  ukeStations: readonly UkeStation[] | null,
  source: StationSource,
) => void;

export type FollowMapPoints = (pointsById: ReadonlyMap<number, MapPoint>) => void;

type PopupEntry = {
  popup: Popup;
  root: Root;
  container: HTMLElement;
  focusOrigin: HTMLElement | null;
  location: MapPlace;
  stations: readonly MapPointStation[] | null;
  ukeStations: readonly UkeStation[] | null;
  source: StationSource;
};

type PopupRenderInputs = {
  statusFilter: MapFilters["status"];
  lookups: MapLookups | undefined;
  hasLookupFailed: boolean;
  isRetryingLookups: boolean;
  retryLookups: () => void;
  filterStations: UseMapPopupArgs["filterStations"];
  showAddToList: UseMapPopupArgs["showAddToList"];
  onOpenStationDetails: UseMapPopupArgs["onOpenStationDetails"];
  onOpenUkeStationDetails: UseMapPopupArgs["onOpenUkeStationDetails"];
};

function getMapPopupKey({ locationId, source }: MapPopupLocation): string {
  return `${source}:${locationId}`;
}

function followsStatusFilter(entry: PopupEntry): boolean {
  return entry.source === "internal" && entry.stations === null;
}

function rememberFocusOrigin(entry: PopupEntry, event: FocusEvent): void {
  const previous = event.relatedTarget;
  if (entry.focusOrigin?.isConnected || !(previous instanceof HTMLElement) || entry.container.contains(previous)) return;
  if (event.target instanceof Element && event.target.matches(":focus-visible")) entry.focusOrigin = previous;
}

function hasKeyboardFocusInside(container: HTMLElement): boolean {
  const focused = document.activeElement;
  return focused !== null && container.contains(focused) && focused.matches(":focus-visible");
}

function closePopupFromInside(entry: PopupEntry, isKeyboardClose: boolean): void {
  entry.popup.remove();
  if (isKeyboardClose && entry.focusOrigin?.isConnected) entry.focusOrigin.focus();
}

function hasSameStationIds(left: readonly MapPointStation[], right: readonly MapPointStation[]): boolean {
  if (left.length !== right.length) return false;

  const leftIds = new Set(left.map((station) => station.id));
  return right.every((station) => leftIds.has(station.id));
}

function listEntriesAwaitingCells(stations: readonly MapPointStation[] | null): PopupStationEntry[] | null {
  if (stations === null) return null;
  return stations.map((station) => ({ ...station, cells: null }));
}

function listShownStations(
  locationStations: MapPopupStation[],
  markerStations: readonly MapPointStation[] | null,
  statusFilter: MapFilters["status"],
): MapPopupStation[] {
  if (markerStations !== null) {
    const markerStationIds = new Set(markerStations.map((station) => station.id));
    return locationStations.filter((station) => markerStationIds.has(station.id));
  }

  return locationStations.filter((station) => station.status !== null && statusFilter.includes(toV1StationStatus(station.status)));
}

type PopupLocationContentProps = {
  location: MapPlace;
  markerStations: readonly MapPointStation[] | null;
  ukeStations: readonly UkeStation[] | null;
  source: StationSource;
  statusFilter: MapFilters["status"];
  lookups: MapLookups | undefined;
  hasLookupFailed: boolean;
  isRetryingLookups: boolean;
  filterStations?: (stations: MapPopupStation[]) => MapPopupStation[];
  showAddToList?: boolean;
  onRetryLookups: () => void;
  onClose: () => void;
  onOpenStationDetails: (id: number) => boolean | void;
  onOpenUkeStationDetails: (station: UkeStation) => boolean | void;
};

function PopupLocationContent({
  location,
  markerStations,
  ukeStations,
  source,
  statusFilter,
  lookups,
  hasLookupFailed,
  isRetryingLookups,
  filterStations,
  showAddToList,
  onRetryLookups,
  onClose,
  onOpenStationDetails,
  onOpenUkeStationDetails,
}: PopupLocationContentProps) {
  const { data, isError, isFetching, refetch } = useQuery({
    ...locationRecordQueryOptions(location.id),
    enabled: source !== "uke",
  });

  const record = source === "uke" ? undefined : data;
  const hasRecordFailed = source !== "uke" && isError && record === undefined;
  const areLookupsUnavailable = source !== "uke" && lookups === undefined && hasLookupFailed;
  const locationStations = record === undefined || lookups === undefined ? null : toMapPopupStations(record, lookups);
  const shownStations = locationStations === null ? null : listShownStations(locationStations, markerStations, statusFilter);
  const loadedStations = shownStations === null ? null : (filterStations?.(shownStations) ?? shownStations);

  function retryFailedRequests() {
    if (hasRecordFailed) void refetch();
    if (areLookupsUnavailable) onRetryLookups();
  }

  return (
    <PopupContent
      location={record === undefined || lookups === undefined ? location : toMapPlace(record, lookups)}
      stations={loadedStations ?? listEntriesAwaitingCells(markerStations)}
      locationStations={locationStations}
      ukeStations={ukeStations}
      lookups={lookups}
      source={source}
      showAddToList={showAddToList}
      loadFailed={hasRecordFailed || areLookupsUnavailable}
      isRetrying={(hasRecordFailed && isFetching) || (areLookupsUnavailable && isRetryingLookups)}
      onRetry={retryFailedRequests}
      onClose={onClose}
      onOpenStationDetails={onOpenStationDetails}
      onOpenUkeStationDetails={onOpenUkeStationDetails}
    />
  );
}

type UseMapPopupReturn = {
  showPopup: ShowMapPopup;
  followPoints: FollowMapPoints;
  openLocations: MapPopupLocation[];
  closePopups: (shouldClose: (location: MapPopupLocation) => boolean) => void;
  cleanup: () => void;
};

export function useMapPopup({
  map,
  showAddToList,
  allowMultipleMapPopups,
  closeMapPopupsOnMapClick,
  statusFilter,
  filterStations,
  onOpenStationDetails,
  onOpenUkeStationDetails,
  onClose,
}: UseMapPopupArgs): UseMapPopupReturn {
  const popupEntriesRef = useRef(new Map<string, PopupEntry>());
  const [openLocations, setOpenLocations] = useState<MapPopupLocation[]>([]);
  const { lookups, isError: hasLookupFailed, isRetrying: isRetryingLookups, retry: retryLookups } = useMapLookups();
  const renderInputs: PopupRenderInputs = {
    statusFilter,
    lookups,
    hasLookupFailed,
    isRetryingLookups,
    retryLookups,
    filterStations,
    showAddToList,
    onOpenStationDetails,
    onOpenUkeStationDetails,
  };
  const renderInputsRef = useRef(renderInputs);

  useLayoutEffect(() => {
    renderInputsRef.current = renderInputs;
  });

  const renderEntry = useCallback((entry: PopupEntry) => {
    const inputs = renderInputsRef.current;

    entry.root.render(
      <QueryClientProvider client={queryClient}>
        <PopupLocationContent
          location={entry.location}
          markerStations={entry.stations}
          ukeStations={entry.ukeStations}
          source={entry.source}
          statusFilter={inputs.statusFilter}
          lookups={inputs.lookups}
          hasLookupFailed={inputs.hasLookupFailed}
          isRetryingLookups={inputs.isRetryingLookups}
          filterStations={inputs.filterStations}
          showAddToList={inputs.showAddToList}
          onRetryLookups={() => renderInputsRef.current.retryLookups()}
          onClose={() => closePopupFromInside(entry, hasKeyboardFocusInside(entry.container))}
          onOpenStationDetails={(id) => {
            const locationId = entry.source === "internal" ? entry.location.id : undefined;
            if (locationId !== undefined) seedStationRecord(queryClient, locationId, id);
            const didOpen = renderInputsRef.current.onOpenStationDetails(id, entry.source, locationId);
            if (didOpen !== false) closePopupFromInside(entry, hasKeyboardFocusInside(entry.container));
          }}
          onOpenUkeStationDetails={(station) => {
            const didOpen = renderInputsRef.current.onOpenUkeStationDetails(station);
            if (didOpen !== false) closePopupFromInside(entry, hasKeyboardFocusInside(entry.container));
          }}
        />
      </QueryClientProvider>,
    );
  }, []);

  useEffect(() => {
    for (const entry of popupEntriesRef.current.values()) renderEntry(entry);
  }, [renderEntry, lookups, hasLookupFailed, isRetryingLookups, filterStations, showAddToList]);

  useEffect(() => {
    for (const entry of popupEntriesRef.current.values()) {
      if (followsStatusFilter(entry)) renderEntry(entry);
    }
  }, [renderEntry, statusFilter]);

  const showPopup: ShowMapPopup = useCallback(
    (coordinates, location, stations, ukeStations, source) => {
      if (!map) return;

      const popupLocation = { locationId: location.id, source };
      const popupKey = getMapPopupKey(popupLocation);
      if (!allowMultipleMapPopups) {
        for (const [key, entry] of popupEntriesRef.current) {
          if (key === popupKey) continue;
          entry.popup.remove();
        }
      }

      const existingEntry = popupEntriesRef.current.get(popupKey);
      if (existingEntry) {
        Object.assign(existingEntry, { location, stations, ukeStations, source });
        existingEntry.popup.setLngLat(coordinates);
        renderEntry(existingEntry);
        return;
      }

      const container = document.createElement("div");
      container.className = "station-popup-container outline-none";
      container.tabIndex = -1;

      const popup = new Popup({
        className: "station-map-popup",
        closeButton: false,
        closeOnClick: false,
        maxWidth: "none",
        offset: 12,
      })
        .setLngLat(coordinates)
        .setDOMContent(container);
      const entry: PopupEntry = { popup, root: createRoot(container), container, focusOrigin: null, location, stations, ukeStations, source };
      container.addEventListener("focusin", (event) => rememberFocusOrigin(entry, event));
      container.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        closePopupFromInside(entry, true);
      });

      popupEntriesRef.current.set(popupKey, entry);
      renderEntry(entry);
      setOpenLocations((locations) => [...locations, popupLocation]);

      void popup.once("close", () => {
        if (popupEntriesRef.current.get(popupKey) !== entry) return;
        popupEntriesRef.current.delete(popupKey);
        setOpenLocations((locations) => locations.filter((location) => getMapPopupKey(location) !== popupKey));
        onClose?.(popupLocation);
        queueMicrotask(() => entry.root.unmount());
      });

      popup.addTo(map);
    },
    [map, allowMultipleMapPopups, renderEntry, onClose],
  );

  const followPoints: FollowMapPoints = useCallback(
    (pointsById) => {
      for (const entry of popupEntriesRef.current.values()) {
        if (entry.source !== "internal" || entry.stations === null) continue;

        const point = pointsById.get(entry.location.id);
        if (point === undefined || point.source !== "internal" || point.isUnlisted || point.stations.length === 0) continue;
        if (hasSameStationIds(entry.stations, point.stations)) continue;

        entry.stations = point.stations;
        renderEntry(entry);
      }
    },
    [renderEntry],
  );

  const closePopups = useCallback((shouldClose: (location: MapPopupLocation) => boolean) => {
    for (const entry of popupEntriesRef.current.values()) {
      if (shouldClose({ locationId: entry.location.id, source: entry.source })) entry.popup.remove();
    }
  }, []);

  useEffect(() => {
    if (!map || !closeMapPopupsOnMapClick) return;

    const handleMapClick = (event: MapMouseEvent) => {
      if (popupEntriesRef.current.size === 0) return;
      const layers = [POINT_LAYER_ID, `${POINT_LAYER_ID}-symbol`].filter((id) => map.getLayer(id));
      if (layers.length > 0 && map.queryRenderedFeatures(event.point, { layers }).length > 0) return;
      closePopups(() => true);
    };

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [map, closeMapPopupsOnMapClick, closePopups]);

  const cleanup = useCallback(() => {
    const entries = [...popupEntriesRef.current.values()];
    popupEntriesRef.current.clear();
    setOpenLocations([]);
    for (const entry of entries) {
      entry.popup.remove();
      queueMicrotask(() => entry.root.unmount());
    }
  }, []);

  return { showPopup, followPoints, openLocations, closePopups, cleanup };
}
