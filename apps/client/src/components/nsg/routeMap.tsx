import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { MapControls, Map as MapView, useMap } from "@/components/ui/map";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { MapCoordinates } from "@/features/map/components/mapCoordinates";
import { MapStyleSwitcher } from "@/features/map/components/search-overlay/mapStyleSwitcher";
import { FLOATING_NAV_MAP_OFFSET_CLASS, POINT_LAYER_ID, POLAND_CENTER } from "@/features/map/constants";
import { getMapVisibilityKeybind } from "@/features/map/filterKeybinds";
import { useMapKeybinds } from "@/features/map/hooks/useMapKeybinds";
import { usePreferences } from "@/hooks/usePreferences";
import { findClosestNsgRoutePoint, isValidLatLng } from "@/lib/nsg/geometry";
import { type NsgResolvedOperator, getNsgCellOperator } from "@/lib/nsg/operator";
import { getNsgReplayPosition } from "@/lib/nsg/replayPosition";
import {
  NSG_SIGNAL_BANDS,
  NSG_SIGNAL_UNKNOWN_COLOR,
  type NsgReplaySignal,
  type NsgSignalPoint,
  type NsgSignalTrail,
  getNsgReplaySignal,
} from "@/lib/nsg/signal";
import type { NsgAnalyzerResultsByKey, NsgMatchedStation, NsgServingCellSnapshot } from "@/lib/nsg/stationCorrelation";
import type { NsgCell, NsgLocation } from "@/lib/nsg/types";

import { formatDecibelValue, formatValue } from "./display";
import { OperatorName } from "./operatorName";
import type { ReplayClock } from "./replayClock";
import { SelectedMarker } from "./selectedMarker";
import { ServingConnectorLayer } from "./servingConnectorLayer";
import { NSG_SIGNAL_ROUTE_HITBOX_LAYER_ID, SignalRoute } from "./signalRoute";
import { StationsLayer } from "./stationsLayer";

const STATION_SYMBOL_LAYER_ID = `${POINT_LAYER_ID}-symbol`;
const STATION_LAYER_IDS = [POINT_LAYER_ID, STATION_SYMBOL_LAYER_ID] as const;

function formatSignalBandRange(minimumDbm: number | null, maximumDbm: number | null): string {
  if (minimumDbm === null) return `< ${maximumDbm}`;
  if (maximumDbm === null) return `≥ ${minimumDbm}`;
  return `${minimumDbm} <${maximumDbm}`;
}

function SignalReading({ dbm, className }: { dbm: number | null | undefined; className: string }) {
  return (
    <span className={className}>
      {formatDecibelValue(dbm)}
      {dbm !== null && dbm !== undefined ? " dBm" : ""}
    </span>
  );
}

type SignalLegendProps = {
  compact: boolean;
  dbm: number | null | undefined;
  color: string;
  operator: NsgResolvedOperator | null;
  signalSim: NsgSignalTrail["sim"];
};

