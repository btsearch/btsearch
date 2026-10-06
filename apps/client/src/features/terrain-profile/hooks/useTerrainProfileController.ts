import type { Brand, Operator } from "@openbts/shared/contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { findSelectedAntenna, getDirectionalAzimuth } from "../antennaSelection";
import { type TerrainFailureKind, isRetryableFailure, toFailureKind } from "../failures";
import { moveFocusFromProfileToMap } from "../focus";
import { type HoveredDistanceStore, createHoveredDistanceStore } from "../hoveredDistance";
import { type ProfileSummary, summarizeProfile } from "../profileSummary";
import {
  DEFAULT_RECEIVER_HEIGHT_METERS,
  type ReceiverRangeIssue,
  findReceiverRangeIssue,
  roundReceiverHeight,
  roundReceiverPoint,
} from "../receiverRange";
import { type TerrainProfileChoice, isSameChoice, terrainProfileReducer, toTerrainProfileRequest } from "../state";
import {
  type GeoPoint,
  type ReadyTerrainProfile,
  type TerrainProfileGpsError,
  type TerrainProfileRecord,
  type TerrainProfileRequest,
  type TerrainProfileStationTarget,
  isReadyTerrainProfile,
} from "../types";
import { type TerrainProfileAnalysis, getTerrainProfileQueryKey, useTerrainProfileAnalysis } from "./useTerrainProfileAnalysis";
import { useTerrainProfileLayer } from "./useTerrainProfileLayer";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { brandsQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";
import { getBrandColor, getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { useIsMobile } from "@/hooks/useMobile";

export type TerrainProfileMode = "placing" | "firstRun" | "calculating" | "ready" | "failed";

export type TerrainProfilePanelModel = {
  station: TerrainProfileStationTarget;
  brand: Brand | null;
  brandColor: string;
  mode: TerrainProfileMode;
  failure: TerrainFailureKind | null;
  canRetry: boolean;
  profile: ReadyTerrainProfile | null;
  summary: ProfileSummary | null;
  selectedAntennaKey: string | null;
  isAntennaAutomatic: boolean;
  receiverPoint: GeoPoint | null;
  receiverHeightMeters: number;
  isPickingPoint: boolean;
  isCollapsed: boolean;
  isLocating: boolean;
  gpsError: TerrainProfileGpsError | null;
  hover: HoveredDistanceStore;
  close: () => void;
  retry: () => void;
  locateReceiver: () => void;
  placeReceiver: (point: GeoPoint) => void;
  previewReceiver: (point: GeoPoint) => void;
  setReceiverHeight: (heightMeters: number) => void;
  selectAntenna: (antennaKey: string) => void;
  togglePointPick: () => void;
  cancelPointPick: () => void;
  setCollapsed: (isCollapsed: boolean) => void;
};

type TerrainProfileController = {
  start: (station: TerrainProfileStationTarget) => void;
  hasOpened: boolean;
  isPickingReceiver: boolean;
  panel: TerrainProfilePanelModel | null;
};

type UseTerrainProfileControllerArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
};

type CalculationPlan = {
  choice: TerrainProfileChoice | null;
  rangeIssue: ReceiverRangeIssue | null;
  request: TerrainProfileRequest | null;
};

type SettledAnalysis = Omit<TerrainProfileAnalysis, "retry"> & { isRestoringChoice: boolean };

type ShownProfile = {
  station: TerrainProfileStationTarget;
  choice: TerrainProfileChoice;
  profile: ReadyTerrainProfile;
};

type PanelDisplay = {
  mode: TerrainProfileMode;
  failure: TerrainFailureKind | null;
  currentProfile: ReadyTerrainProfile | null;
  shownProfile: ReadyTerrainProfile | null;
  summary: ProfileSummary | null;
};

type StationBrand = {
  brand: Brand | null;
  color: string;
};

const GPS_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 };
const GPS_MIN_ZOOM = 14;
const GPS_FLIGHT_MS = 900;

function getTerrainProfileGpsError(error: GeolocationPositionError): TerrainProfileGpsError {
  if (error.code === error.PERMISSION_DENIED) return "permissionDenied";
  if (error.code === error.POSITION_UNAVAILABLE) return "unavailable";
  if (error.code === error.TIMEOUT) return "timeout";
  return "unknown";
}

function planCalculation(
  station: TerrainProfileStationTarget | null,
  receiverPoint: GeoPoint | null,
  receiverHeightMeters: number,
  antennaKey: string | null,
): CalculationPlan {
  if (station === null || receiverPoint === null) return { choice: null, rangeIssue: null, request: null };

  const choice: TerrainProfileChoice = { receiverPoint, receiverHeightMeters, antennaKey };
  const rangeIssue = findReceiverRangeIssue(station, receiverPoint);
  return { choice, rangeIssue, request: rangeIssue === null ? toTerrainProfileRequest(station, choice) : null };
}

