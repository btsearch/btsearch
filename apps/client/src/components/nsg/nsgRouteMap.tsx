import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { MapControls, Map as MapView, useMap } from "@/components/ui/map";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { MapCoordinates } from "@/features/map/components/mapCoordinates";
import { MapStyleSwitcher } from "@/features/map/components/search-overlay/mapStyleSwitcher";
import { FLOATING_NAV_MAP_OFFSET_CLASS, POLAND_CENTER } from "@/features/map/constants";
import { usePreferences } from "@/hooks/usePreferences";
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
import type { NsgCell, NsgLocation } from "@/lib/nsg/types";

import { formatValue } from "./display";
import { NsgOperatorName } from "./nsgOperatorName";
import type { NsgReplayClock } from "./nsgReplayClock";
import { NsgSelectedMarker } from "./nsgSelectedMarker";
import { NSG_SIGNAL_ROUTE_LAYER_ID, NsgSignalRoute } from "./nsgSignalRoute";

function formatSignalBandRange(minimumDbm: number | null, maximumDbm: number | null): string {
  if (minimumDbm === null) return `< ${maximumDbm}`;
  if (maximumDbm === null) return `≥ ${minimumDbm}`;
  return `${minimumDbm}…<${maximumDbm}`;
}

function RouteController({
  coordinates,
  points,
  selected,
  fitRequest,
  replayActive,
  onSelectLocation,
}: {
  coordinates: [number, number][];
  points: NsgLocation[];
  selected: NsgLocation | null;
  fitRequest: number;
  replayActive: boolean;
  onSelectLocation: (location: NsgLocation) => void;
}) {
  const { map, isLoaded } = useMap();
  const lastFit = useRef<{ map: typeof map; coordinates: typeof coordinates; request: number } | null>(null);
  const previousSelection = useRef<number | null>(null);

  useEffect(() => {
    if (!map || !isLoaded || coordinates.length === 0) return;
    const fitted = lastFit.current;
    if (fitted?.map === map && fitted.coordinates === coordinates && fitted.request === fitRequest) return;
    lastFit.current = { map, coordinates, request: fitRequest };
    let west = coordinates[0][0];
    let east = west;
    let south = coordinates[0][1];
    let north = south;
    for (const [longitude, latitude] of coordinates) {
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
  }, [map, isLoaded, coordinates, fitRequest]);

  useEffect(() => {
    if (!map || !isLoaded || !selected || replayActive) return;
    const previous = previousSelection.current;
    previousSelection.current = selected.eventIndex;
    if (previous === null || previous === selected.eventIndex) return;
    map.panTo([selected.longitude, selected.latitude], { duration: 0 });
  }, [map, isLoaded, selected, replayActive]);

  useEffect(() => {
    if (!map || !isLoaded || points.length === 0) return;
    const selectRoutePoint = (event: { point: { x: number; y: number }; lngLat: { lng: number; lat: number } }) => {
      if (!map.getLayer(NSG_SIGNAL_ROUTE_LAYER_ID)) return;
      if (map.queryRenderedFeatures([event.point.x, event.point.y], { layers: [NSG_SIGNAL_ROUTE_LAYER_ID] }).length === 0) return;
      let nearest = points[0];
      let shortestDistance = Infinity;
      for (const point of points) {
        const projected = map.project([point.longitude, point.latitude]);
        const distance = (projected.x - event.point.x) ** 2 + (projected.y - event.point.y) ** 2;
        if (distance < shortestDistance) {
          nearest = point;
          shortestDistance = distance;
        }
      }
      onSelectLocation(nearest);
    };
    map.on("click", selectRoutePoint);
    return () => {
      map.off("click", selectRoutePoint);
    };
  }, [map, isLoaded, points, onSelectLocation]);

  return null;
}

export default function NsgRouteMap({
  compact,
  points,
  selected,
  signalTrail,
  selectedOperator,
  playheadMs,
  replayClock,
  replayCells,
  onSelectLocation,
  hasLog,
}: {
  compact: boolean;
  points: NsgLocation[];
  selected: NsgLocation | null;
  signalTrail: NsgSignalTrail;
  selectedOperator: NsgResolvedOperator | null;
  playheadMs: number | null;
  replayClock: NsgReplayClock;
  replayCells: readonly NsgCell[];
  onSelectLocation: (location: NsgLocation) => void;
  hasLog: boolean;
}) {
  const { t } = useTranslation("nsg");
  const { preferences } = usePreferences();
  const [fitRequest, setFitRequest] = useState(0);
  const coordinates = useMemo<[number, number][]>(() => points.map((point) => [point.longitude, point.latitude]), [points]);
  const signalByLocation = useMemo(() => new Map(signalTrail.points.map((point) => [point.location, point])), [signalTrail.points]);
  let selectedSignal: NsgSignalPoint | NsgReplaySignal | undefined;
  if (playheadMs !== null) selectedSignal = getNsgReplaySignal(replayCells, playheadMs);
  else if (selected !== null) selectedSignal = signalByLocation.get(selected);
  const selectedPosition = playheadMs === null ? selected : getNsgReplayPosition(points, playheadMs);
  const operator = selectedSignal?.measurement ? getNsgCellOperator(selectedSignal.measurement) : selectedOperator;

  const legendContent = (
    <>
      <div className="mb-1.5">
        <NsgOperatorName operator={operator} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">{t("map.signal")}</span>
        <span className="font-mono text-xs font-semibold tabular-nums">
          {formatValue(selectedSignal?.dbm)}
          {selectedSignal?.dbm !== null && selectedSignal?.dbm !== undefined ? " dBm" : ""}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {signalTrail.sim
          ? t("map.signalSim", { slot: formatValue(signalTrail.sim.slotId), subscription: formatValue(signalTrail.sim.subId) })
          : t("map.signalNoSim")}
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

  return (
    <MapView
      center={POLAND_CENTER}
      zoom={7}
      className={preferences.navMode === "floating" && !(compact && hasLog) ? FLOATING_NAV_MAP_OFFSET_CLASS : undefined}
    >
      <NsgSignalRoute points={signalTrail.points} />
      <RouteController
        coordinates={coordinates}
        points={points}
        selected={selected}
        fitRequest={fitRequest}
        replayActive={playheadMs !== null}
        onSelectLocation={onSelectLocation}
      />
      <NsgSelectedMarker
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
            onClick={() => setFitRequest((value) => value + 1)}
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
          compact ? (
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
                <span className="size-2.5 rounded-xs" style={{ backgroundColor: selectedSignal?.color ?? NSG_SIGNAL_UNKNOWN_COLOR }} />
                <span className="text-xs">{t("map.signal")}</span>
                <span className="font-mono text-xs tabular-nums">
                  {formatValue(selectedSignal?.dbm)}
                  {selectedSignal?.dbm !== null && selectedSignal?.dbm !== undefined ? " dBm" : ""}
                </span>
                <span className="sr-only">{t("map.signalLegend")}</span>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 gap-0 bg-background p-3">
                <PopoverTitle className="sr-only">{t("map.signalLegend")}</PopoverTitle>
                {legendContent}
              </PopoverContent>
            </Popover>
          ) : (
            <div
              className="pointer-events-auto w-64 max-w-full rounded-lg border bg-background px-3 py-2 shadow-xl"
              aria-label={t("map.signalLegend")}
            >
              {legendContent}
            </div>
          )
        ) : null}
      </div>
      <MapControls showCompass showScale showFullscreen />
    </MapView>
  );
}