function SignalLegend({ compact, dbm, color, operator, signalSim }: SignalLegendProps) {
  const { t } = useTranslation("nsg");
  const content = (
    <>
      <div className="mb-1.5">
        <OperatorName operator={operator} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">{t("map.signal")}</span>
        <SignalReading dbm={dbm} className="font-mono text-xs font-semibold tabular-nums" />
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {signalSim ? t("map.signalSim", { slot: formatValue(signalSim.slotId), subscription: formatValue(signalSim.subId) }) : t("map.signalNoSim")}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-foreground tabular-nums">
        {NSG_SIGNAL_BANDS.map((band) => (
          <div key={band.color} className="flex items-center gap-1.5 whitespace-nowrap font-mono">
            <span className="h-2.5 w-4 shrink-0 rounded-xs" style={{ backgroundColor: band.color }} />
            {formatSignalBandRange(band.minimumDbm, band.maximumDbm)}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 shrink-0 rounded-xs" style={{ backgroundColor: NSG_SIGNAL_UNKNOWN_COLOR }} />
          {t("map.noSignalData")}
        </div>
      </div>
    </>
  );

  if (!compact)
    return (
      <div className="pointer-events-auto w-64 max-w-full rounded-lg border bg-background px-3 py-2 shadow-xl" aria-label={t("map.signalLegend")}>
        {content}
      </div>
    );

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto border-border bg-background text-foreground shadow-xl dark:bg-background"
          />
        }
      >
        <span className="size-2.5 rounded-xs" style={{ backgroundColor: color }} />
        <SignalReading dbm={dbm} className="font-mono text-xs tabular-nums" />
        <span className="sr-only">{t("map.signalLegend")}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-0 bg-background p-3">
        <PopoverTitle className="sr-only">{t("map.signalLegend")}</PopoverTitle>
        {content}
      </PopoverContent>
    </Popover>
  );
}

type RouteControllerProps = {
  coordinates: [number, number][];
  fitCoordinates: [number, number][];
  routePoints: readonly NsgSignalPoint[];
  routeSimKey: string;
  selected: NsgLocation | null;
  fitRequest: number;
  replayActive: boolean;
  onSelectLocation: (location: NsgLocation) => void;
};

function RouteController({
  coordinates,
  fitCoordinates,
  routePoints,
  routeSimKey,
  selected,
  fitRequest,
  replayActive,
  onSelectLocation,
}: RouteControllerProps) {
  const { map, isLoaded } = useMap();
  const lastFit = useRef<{ map: typeof map; coordinates: typeof coordinates; request: number } | null>(null);
  const previousSelection = useRef<number | null>(null);
  const selection = useRef({ routePoints, routeSimKey, onSelectLocation });

  useEffect(() => {
    selection.current = { routePoints, routeSimKey, onSelectLocation };
  }, [routePoints, routeSimKey, onSelectLocation]);

  useEffect(() => {
    if (!map || !isLoaded || coordinates.length === 0) return;
    const fitted = lastFit.current;
    if (fitted?.map === map && fitted.coordinates === coordinates && fitted.request === fitRequest) return;
    const explicitFit = fitted?.map === map && fitted.coordinates === coordinates && fitted.request !== fitRequest;
    const targetCoordinates = explicitFit ? fitCoordinates : coordinates;
    lastFit.current = { map, coordinates, request: fitRequest };
    let west = targetCoordinates[0][0];
    let east = west;
    let south = targetCoordinates[0][1];
    let north = south;
    for (const [longitude, latitude] of targetCoordinates) {
      west = Math.min(west, longitude);
      east = Math.max(east, longitude);
      south = Math.min(south, latitude);
      north = Math.max(north, latitude);
    }
    previousSelection.current = null;
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 55, maxZoom: 16, duration: 0 },
    );
  }, [map, isLoaded, coordinates, fitCoordinates, fitRequest]);

  useEffect(() => {
    if (!map || !isLoaded || !selected || replayActive) return;
    const previous = previousSelection.current;
    previousSelection.current = selected.eventIndex;
    if (previous === null || previous === selected.eventIndex) return;
    map.panTo([selected.longitude, selected.latitude], { duration: 0 });
  }, [map, isLoaded, selected, replayActive]);

  useEffect(() => {
    if (!map || !isLoaded) return;
    const selectRoutePoint = (event: { point: { x: number; y: number } }) => {
      const { routePoints, routeSimKey, onSelectLocation } = selection.current;
      if (routePoints.length < 2) return;
      const blockingLayers = STATION_LAYER_IDS.filter((layerId) => map.getLayer(layerId) !== undefined);
      if (blockingLayers.length > 0 && map.queryRenderedFeatures([event.point.x, event.point.y], { layers: blockingLayers }).length > 0) return;
      if (!map.getLayer(NSG_SIGNAL_ROUTE_HITBOX_LAYER_ID)) return;
      if (
        map.queryRenderedFeatures([event.point.x, event.point.y], {
          layers: [NSG_SIGNAL_ROUTE_HITBOX_LAYER_ID],
          filter: ["==", ["get", "simKey"], routeSimKey],
        }).length === 0
      )
        return;
      const nearest = findClosestNsgRoutePoint(routePoints, event.point, (location) => map.project([location.longitude, location.latitude]));
      if (nearest) onSelectLocation(nearest.location);
    };
    map.on("click", selectRoutePoint);
    return () => {
      map.off("click", selectRoutePoint);
    };
  }, [map, isLoaded]);

  return null;
}

type RouteMapProps = {
  compact: boolean;
  points: NsgLocation[];
  selected: NsgLocation | null;
  signalTrail: NsgSignalTrail;
  signalTrails: ReadonlyMap<string, NsgSignalTrail>;
  signalSimKey: string;
  selectedOperator: NsgResolvedOperator | null;
  playheadMs: number | null;
  replayClock: ReplayClock;
  replayCells: readonly NsgCell[];
  onSelectLocation: (location: NsgLocation) => void;
  hasLog: boolean;
  operatorMncs: readonly number[];
  stationCorrelationKey: string | null;
  stationCorrelationResults: NsgAnalyzerResultsByKey;
  matchedStations: readonly NsgMatchedStation[];
  stationSourceMatches: readonly NsgMatchedStation[];
  servingTimeline: readonly NsgServingCellSnapshot[];
  servingFallbackTimestampMs: number | null;
};