function canRestoreChoice(choice: TerrainProfileChoice | null, previousChoice: TerrainProfileChoice | null): boolean {
  return choice === null || previousChoice === null || !isSameChoice(choice, previousChoice);
}

function getPanelFailure(plan: CalculationPlan, analysis: SettledAnalysis): TerrainFailureKind | null {
  if (plan.rangeIssue !== null) return plan.rangeIssue;
  if (analysis.isCalculating || analysis.isRestoringChoice) return null;
  if (analysis.isCancelled) return "unknown";
  if (analysis.requestFailure !== null) return analysis.requestFailure;
  if (analysis.profile === null || isReadyTerrainProfile(analysis.profile)) return null;

  const reason = analysis.profile.failure?.reason;
  return reason === undefined ? "unknown" : toFailureKind(reason);
}

function derivePanelDisplay(plan: CalculationPlan, analysis: SettledAnalysis, previousProfile: ReadyTerrainProfile | null): PanelDisplay {
  if (plan.choice === null) return { mode: "placing", failure: null, currentProfile: null, shownProfile: null, summary: null };

  const failure = getPanelFailure(plan, analysis);
  if (failure !== null) return { mode: "failed", failure, currentProfile: null, shownProfile: null, summary: null };

  const { profile } = analysis;
  if (profile !== null && isReadyTerrainProfile(profile) && !analysis.isCalculating) {
    return { mode: "ready", failure: null, currentProfile: profile, shownProfile: profile, summary: summarizeProfile(profile.result) };
  }
  if (previousProfile === null) return { mode: "firstRun", failure: null, currentProfile: null, shownProfile: null, summary: null };

  const summary = summarizeProfile(previousProfile.result);
  return { mode: "calculating", failure: null, currentProfile: null, shownProfile: previousProfile, summary };
}

function findStationBrand(operators: readonly Operator[] | undefined, brands: readonly Brand[] | undefined, operatorId: number | null): StationBrand {
  const operator = operatorId === null ? undefined : operators?.find((entry) => entry.id === operatorId);
  const brand = getOperatorBrand(operator, brands);
  return { brand, color: getBrandColor(brand) };
}

function getWedgeAzimuth(profile: ReadyTerrainProfile | null, selectedAntennaKey: string | null): number | null {
  if (profile === null) return null;
  return getDirectionalAzimuth(findSelectedAntenna(profile, selectedAntennaKey));
}

