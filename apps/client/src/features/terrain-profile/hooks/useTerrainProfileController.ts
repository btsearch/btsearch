import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useReducer, useRef, useState } from "react";

import { selectTerrainProfileAntenna } from "../antennaSelection";
import { DEFAULT_RECEIVER_HEIGHT_AGL_M, INITIAL_TERRAIN_PROFILE_STATE, terrainProfileReducer } from "../state";
import type { TerrainProfileGpsError, TerrainProfileReceiver, TerrainProfileStationTarget } from "../types";
import { useTerrainProfileAnalysis } from "./useTerrainProfileAnalysis";
import { useTerrainProfileLayer } from "./useTerrainProfileLayer";

function getTerrainProfileGpsError(error: GeolocationPositionError): TerrainProfileGpsError {
  if (error.code === error.PERMISSION_DENIED) return "permissionDenied";
  if (error.code === error.POSITION_UNAVAILABLE) return "unavailable";
  if (error.code === error.TIMEOUT) return "timeout";
  return "unknown";
}

type UseTerrainProfileControllerArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
};

export function useTerrainProfileController({ map, isLoaded }: UseTerrainProfileControllerArgs) {
  const [state, dispatch] = useReducer(terrainProfileReducer, INITIAL_TERRAIN_PROFILE_STATE);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsError, setGpsError] = useState<TerrainProfileGpsError | null>(null);
  const openRef = useRef(state.isOpen);
  const receiverHeightRef = useRef(state.receiver?.mountedHeight ?? DEFAULT_RECEIVER_HEIGHT_AGL_M);
  const gpsRequestRef = useRef(0);

  openRef.current = state.isOpen;
  receiverHeightRef.current = state.receiver?.mountedHeight ?? DEFAULT_RECEIVER_HEIGHT_AGL_M;

  const seedReceiverFromMapCenter = useCallback(() => {
    if (state.receiver !== null || !map) return;
    const center = map.getCenter();
    dispatch({
      type: "set_receiver",
      receiver: { latitude: center.lat, longitude: center.lng, mountedHeight: DEFAULT_RECEIVER_HEIGHT_AGL_M },
    });
  }, [map, state.receiver]);

  const close = useCallback(() => {
    openRef.current = false;
    gpsRequestRef.current += 1;
    setIsLocating(false);
    setGpsError(null);
    dispatch({ type: "close" });
  }, []);

  const start = useCallback(
    (station: TerrainProfileStationTarget) => {
      openRef.current = true;
      setGpsError(null);
      seedReceiverFromMapCenter();
      dispatch({ type: "set_station", station });
    },
    [seedReceiverFromMapCenter],
  );

  const setReceiverCoordinates = useCallback((coordinates: Pick<TerrainProfileReceiver, "latitude" | "longitude">) => {
    if (!openRef.current) return;
    gpsRequestRef.current += 1;
    setIsLocating(false);
    setGpsError(null);
    dispatch({
      type: "set_receiver",
      receiver: {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        mountedHeight: receiverHeightRef.current,
      },
    });
  }, []);

  const useCurrentLocation = useCallback(() => {
    const requestId = gpsRequestRef.current + 1;
    gpsRequestRef.current = requestId;
    if (!("geolocation" in navigator)) {
      setIsLocating(false);
      setGpsError("unsupported");
      return;
    }
    setIsLocating(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== gpsRequestRef.current || !openRef.current) return;
        setIsLocating(false);
        const coords = { longitude: position.coords.longitude, latitude: position.coords.latitude };
        map?.flyTo({ center: [coords.longitude, coords.latitude], zoom: Math.max(map.getZoom(), 14), duration: 900 });
        setReceiverCoordinates(coords);
      },
      (error) => {
        if (requestId !== gpsRequestRef.current || !openRef.current) return;
        setIsLocating(false);
        setGpsError(getTerrainProfileGpsError(error));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }, [map, setReceiverCoordinates]);

  const handleReceiverDragEnd = useCallback(
    ({ lng, lat }: { lng: number; lat: number }) => setReceiverCoordinates({ longitude: lng, latitude: lat }),
    [setReceiverCoordinates],
  );

  const setReceiverHeight = useCallback(
    (mountedHeight: number) => {
      if (state.receiver === null) return;
      dispatch({ type: "set_receiver", receiver: { ...state.receiver, mountedHeight } });
    },
    [state.receiver],
  );

  const setAntenna = useCallback((antennaKey: string) => dispatch({ type: "set_antenna", antennaKey, origin: "manual" }), []);
  const retry = useCallback(() => dispatch({ type: "retry" }), []);

  const { analysis, isStarting, isPolling, error } = useTerrainProfileAnalysis({
    enabled: state.isOpen,
    station: state.station,
    receiver: state.receiver,
    antennaKey: state.antennaKey,
    revision: state.analysisRevision,
  });

  const [autoSelectedId, setAutoSelectedId] = useState<string | undefined>();
  if (
    state.isOpen &&
    analysis?.status === "selection_required" &&
    state.receiver !== null &&
    state.antennaKey === undefined &&
    analysis.analysis_id !== autoSelectedId
  ) {
    const candidate = selectTerrainProfileAntenna(analysis.candidates, analysis.station, state.receiver);
    if (candidate !== undefined) {
      setAutoSelectedId(analysis.analysis_id);
      dispatch({ type: "set_antenna", antennaKey: candidate.key, origin: "auto" });
    }
  }

  const setHoveredSample = useTerrainProfileLayer({
    map,
    isLoaded,
    enabled: state.isOpen,
    station: state.station,
    receiver: state.receiver,
    analysis,
  });

  return {
    isOpen: state.isOpen,
    station: state.station,
    receiver: state.receiver,
    antennaKey: state.antennaKey,
    analysis,
    isWorking: isStarting || isPolling,
    error,
    isLocating,
    gpsError,
    close,
    start,
    retry,
    setAntenna,
    setReceiverCoordinates,
    setReceiverHeight,
    handleReceiverDragEnd,
    useCurrentLocation,
    setHoveredSample,
  };
}