export default function RouteMap({
  compact,
  points,
  selected,
  signalTrail,
  signalTrails,
  signalSimKey,
  selectedOperator,
  playheadMs,
  replayClock,
  replayCells,
  onSelectLocation,
  hasLog,
  operatorMncs,
  stationCorrelationKey,
  stationCorrelationResults,
  matchedStations,
  stationSourceMatches,
  servingTimeline,
  servingFallbackTimestampMs,
}: RouteMapProps) {
  const { t } = useTranslation("nsg");
  const { preferences, updatePreferences } = usePreferences();
  const [fitRequest, setFitRequest] = useState(0);
  const [fitStation, setFitStation] = useState<NsgMatchedStation | null>(null);
  const [showStations, setShowStations] = useState(true);
  const activeStationRef = useRef<NsgMatchedStation | null>(null);
  useMapKeybinds(({ key, shiftKey }) => {
    const visibility = getMapVisibilityKeybind(key, shiftKey);
    if (visibility === "stations") {
      setShowStations((visible) => !visible);
      return true;
    }
    if (visibility === "azimuths") {
      updatePreferences((current) => ({ showAzimuths: !current.showAzimuths }));
      return true;
    }
    return false;
  });
  const coordinates = useMemo<[number, number][]>(() => points.map((point) => [point.longitude, point.latitude]), [points]);
  const fitCoordinates = useMemo(() => {
    const result = [...coordinates];
    if (!showStations) return result;
    for (const match of matchedStations) {
      const { longitude, latitude } = match.station.location;
      if (isValidLatLng(latitude, longitude)) result.push([longitude, latitude]);
    }
    if (fitStation && !matchedStations.some((match) => match.station.id === fitStation.station.id)) {
      const { longitude, latitude } = fitStation.station.location;
      if (isValidLatLng(latitude, longitude)) result.push([longitude, latitude]);
    }
    return result;
  }, [coordinates, fitStation, matchedStations, showStations]);
  const pointIndex = useMemo(() => new Map(points.map((point, index) => [point, index])), [points]);
  let selectedSignal: NsgSignalPoint | NsgReplaySignal | undefined;
  if (playheadMs !== null) selectedSignal = getNsgReplaySignal(replayCells, playheadMs);
  else if (selected !== null) {
    const selectedIndex = pointIndex.get(selected);
    if (selectedIndex !== undefined) selectedSignal = signalTrail.points[selectedIndex];
  }
  const selectedPosition = playheadMs === null ? selected : getNsgReplayPosition(points, playheadMs);
  const operator = selectedSignal?.measurement ? getNsgCellOperator(selectedSignal.measurement) : selectedOperator;
  const activeRouteSimKey = signalTrails.has(signalSimKey) ? signalSimKey : "?:?";

  return (
    <MapView
      center={POLAND_CENTER}
      zoom={7}
      className={preferences.navMode === "floating" && !(compact && hasLog) ? FLOATING_NAV_MAP_OFFSET_CLASS : undefined}
    >
      <StationsLayer
        operatorMncs={operatorMncs}
        correlationKey={stationCorrelationKey}
        stationSourceMatches={stationSourceMatches}
        visible={showStations}
      />
      <SignalRoute trails={signalTrails} activeSimKey={activeRouteSimKey} beforeLayerIds={STATION_LAYER_IDS} />
      <ServingConnectorLayer
        points={points}
        selected={playheadMs === null ? selected : null}
        clock={replayClock}
        servingTimeline={servingTimeline}
        fallbackTimestampMs={servingFallbackTimestampMs}
        resultsByKey={stationCorrelationResults}
        activeStationRef={activeStationRef}
        visible={showStations}
      />
      <RouteController
        coordinates={coordinates}
        fitCoordinates={fitCoordinates}
        routePoints={signalTrail.points}
        routeSimKey={activeRouteSimKey}
        selected={selected}
        fitRequest={fitRequest}
        replayActive={playheadMs !== null}
        onSelectLocation={onSelectLocation}
      />
      <SelectedMarker
        points={points}
        selected={selected}
        playheadMs={playheadMs}
        clock={replayClock}
        color={selectedSignal?.color ?? NSG_SIGNAL_UNKNOWN_COLOR}
        title={t("map.selected")}
      />
      <div className="pointer-events-none absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-1.5">
        {selectedPosition ? (
          <MapCoordinates
            position={{ lat: selectedPosition.latitude, lng: selectedPosition.longitude }}
            gpsFormat={preferences.gpsFormat}
            className="pointer-events-auto max-w-full"
          />
        ) : null}
        {points.length === 0 && hasLog ? (
          <div className="max-w-full rounded-xl border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm">{t("map.empty")}</div>
        ) : null}
        {points.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto border-border bg-background text-foreground shadow-xl dark:border-border dark:bg-background dark:hover:bg-muted"
            onClick={() => {
              setFitStation(activeStationRef.current);
              setFitRequest((value) => value + 1);
            }}
          >
            {t("map.fit")}
          </Button>
        ) : null}
        <div className="pointer-events-auto relative hidden md:block">
          <MapStyleSwitcher />
        </div>
      </div>
      <div className="pointer-events-none absolute top-3 right-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-1.5">
        <div className="pointer-events-auto relative md:hidden">
          <MapStyleSwitcher position="search" />
        </div>
        {points.length > 0 ? (
          <SignalLegend
            compact={compact}
            dbm={selectedSignal?.dbm}
            color={selectedSignal?.color ?? NSG_SIGNAL_UNKNOWN_COLOR}
            operator={operator}
            signalSim={signalTrail.sim}
          />
        ) : null}
      </div>
      <MapControls showCompass showScale showFullscreen />
    </MapView>
  );
}
