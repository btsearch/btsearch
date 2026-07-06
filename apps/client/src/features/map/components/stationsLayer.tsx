import { useQueryClient } from "@tanstack/react-query";
import type { MapMouseEvent } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useMap } from "@/components/ui/map";
import { fetchStation, fetchUkePermit } from "@/features/station-details/api";
import { usePreferences } from "@/hooks/usePreferences";
import { showApiError } from "@/lib/api";
import { getOperatorColor } from "@/lib/operatorUtils";
import type {
  LocationInfo,
  LocationWithStations,
  StationFilters,
  StationSource,
  StationWithoutCells,
  UkeLocationWithPermits,
  UkeStation,
} from "@/types/station";

import type { LocationsResponse } from "../api";
import { fetchLocationWithStations } from "../api";
import { PLANNED_PEM_LAYER_ID, POINT_LAYER_ID } from "../constants";
import { locationsToGeoJSON, ukeLocationsToGeoJSON } from "../geojson";
import { useAzimuthLayer } from "../hooks/useAzimuthLayer";
import { useHeatmapLayer } from "../hooks/useHeatmapLayer";
import { useMapLayer } from "../hooks/useMapLayer";
import { usePlannedMeasurementsLayer } from "../hooks/usePlannedMeasurementsLayer";
import { useUrlSync } from "../hooks/useURLSync";
import { attachUkeLocationToStations, groupPermitsByStation, toLocationInfo } from "../utils";
import { StationHoverTooltipContent } from "./stationHoverTooltipContent";

const EMPTY_GEOJSON = { type: "FeatureCollection" as const, features: [] };
const EMPTY_UKE_LOCATIONS: UkeLocationWithPermits[] = [];
const EMPTY_INTERNAL_LOCATIONS: LocationWithStations[] = [];
const EMPTY_BLOCKED_LAYERS: string[] = [];
const PLANNED_PEM_BLOCKED_LAYERS = [PLANNED_PEM_LAYER_ID];

export function locationQueryKey(locationId: number, filters: StationFilters) {
  return ["location", locationId, filters] as const;
}

export const DEFAULT_FILTERS: StationFilters = {
  operators: [],
  bands: [],
  rat: [],
  status: ["published"],
  source: "internal",
  recentDays: null,
  recentDateFields: ["createdAt"],
  showStations: true,
  showRadiolines: false,
  radiolineOperators: [],
  showHeatmap: false,
  showPlannedMeasurements: false,
};

const MAP_FILTERS_STORAGE_KEY = "map:filters";

