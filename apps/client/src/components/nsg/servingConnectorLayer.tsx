import type { Map as MaplibreMap } from "maplibre-gl";
import { memo, useCallback, useEffect, useRef } from "react";

import { useMap } from "@/components/ui/map";
import { getOperatorColor } from "@/lib/cellular/operators";
import { isValidLatLng } from "@/lib/nsg/geometry";
import { getNsgReplayPosition } from "@/lib/nsg/replayPosition";
import {
  type NsgAnalyzerResultsByKey,
  type NsgMatchedStation,
  type NsgServingCellSnapshot,
  resolveNsgReplayServingStation,
} from "@/lib/nsg/stationCorrelation";
import type { NsgLocation } from "@/lib/nsg/types";

import type { ReplayClock } from "./replayClock";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

type Connector = Readonly<{
  stationId: number;
  confidence: NsgMatchedStation["confidence"];
  color: string;
  station: [number, number];
  device: [number, number];
}>;

type ConnectorOverlay = { svg: SVGSVGElement; line: SVGLineElement };

type ServingConnectorLayerProps = {
  points: readonly NsgLocation[];
  selected: NsgLocation | null;
  clock: ReplayClock;
  servingTimeline: readonly NsgServingCellSnapshot[];
  fallbackTimestampMs: number | null;
  resultsByKey: NsgAnalyzerResultsByKey;
  activeStationRef: { current: NsgMatchedStation | null };
  visible: boolean;
};

function isSameConnector(previous: Connector | null, next: Connector | null): boolean {
  if (previous === null || next === null) return previous === next;
  return (
    previous.stationId === next.stationId &&
    previous.confidence === next.confidence &&
    previous.station[0] === next.station[0] &&
    previous.station[1] === next.station[1] &&
    previous.device[0] === next.device[0] &&
    previous.device[1] === next.device[1]
  );
}

function resolveConnector(activeStation: NsgMatchedStation | null, position: Pick<NsgLocation, "latitude" | "longitude"> | null): Connector | null {
  if (!activeStation || !position) return null;
  if (!isValidLatLng(position.latitude, position.longitude)) return null;
  const { longitude, latitude } = activeStation.station.location;
  if (!isValidLatLng(latitude, longitude)) return null;
  return {
    stationId: activeStation.station.id,
    confidence: activeStation.confidence,
    color: getOperatorColor(activeStation.station.operator.mnc),
    station: [longitude, latitude],
    device: [position.longitude, position.latitude],
  };
}

function getConnectorWidth(zoom: number): number {
  const fraction = Math.min(1, Math.max(0, (zoom - 8) / 8));
  return 1.5 + fraction * 1.5;
}

function createOverlay(map: MaplibreMap): ConnectorOverlay {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.dataset.testid = "nsg-serving-connector";
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;top:0;left:0;overflow:visible;pointer-events:none;visibility:hidden";
  const line = document.createElementNS(SVG_NAMESPACE, "line");
  line.setAttribute("stroke-linecap", "round");
  svg.appendChild(line);
  map.getCanvas().insertAdjacentElement("afterend", svg);
  return { svg, line };
}

function syncOverlaySize(map: MaplibreMap, overlay: ConnectorOverlay): void {
  const canvas = map.getCanvas();
  overlay.svg.setAttribute("width", String(canvas.clientWidth));
  overlay.svg.setAttribute("height", String(canvas.clientHeight));
}

function paintConnector(map: MaplibreMap, overlay: ConnectorOverlay, connector: Connector | null): void {
  const { svg, line } = overlay;
  if (connector === null) {
    svg.style.visibility = "hidden";
    return;
  }
  const device = map.project(connector.device);
  const station = map.project(connector.station);
  const width = getConnectorWidth(map.getZoom());
  const probable = connector.confidence === "probable";
  const dash = (width * 2).toFixed(1);
  line.setAttribute("x1", device.x.toFixed(1));
  line.setAttribute("y1", device.y.toFixed(1));
  line.setAttribute("x2", station.x.toFixed(1));
  line.setAttribute("y2", station.y.toFixed(1));
  line.setAttribute("stroke", connector.color);
  line.setAttribute("stroke-width", width.toFixed(2));
  line.setAttribute("stroke-opacity", probable ? "0.55" : "0.85");
  line.setAttribute("stroke-dasharray", probable ? `${dash} ${dash}` : "none");
  svg.dataset.stationId = String(connector.stationId);
  svg.style.visibility = "visible";
}

export const ServingConnectorLayer = memo(function ServingConnectorLayer({
  points,
  selected,
  clock,
  servingTimeline,
  fallbackTimestampMs,
  resultsByKey,
  activeStationRef,
  visible,
}: ServingConnectorLayerProps) {
  const { map } = useMap();
  const overlayRef = useRef<ConnectorOverlay | null>(null);
  const connectorRef = useRef<Connector | null>(null);

  const updateConnector = useCallback(
    (time: number | null) => {
      const timestampMs = time ?? fallbackTimestampMs;
      const activeStation = timestampMs === null ? null : resolveNsgReplayServingStation(servingTimeline, timestampMs, resultsByKey);
      activeStationRef.current = activeStation;
      const position = time === null ? selected : getNsgReplayPosition(points, time);
      const connector = visible ? resolveConnector(activeStation, position) : null;
      if (isSameConnector(connectorRef.current, connector)) return;
      connectorRef.current = connector;
      if (map && overlayRef.current) paintConnector(map, overlayRef.current, connector);
    },
    [activeStationRef, fallbackTimestampMs, map, points, resultsByKey, selected, servingTimeline, visible],
  );

  useEffect(() => {
    if (!map) return;
    const overlay = createOverlay(map);
    overlayRef.current = overlay;
    syncOverlaySize(map, overlay);
    paintConnector(map, overlay, connectorRef.current);
    const reposition = () => {
      if (connectorRef.current) paintConnector(map, overlay, connectorRef.current);
    };
    const resize = () => {
      syncOverlaySize(map, overlay);
      reposition();
    };
    map.on("move", reposition);
    map.on("resize", resize);

    return () => {
      map.off("move", reposition);
      map.off("resize", resize);
      overlay.svg.remove();
      overlayRef.current = null;
      connectorRef.current = null;
      activeStationRef.current = null;
    };
  }, [map, activeStationRef]);

  useEffect(() => {
    if (!map) return;
    const unsubscribe = clock.subscribe(updateConnector);
    updateConnector(clock.get());
    return unsubscribe;
  }, [map, clock, updateConnector]);

  return null;
});