export function useTerrainProfileController({ map, isLoaded }: UseTerrainProfileControllerArgs): TerrainProfileController {
  const [session, dispatch] = useReducer(terrainProfileReducer, null);
  const [hasOpened, setHasOpened] = useState(false);
  const [shown, setShown] = useState<ShownProfile | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsError, setGpsError] = useState<TerrainProfileGpsError | null>(null);
  const [hover] = useState(createHoveredDistanceStore);
  const gpsRequestRef = useRef(0);
  const isMobile = useIsMobile();
  const isMobileRef = useRef(isMobile);
  const queryClient = useQueryClient();
  const { focusTerrainProfileDialog } = useFloatingDialogStack();
  const { data: operators } = useQuery(operatorsQueryOptions());
  const { data: brands } = useQuery(brandsQueryOptions());

  const station = session?.station ?? null;
  const receiverPoint = session?.receiverPoint ?? null;
  const receiverHeightMeters = session?.receiverHeightMeters ?? DEFAULT_RECEIVER_HEIGHT_METERS;
  const antennaKey = session?.antennaKey ?? null;
  const operatorId = station?.operatorId ?? null;
  const previousProfile = shown !== null && shown.station === station ? shown.profile : null;
  const previousChoice = shown !== null && shown.station === station ? shown.choice : null;

  const plan = useMemo(
    () => planCalculation(station, receiverPoint, receiverHeightMeters, antennaKey),
    [station, receiverPoint, receiverHeightMeters, antennaKey],
  );
  const { profile: settledProfile, requestFailure, isCalculating, isCancelled, retry: retryRequest } = useTerrainProfileAnalysis(plan.request);
  const isRestoringChoice = isCancelled && canRestoreChoice(plan.choice, previousChoice);
  const display = useMemo(
    () => derivePanelDisplay(plan, { profile: settledProfile, requestFailure, isCalculating, isCancelled, isRestoringChoice }, previousProfile),
    [plan, settledProfile, requestFailure, isCalculating, isCancelled, isRestoringChoice, previousProfile],
  );
  const stationBrand = useMemo(() => findStationBrand(operators, brands, operatorId), [operators, brands, operatorId]);

  const { choice } = plan;
  const { failure, currentProfile, shownProfile } = display;
  const selectedAntennaKey = antennaKey ?? shownProfile?.antenna.key ?? null;
  const isPickingReceiver = session !== null && (session.receiverPoint === null || session.isPickingPoint);

  if (station !== null && choice !== null && currentProfile !== null && shown?.profile !== currentProfile) {
    setShown({ station, choice, profile: currentProfile });
  }

  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  useEffect(() => {
    if (isRestoringChoice) dispatch({ type: "restore_choice", choice: previousChoice });
  }, [isRestoringChoice, previousChoice]);

  const placeReceiver = useCallback((point: GeoPoint) => {
    gpsRequestRef.current += 1;
    setIsLocating(false);
    setGpsError(null);
    dispatch({ type: "place_receiver", point: roundReceiverPoint(point) });
  }, []);

  const { previewReceiver } = useTerrainProfileLayer({
    map,
    isLoaded,
    station,
    receiverPoint,
    profile: currentProfile,
    summary: currentProfile === null ? null : display.summary,
    wedgeAzimuth: getWedgeAzimuth(shownProfile, selectedAntennaKey),
    brandColor: stationBrand.color,
    isPickingReceiver,
    hover,
    onPlaceReceiver: placeReceiver,
  });

  const start = useCallback(
    (nextStation: TerrainProfileStationTarget) => {
      gpsRequestRef.current += 1;
      setIsLocating(false);
      setGpsError(null);
      setHasOpened(true);
      hover.clear();
      focusTerrainProfileDialog();
      dispatch({ type: "start", station: nextStation, startsCollapsed: isMobileRef.current });
    },
    [hover, focusTerrainProfileDialog],
  );

  const close = useCallback(() => {
    gpsRequestRef.current += 1;
    setIsLocating(false);
    setGpsError(null);
    hover.clear();
    moveFocusFromProfileToMap(map);
    dispatch({ type: "close" });
  }, [hover, map]);

  const locateReceiver = useCallback(() => {
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
        if (requestId !== gpsRequestRef.current) return;
        const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        map?.flyTo({ center: [point.longitude, point.latitude], zoom: Math.max(map.getZoom(), GPS_MIN_ZOOM), duration: GPS_FLIGHT_MS });
        placeReceiver(point);
      },
      (error) => {
        if (requestId !== gpsRequestRef.current) return;
        setIsLocating(false);
        setGpsError(getTerrainProfileGpsError(error));
      },
      GPS_OPTIONS,
    );
  }, [map, placeReceiver]);

  const selectAntenna = useCallback(
    (nextAntennaKey: string) => {
      if (station === null || choice === null) return;
      const automaticRequest = toTerrainProfileRequest(station, { ...choice, antennaKey: null });
      const automaticProfile = queryClient.getQueryData<TerrainProfileRecord>(getTerrainProfileQueryKey(automaticRequest));
      const isAutomaticChoice = automaticProfile?.antenna?.key === nextAntennaKey;
      dispatch({ type: "select_antenna", antennaKey: isAutomaticChoice ? null : nextAntennaKey });
    },
    [station, choice, queryClient],
  );

  const retry = useCallback(() => {
    if (failure === "antennaNotFound") dispatch({ type: "select_antenna", antennaKey: null });
    else retryRequest();
  }, [failure, retryRequest]);

  const setReceiverHeight = useCallback((heightMeters: number) => {
    dispatch({ type: "set_receiver_height", heightMeters: roundReceiverHeight(heightMeters) });
  }, []);
  const togglePointPick = useCallback(() => dispatch({ type: "toggle_point_pick" }), []);
  const cancelPointPick = useCallback(() => dispatch({ type: "cancel_point_pick" }), []);
  const setCollapsed = useCallback((isCollapsed: boolean) => dispatch({ type: "set_collapsed", isCollapsed }), []);

  const panel = useMemo<TerrainProfilePanelModel | null>(() => {
    if (session === null) return null;
    return {
      station: session.station,
      brand: stationBrand.brand,
      brandColor: stationBrand.color,
      mode: display.mode,
      failure: display.failure,
      canRetry: display.failure !== null && isRetryableFailure(display.failure),
      profile: display.shownProfile,
      summary: display.summary,
      selectedAntennaKey,
      isAntennaAutomatic: session.antennaKey === null,
      receiverPoint: session.receiverPoint,
      receiverHeightMeters: session.receiverHeightMeters,
      isPickingPoint: session.isPickingPoint,
      isCollapsed: session.isCollapsed,
      isLocating,
      gpsError,
      hover,
      close,
      retry,
      locateReceiver,
      placeReceiver,
      previewReceiver,
      setReceiverHeight,
      selectAntenna,
      togglePointPick,
      cancelPointPick,
      setCollapsed,
    };
  }, [
    session,
    stationBrand,
    display,
    selectedAntennaKey,
    isLocating,
    gpsError,
    hover,
    close,
    retry,
    locateReceiver,
    placeReceiver,
    previewReceiver,
    setReceiverHeight,
    selectAntenna,
    togglePointPick,
    cancelPointPick,
    setCollapsed,
  ]);

  return { start, hasOpened, isPickingReceiver, panel };
}