export function saveMapFilters(filters: StationFilters) {
  try {
    localStorage.setItem(MAP_FILTERS_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // ignore localStorage errors
  }
}

export function loadMapFilters(): StationFilters | null {
  try {
    const raw = localStorage.getItem(MAP_FILTERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      operators: parsed.operators ?? [],
      bands: parsed.bands ?? [],
      rat: parsed.rat ?? [],
      status: parsed.status ?? ["published"],
      source: parsed.source ?? "internal",
      recentDays: parsed.recentDays ?? null,
      recentDateFields: parsed.recentDateFields ?? ["createdAt"],
      showStations: parsed.showStations ?? true,
      showRadiolines: parsed.showRadiolines ?? false,
      radiolineOperators: parsed.radiolineOperators ?? [],
      showHeatmap: parsed.showHeatmap ?? false,
      showPlannedMeasurements: parsed.showPlannedMeasurements ?? false,
    };
  } catch {
    return null;
  }
}

type ShowPopupFn = (
  coordinates: [number, number],
  location: LocationInfo,
  stations: StationWithoutCells[] | null,
  ukeStations: UkeStation[] | null,
  source: StationSource,
) => void;

type UpdatePopupStationsFn = (location: LocationInfo, stations: StationWithoutCells[], source: StationSource) => void;

type PopupActions = {
  show: ShowPopupFn;
  updateStations: UpdatePopupStationsFn;
  cleanup: () => void;
  setLocation: (popup: { locationId: number; source: StationSource }) => void;
};

type StationActions = {
  openDetails: (id: number, source: StationSource) => boolean | void;
  openUkeDetails: (station: UkeStation) => boolean | void;
};

type StationsLayerProps = {
  filters: StationFilters;
  onFiltersChange: (filters: StationFilters) => void;
  locationsResponse: LocationsResponse | undefined;
  zoom: number;
  onActiveMarkerChange: (marker: { latitude: number; longitude: number } | null) => void;
  stationActions: StationActions;
  popupActions: PopupActions;
  onRadiolineIdFromUrl?: (id: number) => void;
  activePopupLocationId?: number | null;
  useZabkaMarkers?: boolean;
};

export function StationsLayer({
  filters,
  onFiltersChange,
  locationsResponse,
  zoom,
  onActiveMarkerChange,
  stationActions,
  popupActions,
  onRadiolineIdFromUrl,
  activePopupLocationId,
  useZabkaMarkers = false,
}: StationsLayerProps) {
  const { map, isLoaded } = useMap();
  const { preferences } = usePreferences();
  const queryClient = useQueryClient();
  const pendingStationId = useRef<number | string | undefined>(null);
  const pendingLocationId = useRef<number | null>(null);
  const pendingUkeLocationId = useRef<number | null>(null);

  const { show: showPopup, cleanup: cleanupPopup, setLocation: onPopupLocationChange } = popupActions;
  const { openDetails: onOpenStationDetails, openUkeDetails: onOpenUkeStationDetails } = stationActions;

  const handleUrlInitialize = useCallback(
    async ({
      filters: urlFilters,
      stationId,
      locationId,
      radiolineId,
    }: {
      filters?: StationFilters;
      stationId?: string;
      locationId?: number;
      radiolineId?: number;
    }) => {
      if (urlFilters) {
        onFiltersChange(urlFilters);
      }
      const activeFilters = urlFilters ?? filters;

      if (stationId && map) {
        pendingStationId.current = stationId;
        const stationPromise =
          activeFilters.source === "uke"
            ? fetchUkePermit(stationId).then((permits) => {
                const ukeStation = groupPermitsByStation(permits ?? [])[0];
                if (ukeStation?.location?.latitude && ukeStation?.location?.longitude) {
                  map.flyTo({
                    center: [ukeStation.location.longitude, ukeStation.location.latitude],
                    zoom: 16,
                    essential: true,
                    speed: 1.5,
                  });
                  onOpenUkeStationDetails(ukeStation);
                }
              })
            : fetchStation(Number(stationId)).then((station) => {
                if (station.location?.latitude && station.location?.longitude) {
                  map.flyTo({
                    center: [station.location.longitude, station.location.latitude],
                    zoom: 16,
                    essential: true,
                    speed: 1.5,
                  });
                  onOpenStationDetails(Number(stationId), "internal");
                }
              });
        stationPromise
          .catch((error) => {
            console.error("Failed to fetch shared station:", error);
            showApiError(error);
          })
          .finally(() => {
            pendingStationId.current = null;
          });
      } else if (radiolineId) onRadiolineIdFromUrl?.(radiolineId);
      else if (locationId && map) {
        if (activeFilters.source === "uke") {
          pendingUkeLocationId.current = locationId;
          return;
        }

        pendingLocationId.current = locationId;
        queryClient
          .fetchQuery({
            queryKey: locationQueryKey(locationId, activeFilters),
            queryFn: () => fetchLocationWithStations(locationId, activeFilters),
            staleTime: 1000 * 60 * 2,
          })
          .then((locationData) => {
            const location = toLocationInfo(locationData);
            map.flyTo({
              center: [location.longitude, location.latitude],
              zoom: 16,
              essential: true,
              speed: 1.5,
            });
            return new Promise<typeof locationData>((resolve) => map.once("moveend", () => resolve(locationData)));
          })
          .then((locationData) => {
            const location = toLocationInfo(locationData);
            showPopup([location.longitude, location.latitude], location, locationData.stations as StationWithoutCells[], null, activeFilters.source);
            onPopupLocationChange({ locationId, source: activeFilters.source });
          })
          .catch((error) => {
            console.error("Failed to fetch shared location:", error);
            showApiError(error);
          })
          .finally(() => {
            pendingLocationId.current = null;
          });
      }
    },
    [
      queryClient,
      map,
      filters,
      showPopup,
      onFiltersChange,
      onOpenStationDetails,
      onOpenUkeStationDetails,
      onRadiolineIdFromUrl,
      onPopupLocationChange,
    ],
  );

  useUrlSync({
    map,
    isLoaded,
    filters,
    onInitialize: handleUrlInitialize,
  });

  const locations = useMemo(() => locationsResponse?.data ?? [], [locationsResponse]);
  const locationById = useMemo(
    () => new Map<number, LocationWithStations | UkeLocationWithPermits>(locations.map((location) => [location.id, location])),
    [locations],
  );

  const geoJSON = useMemo(() => {
    if (!filters.showStations && !filters.showHeatmap) return EMPTY_GEOJSON;
    return filters.source === "uke"
      ? ukeLocationsToGeoJSON(locations as unknown as UkeLocationWithPermits[], filters.source)
      : locationsToGeoJSON(locations, filters.source);
  }, [locations, filters.source, filters.showStations, filters.showHeatmap]);

  useEffect(() => {
    if (!map || !isLoaded) return;

    const apply = () => {
      const visibility = filters.showStations ? "visible" : "none";
      if (map.getLayer(POINT_LAYER_ID)) map.setLayoutProperty(POINT_LAYER_ID, "visibility", visibility);
      if (map.getLayer(`${POINT_LAYER_ID}-symbol`)) map.setLayoutProperty(`${POINT_LAYER_ID}-symbol`, "visibility", visibility);
    };

    apply();
    map.on("styledata", apply);
    return () => {
      map.off("styledata", apply);
    };
  }, [map, isLoaded, filters.showStations]);

  useEffect(() => {
    const locationId = pendingUkeLocationId.current;
    if (!locationId || !map || filters.source !== "uke" || locations.length === 0) return;

    const ukeLocation = locationById.get(locationId) as UkeLocationWithPermits | undefined;
    if (!ukeLocation) return;

    pendingUkeLocationId.current = null;

    const location: LocationInfo = {
      id: ukeLocation.id,
      city: ukeLocation.city ?? undefined,
      address: ukeLocation.address ?? undefined,
      region: ukeLocation.region?.name,
      latitude: ukeLocation.latitude,
      longitude: ukeLocation.longitude,
    };

    showPopup(
      [location.longitude, location.latitude],
      location,
      null,
      attachUkeLocationToStations(ukeLocation.stations ?? [], ukeLocation),
      filters.source,
    );
    onPopupLocationChange({ locationId, source: filters.source });
  }, [map, locations, filters.source, showPopup, onPopupLocationChange, locationById]);

  const handleFeatureMouseDown = useCallback(
    (locationId: number) => {
      if (filters.source === "uke") return;
      void queryClient.prefetchQuery({
        queryKey: locationQueryKey(locationId, filters),
        queryFn: () => fetchLocationWithStations(locationId, filters),
        staleTime: 1000 * 60 * 2,
      });
    },
    [queryClient, filters],
  );

  const handleFeatureClick = useCallback(
    (data: { coordinates: [number, number]; locationId: number; city?: string; address?: string; source: string }) => {
      const { coordinates, locationId, city, address, source } = data;
      const [lng, lat] = coordinates;

      if (source === "uke") {
        const ukeLocation = locationById.get(locationId) as UkeLocationWithPermits | undefined;
        showPopup(
          coordinates,
          { id: locationId, city, address, region: ukeLocation?.region?.name, latitude: lat, longitude: lng },
          null,
          attachUkeLocationToStations(ukeLocation?.stations ?? [], ukeLocation),
          source as StationSource,
        );
        onPopupLocationChange({ locationId, source: source as StationSource });
        return;
      }

      const locationData = locationById.get(locationId) as LocationWithStations | undefined;
      const location: LocationInfo = {
        id: locationId,
        city: locationData?.city ?? city,
        address: locationData?.address ?? address,
        region: locationData?.region?.name,
        latitude: lat,
        longitude: lng,
      };

      showPopup(coordinates, location, locationData?.stations ?? null, null, source as StationSource);
      onPopupLocationChange({ locationId, source: source as StationSource });
    },
    [locationById, showPopup, onPopupLocationChange],
  );

  const handleFeatureContextMenu = useCallback(
    async (data: { coordinates: [number, number]; locationId: number; city?: string; address?: string; source: string }) => {
      const { coordinates } = data;
      const [lng, lat] = coordinates;
      onActiveMarkerChange({ latitude: lat, longitude: lng });
    },
    [onActiveMarkerChange],
  );

  const renderHoverTooltip = useCallback(
    (data: { locationId: number; city?: string; address?: string; source: string }) => {
      if (data.locationId === activePopupLocationId) return null;

      const isUke = data.source === "uke";

      let entries: Array<{ name: string; color: string; stationId: string }>;
      if (isUke) {
        const ukeLocation = locationById.get(data.locationId) as UkeLocationWithPermits | undefined;
        if (!ukeLocation?.stations?.length) return null;
        entries = ukeLocation.stations.map((s) => ({
          name: s.operator?.name || "Unknown",
          color: s.operator?.mnc ? getOperatorColor(s.operator.mnc) : "#3b82f6",
          stationId: s.station_id,
        }));
      } else {
        const locationData = locationById.get(data.locationId) as LocationWithStations | undefined;
        if (!locationData?.stations?.length) return null;
        entries = locationData.stations.map((s) => ({
          name: s.operator?.name || "Unknown",
          color: s.operator?.mnc ? getOperatorColor(s.operator.mnc) : "#3b82f6",
          stationId: s.station_id,
        }));
      }

      if (entries.length === 0) return null;

      const region = isUke
        ? (locationById.get(data.locationId) as UkeLocationWithPermits | undefined)?.region?.name
        : (locationById.get(data.locationId) as LocationWithStations | undefined)?.region?.name;

      return <StationHoverTooltipContent city={data.city} address={data.address} region={region} stations={entries} />;
    },
    [locationById, activePopupLocationId],
  );

  useMapLayer({
    map,
    isLoaded,
    geoJSON,
    onFeatureClick: handleFeatureClick,
    onFeatureContextMenu: handleFeatureContextMenu,
    onFeatureMouseDown: handleFeatureMouseDown,
    renderHoverTooltip: preferences.showMapHoverTooltip ? renderHoverTooltip : undefined,
    pointStyle: preferences.mapPointStyle,
    useZabkaMarkers,
    blockedByLayers: filters.showPlannedMeasurements ? PLANNED_PEM_BLOCKED_LAYERS : EMPTY_BLOCKED_LAYERS,
  });

  useHeatmapLayer({ map, isLoaded, enabled: filters.showHeatmap, showStations: filters.showStations });
  usePlannedMeasurementsLayer({ map, isLoaded, enabled: filters.showPlannedMeasurements, operators: filters.operators });

  const azimuthEnabled = preferences.showAzimuths && zoom >= preferences.azimuthsMinZoom;
  useAzimuthLayer({
    map,
    isLoaded,
    locations: azimuthEnabled && filters.source === "internal" ? (locations as unknown as LocationWithStations[]) : EMPTY_INTERNAL_LOCATIONS,
    ukeLocations: azimuthEnabled && filters.source === "uke" ? (locations as unknown as UkeLocationWithPermits[]) : EMPTY_UKE_LOCATIONS,
    enabled: azimuthEnabled,
    minZoom: preferences.azimuthsMinZoom,
    lineLength: preferences.azimuthLineLength,
    spread: preferences.azimuthSpread,
  });

  useEffect(() => cleanupPopup, [cleanupPopup]);

  const onActiveMarkerChangeRef = useRef(onActiveMarkerChange);
  const mapRightClickMeasureRef = useRef(preferences.mapRightClickMeasure);
  useEffect(() => {
    onActiveMarkerChangeRef.current = onActiveMarkerChange;
  }, [onActiveMarkerChange]);
  useEffect(() => {
    mapRightClickMeasureRef.current = preferences.mapRightClickMeasure;
  }, [preferences.mapRightClickMeasure]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onActiveMarkerChangeRef.current(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!map) return;

    const handleContextMenu = (e: MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [POINT_LAYER_ID, `${POINT_LAYER_ID}-symbol`] });
      if (features.length === 0) {
        if (mapRightClickMeasureRef.current) {
          onActiveMarkerChangeRef.current({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
        } else {
          onActiveMarkerChangeRef.current(null);
        }
      }
    };

    map.on("contextmenu", handleContextMenu);
    return () => {
      map.off("contextmenu", handleContextMenu);
    };
  }, [map]);

  if (!isLoaded) return null;

  return null;
}
