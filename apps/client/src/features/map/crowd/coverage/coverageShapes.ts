import { destinationPoint } from "@openbts/shared/geo";
import type { Feature, FeatureCollection } from "geojson";

import {
  COVERAGE_FADED_LAYER_ID,
  COVERAGE_FOOTPRINT_FILL_LAYER_ID,
  COVERAGE_FOOTPRINT_LINE_LAYER_ID,
  COVERAGE_HANDED_OVER_LAYER_ID,
  COVERAGE_OTHER_LAYER_LAYER_ID,
  COVERAGE_SHAPES_SOURCE_ID,
  COVERAGE_WEDGE_LAYER_ID,
} from "../../constants";
import { LAYER_FADE } from "../layers/layerFade";
import type { GeoJsonLayer } from "../layers/useGeoJsonLayers";
import { type CrowdTheme, EDGE_COLORS, getSectorColor, toRgba } from "../style/palette";
import type { MeasuredCoverageTarget } from "./coverageStore";
import type { MeasuredCoverageCell, MeasuredCoverageView } from "./coverageView";

type EdgeKind = "handedOver" | "faded" | "otherLayer";

const WEDGE_KIND = "wedge";
const FOOTPRINT_KIND = "footprint";
const FOOTPRINT_FILL_OPACITY = 0.08;
const FOOTPRINT_LINE_OPACITY = 0.7;
const FOOTPRINT_LINE_WIDTH = 1;
const WEDGE_HALF_SPREAD_DEGREES = 30;
const WEDGE_STEP_DEGREES = 5;
const WEDGE_LENGTH_METERS = 350;
const WEDGE_FILL_ALPHA = 0.24;
const WEDGE_OUTLINE_ALPHA = 0.7;
const EDGE_WIDTH = 1.75;
const EDGE_KINDS: readonly EdgeKind[] = ["handedOver", "faded", "otherLayer"];
const EDGE_DASHES: Record<EdgeKind, number[] | null> = { handedOver: null, faded: [3.5, 2.5], otherLayer: [0.05, 2.5] };
const EDGE_LAYER_IDS: Record<EdgeKind, string> = {
  handedOver: COVERAGE_HANDED_OVER_LAYER_ID,
  faded: COVERAGE_FADED_LAYER_ID,
  otherLayer: COVERAGE_OTHER_LAYER_LAYER_ID,
};

function isDrawnEdge(kind: string): kind is EdgeKind {
  return EDGE_KINDS.some((edgeKind) => edgeKind === kind);
}

function ringArea(ring: readonly [number, number][]): number {
  const doubledArea = ring.reduce((sum, [x1, y1], index) => {
    const [x2, y2] = ring[(index + 1) % ring.length] ?? [x1, y1];
    return sum + x1 * y2 - x2 * y1;
  }, 0);
  return Math.abs(doubledArea) / 2;
}

function buildFootprint(cell: MeasuredCoverageCell, color: string): Feature | null {
  const { footprint } = cell.record;
  if (footprint === null || footprint === undefined) return null;
  return {
    type: "Feature",
    geometry: footprint,
    properties: { kind: FOOTPRINT_KIND, color, observedCellId: cell.record.id, area: ringArea(footprint.coordinates[0] ?? []) },
  };
}

function buildWedge(cell: MeasuredCoverageCell, latitude: number, longitude: number, color: string): Feature | null {
  if (cell.record.geometry !== null || cell.sectorAzimuth === null) return null;
  const ring: [number, number][] = [[longitude, latitude]];
  for (let offset = -WEDGE_HALF_SPREAD_DEGREES; offset <= WEDGE_HALF_SPREAD_DEGREES; offset += WEDGE_STEP_DEGREES) {
    const [pointLatitude, pointLongitude] = destinationPoint(latitude, longitude, cell.sectorAzimuth + offset, WEDGE_LENGTH_METERS);
    ring.push([pointLongitude, pointLatitude]);
  }
  ring.push([longitude, latitude]);
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: { kind: WEDGE_KIND, fill: toRgba(color, WEDGE_FILL_ALPHA), outline: toRgba(color, WEDGE_OUTLINE_ALPHA) },
  };
}

