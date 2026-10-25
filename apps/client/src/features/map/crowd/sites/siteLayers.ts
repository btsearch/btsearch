import { destinationPoint } from "@openbts/shared/geo";
import type { FeatureCollection } from "geojson";

import {
  ESTIMATED_SITES_LAYER_ID,
  ESTIMATED_SITES_SOURCE_ID,
  ESTIMATED_SITE_AREA_FILL_LAYER_ID,
  ESTIMATED_SITE_AREA_LINE_LAYER_ID,
  ESTIMATED_SITE_AREA_SOURCE_ID,
} from "../../constants";
import { LAYER_FADE } from "../layers/layerFade";
import type { GeoJsonLayer } from "../layers/useGeoJsonLayers";
import type { EstimatedSiteMarker } from "./estimatedSites";

const AREA_STEP_DEGREES = 5;
const AREA_FILL_OPACITY = 0.1;
const AREA_LINE_OPACITY = 0.55;
const AREA_LINE_WIDTH = 1.5;
const FULL_TURN_DEGREES = 360;

export const RING_LAYERS: GeoJsonLayer[] = [
  {
    spec: {
      id: ESTIMATED_SITES_LAYER_ID,
      type: "symbol",
      source: ESTIMATED_SITES_SOURCE_ID,
      layout: { "icon-image": ["get", "ringImageId"], "icon-allow-overlap": true, "icon-ignore-placement": true },
      paint: { "icon-opacity": 0, "icon-opacity-transition": LAYER_FADE },
    },
    fade: { id: ESTIMATED_SITES_LAYER_ID, property: "icon-opacity", opacity: 1 },
  },
];

export const AREA_LAYERS: GeoJsonLayer[] = [
  {
    spec: {
      id: ESTIMATED_SITE_AREA_FILL_LAYER_ID,
      type: "fill",
      source: ESTIMATED_SITE_AREA_SOURCE_ID,
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0, "fill-opacity-transition": LAYER_FADE },
    },
    fade: { id: ESTIMATED_SITE_AREA_FILL_LAYER_ID, property: "fill-opacity", opacity: AREA_FILL_OPACITY },
  },
  {
    spec: {
      id: ESTIMATED_SITE_AREA_LINE_LAYER_ID,
      type: "line",
      source: ESTIMATED_SITE_AREA_SOURCE_ID,
      paint: { "line-color": ["get", "color"], "line-width": AREA_LINE_WIDTH, "line-opacity": 0, "line-opacity-transition": LAYER_FADE },
    },
    fade: { id: ESTIMATED_SITE_AREA_LINE_LAYER_ID, property: "line-opacity", opacity: AREA_LINE_OPACITY },
  },
];

export function toRingFeatures(markers: readonly EstimatedSiteMarker[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: markers.map((marker) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [marker.longitude, marker.latitude] },
      properties: { key: marker.key, ringImageId: marker.ringImageId },
    })),
  };
}

export function toAreaFeatures(marker: EstimatedSiteMarker): FeatureCollection | null {
  const placement = marker.entries[0].site.placement;
  if (placement?.kind !== "fit") return null;
  const ring: [number, number][] = [];
  for (let bearing = 0; bearing <= FULL_TURN_DEGREES; bearing += AREA_STEP_DEGREES) {
    const [latitude, longitude] = destinationPoint(marker.latitude, marker.longitude, bearing, placement.radiusMeters);
    ring.push([longitude, latitude]);
  }
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: { color: marker.ring.colors[0] } }],
  };
}
