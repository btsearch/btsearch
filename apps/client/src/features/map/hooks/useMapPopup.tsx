import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { type Map as MaplibreMap, Popup } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Root, createRoot } from "react-dom/client";

import { showApiError } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { LocationInfo, StationFilters, StationSource, StationWithoutCells, UkeStation } from "@/types/station";

import { fetchLocationWithStations, locationQueryKey } from "../api";
import { PopupContent } from "../components/popupContent";
import { toLocationInfo } from "../utils";

type UseMapPopupArgs = {
  map: MaplibreMap | null;
  showAddToList?: boolean;
  detailsFilters: StationFilters;
  filterStations?: (stations: StationWithoutCells[]) => StationWithoutCells[];
  onOpenStationDetails: (id: number, source: StationSource) => boolean | void;
  onOpenUkeStationDetails: (station: UkeStation) => boolean | void;
  onClose?: (location: MapPopupLocation) => void;
};

export type MapPopupLocation = { locationId: number; source: StationSource };

type PopupEntry = {
  popup: Popup;
  root: Root;
  location: LocationInfo;
  stations: StationWithoutCells[] | null;
  ukeStations: UkeStation[] | null;
  source: StationSource;
};

function getMapPopupKey({ locationId, source }: MapPopupLocation): string {
  return `${source}:${locationId}`;
}

type PopupLocationContentProps = {
  location: LocationInfo;
  initialStations: StationWithoutCells[] | null;
  ukeStations: UkeStation[] | null;
  source: StationSource;
  filters: StationFilters;
  filterStations?: (stations: StationWithoutCells[]) => StationWithoutCells[];
  showAddToList?: boolean;
  onOpenStationDetails: (id: number) => boolean | void;
  onOpenUkeStationDetails: (station: UkeStation) => boolean | void;
};

function PopupLocationContent({
  location,
  initialStations,
  ukeStations,
  source,
  filters,
  filterStations,
  showAddToList,
  onOpenStationDetails,
  onOpenUkeStationDetails,
}: PopupLocationContentProps) {
  const { data } = useQuery({
    queryKey: locationQueryKey(location.id, filters),
    queryFn: () => fetchLocationWithStations(location.id, filters),
    staleTime: 1000 * 60 * 2,
    enabled: source !== "uke",
    throwOnError: (error) => {
      showApiError(error);
      return false;
    },
  });

  const fetched = source !== "uke" && data?.id === location.id ? data : null;
  const fetchedStations = fetched ? (fetched.stations as StationWithoutCells[]) : null;
  const stations = fetchedStations ? (filterStations?.(fetchedStations) ?? fetchedStations) : initialStations;

  return (
    <PopupContent
      location={fetched ? toLocationInfo(fetched) : location}
      stations={stations}
      ukeStations={ukeStations ?? undefined}
      source={source}
      showAddToList={showAddToList}
      onOpenStationDetails={onOpenStationDetails}
      onOpenUkeStationDetails={onOpenUkeStationDetails}
    />
  );
}

type UseMapPopupReturn = {
  showPopup: (
    coordinates: [number, number],
    location: LocationInfo,
    stations: StationWithoutCells[] | null,
    ukeStations: UkeStation[] | null,
    source: StationSource,
  ) => void;
  openLocations: MapPopupLocation[];
  closePopups: (shouldClose: (location: MapPopupLocation) => boolean) => void;
  cleanup: () => void;
};

export function useMapPopup({
  map,
  showAddToList,
  detailsFilters,
  filterStations,
  onOpenStationDetails,
  onOpenUkeStationDetails,
  onClose,
}: UseMapPopupArgs): UseMapPopupReturn {
  const popupEntriesRef = useRef(new Map<string, PopupEntry>());
  const [openLocations, setOpenLocations] = useState<MapPopupLocation[]>([]);

  const renderEntry = useCallback(
    (entry: PopupEntry) => {
      entry.root.render(
        <QueryClientProvider client={queryClient}>
          <PopupLocationContent
            location={entry.location}
            initialStations={entry.stations}
            ukeStations={entry.ukeStations}
            source={entry.source}
            filters={detailsFilters}
            filterStations={filterStations}
            showAddToList={showAddToList}
            onOpenStationDetails={(id) => {
              const didOpen = onOpenStationDetails(id, entry.source);
              if (didOpen !== false) entry.popup.remove();
            }}
            onOpenUkeStationDetails={(station) => {
              const didOpen = onOpenUkeStationDetails(station);
              if (didOpen !== false) entry.popup.remove();
            }}
          />
        </QueryClientProvider>,
      );
    },
    [detailsFilters, filterStations, showAddToList, onOpenStationDetails, onOpenUkeStationDetails],
  );

  useEffect(() => {
    for (const entry of popupEntriesRef.current.values()) renderEntry(entry);
  }, [renderEntry]);

  const showPopup = useCallback(
    (
      coordinates: [number, number],
      location: LocationInfo,
      stations: StationWithoutCells[] | null,
      ukeStations: UkeStation[] | null,
      source: StationSource,
    ) => {
      if (!map) return;

      const popupLocation = { locationId: location.id, source };
      const popupKey = getMapPopupKey(popupLocation);
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
        closeButton: true,
        closeOnClick: false,
        maxWidth: "none",
        offset: 12,
      })
        .setLngLat(coordinates)
        .setDOMContent(container);
      container.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        popup.remove();
      });
      const entry: PopupEntry = { popup, root: createRoot(container), location, stations, ukeStations, source };

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
    [map, renderEntry, onClose],
  );

  const closePopups = useCallback((shouldClose: (location: MapPopupLocation) => boolean) => {
    for (const entry of [...popupEntriesRef.current.values()]) {
      if (shouldClose({ locationId: entry.location.id, source: entry.source })) entry.popup.remove();
    }
  }, []);

  const cleanup = useCallback(() => {
    const entries = [...popupEntriesRef.current.values()];
    popupEntriesRef.current.clear();
    setOpenLocations([]);
    for (const entry of entries) {
      entry.popup.remove();
      entry.root.unmount();
    }
  }, []);

  return { showPopup, openLocations, closePopups, cleanup };
}