export function buildCoverageShapes(
  target: MeasuredCoverageTarget,
  view: MeasuredCoverageView,
  theme: CrowdTheme,
  operatorColor: string,
): FeatureCollection | null {
  if (view.band === null) return null;
  const { latitude, longitude } = target;
  const chosen = view.chosenCell;
  const cells = chosen === null ? view.band.cells : [chosen];
  const edgeColor = EDGE_COLORS[theme];
  const features = cells.flatMap((cell): Feature[] => {
    const edges = (chosen === null ? [] : (cell.record.edges ?? [])).flatMap((edge): Feature[] =>
      isDrawnEdge(edge.kind) ? [{ type: "Feature", geometry: edge.geometry, properties: { kind: edge.kind, color: edgeColor } }] : [],
    );
    const footprint = buildFootprint(cell, chosen === null ? getSectorColor(cell.colorIndex, theme) : edgeColor);
    const wedge = buildWedge(cell, latitude, longitude, operatorColor);
    return [footprint, ...edges, wedge].filter((feature) => feature !== null);
  });
  return { type: "FeatureCollection", features };
}

export const COVERAGE_SHAPE_LAYERS: GeoJsonLayer[] = [
  {
    spec: {
      id: COVERAGE_FOOTPRINT_FILL_LAYER_ID,
      type: "fill",
      source: COVERAGE_SHAPES_SOURCE_ID,
      filter: ["==", ["get", "kind"], FOOTPRINT_KIND],
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0, "fill-opacity-transition": LAYER_FADE },
    },
    fade: { id: COVERAGE_FOOTPRINT_FILL_LAYER_ID, property: "fill-opacity", opacity: FOOTPRINT_FILL_OPACITY },
  },
  {
    spec: {
      id: COVERAGE_FOOTPRINT_LINE_LAYER_ID,
      type: "line",
      source: COVERAGE_SHAPES_SOURCE_ID,
      filter: ["==", ["get", "kind"], FOOTPRINT_KIND],
      layout: { "line-join": "round" },
      paint: { "line-color": ["get", "color"], "line-width": FOOTPRINT_LINE_WIDTH, "line-opacity": 0, "line-opacity-transition": LAYER_FADE },
    },
    fade: { id: COVERAGE_FOOTPRINT_LINE_LAYER_ID, property: "line-opacity", opacity: FOOTPRINT_LINE_OPACITY },
  },
  {
    spec: {
      id: COVERAGE_WEDGE_LAYER_ID,
      type: "fill",
      source: COVERAGE_SHAPES_SOURCE_ID,
      filter: ["==", ["get", "kind"], WEDGE_KIND],
      paint: { "fill-color": ["get", "fill"], "fill-outline-color": ["get", "outline"], "fill-opacity": 0, "fill-opacity-transition": LAYER_FADE },
    },
    fade: { id: COVERAGE_WEDGE_LAYER_ID, property: "fill-opacity", opacity: 1 },
  },
  ...EDGE_KINDS.map((kind): GeoJsonLayer => {
    const dashes = EDGE_DASHES[kind];
    return {
      spec: {
        id: EDGE_LAYER_IDS[kind],
        type: "line",
        source: COVERAGE_SHAPES_SOURCE_ID,
        filter: ["==", ["get", "kind"], kind],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": EDGE_WIDTH,
          ...(dashes === null ? {} : { "line-dasharray": dashes }),
          "line-opacity": 0,
          "line-opacity-transition": LAYER_FADE,
        },
      },
      fade: { id: EDGE_LAYER_IDS[kind], property: "line-opacity", opacity: 1 },
    };
  }),
];
