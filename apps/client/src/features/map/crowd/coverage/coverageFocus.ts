import type { MapPoint } from "../../data/mapPoints";
import type { EstimatedSiteMarker } from "../sites/estimatedSites";
import type { MeasuredCoverageTarget } from "./coverageStore";

export function keepFocusedPoints(points: MapPoint[], target: MeasuredCoverageTarget | null): MapPoint[] {
  if (target === null) return points;
  if (target.kind === "estimatedSite") return [];
  return points.filter((point) => point.source === "internal" && point.stations.some((station) => station.id === target.stationId));
}

export function keepFocusedMarkers(markers: readonly EstimatedSiteMarker[], target: MeasuredCoverageTarget | null): readonly EstimatedSiteMarker[] {
  if (target === null) return markers;
  if (target.kind === "station") return [];
  return markers.filter((marker) => marker.entries.some((entry) => target.observedSiteIds.includes(entry.site.id)));
}
