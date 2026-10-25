import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";

import { COVERAGE_LAYER_ID, COVERAGE_SHAPES_SOURCE_ID, COVERAGE_SOURCE_ID } from "../../constants";
import { COVERAGE_MIN_ZOOM, COVERAGE_SOURCE_LAYER, getCoverageTileJsonUrl } from "../api/tiles";
import { useGeoJsonLayers } from "../layers/useGeoJsonLayers";
import { useVectorFillLayer } from "../layers/useVectorFillLayer";
import { SHOWN_SQUARE_OPACITY, cellLevelColor, levelColor, matchNumber, sinrColor } from "../style/expressions";
import { type CrowdTheme, getSectorColor } from "../style/palette";
import { COVERAGE_SHAPE_LAYERS, buildCoverageShapes } from "./coverageShapes";
import type { MeasuredCoverage } from "./coverageStore";
import type { MeasuredCoverageView } from "./coverageView";
import { useCoverageFootprintClicks } from "./useCoverageFootprintClicks";

type UseMeasuredCoverageLayersArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  coverage: MeasuredCoverage | null;
  view: MeasuredCoverageView | null;
  theme: CrowdTheme;
  isStaff: boolean;
  operatorColor: string;
  isPickingReceiver: boolean;
};

const NO_COLOR = "rgba(0,0,0,0)";
const FOCUS_ZOOM = 13;

function listTileCellIds(view: MeasuredCoverageView | null): number[] {
  if (view === null || view.band === null) return [];
  if (view.chosenCell !== null) return [view.chosenCell.record.id];
  return view.band.cells.map((cell) => cell.record.id);
}

function buildSquareColor(coverage: MeasuredCoverage | null, view: MeasuredCoverageView | null, theme: CrowdTheme): ExpressionSpecification {
  if (view?.chosenCell) return coverage?.colorBySinr ? sinrColor(theme) : levelColor(theme);
  const cells = view?.band?.cells ?? [];
  return matchNumber(
    "observedCellId",
    cells.map((cell) => [cell.record.id, cellLevelColor(getSectorColor(cell.colorIndex, theme))] as const),
    NO_COLOR,
  );
}

export function useMeasuredCoverageLayers({
  map,
  isLoaded,
  coverage,
  view,
  theme,
  isStaff,
  operatorColor,
  isPickingReceiver,
}: UseMeasuredCoverageLayersArgs) {
  const tileCellIds = listTileCellIds(view);
  const isOneCell = view !== null && view.chosenCell !== null;
  const focusedPlaceRef = useRef<string | null>(null);

  const squares = useVectorFillLayer({
    map,
    isLoaded,
    sourceId: COVERAGE_SOURCE_ID,
    layerId: COVERAGE_LAYER_ID,
    sourceLayer: COVERAGE_SOURCE_LAYER,
    level: "squares",
    tileJsonUrl: coverage !== null && tileCellIds.length > 0 ? getCoverageTileJsonUrl(tileCellIds, isStaff) : null,
    fillColor: buildSquareColor(coverage, view, theme),
    opacity: isOneCell ? SHOWN_SQUARE_OPACITY : 1,
  });

  useCoverageFootprintClicks({ map, isLoaded, isPickable: coverage !== null && !isOneCell && !isPickingReceiver });

  useGeoJsonLayers({
    map,
    isLoaded,
    sourceId: COVERAGE_SHAPES_SOURCE_ID,
    data: coverage === null || view === null ? null : buildCoverageShapes(coverage.target, view, theme, operatorColor),
    layers: COVERAGE_SHAPE_LAYERS,
    level: "marks",
  });

  const targetLatitude = coverage?.target.latitude;
  const targetLongitude = coverage?.target.longitude;
  useEffect(() => {
    if (targetLatitude === undefined || targetLongitude === undefined) {
      focusedPlaceRef.current = null;
      return;
    }
    if (!map || !isLoaded) return;
    const place = `${targetLatitude},${targetLongitude}`;
    if (focusedPlaceRef.current === place) return;
    focusedPlaceRef.current = place;
    const isInView = map.getBounds().contains([targetLongitude, targetLatitude]);
    if (isInView && map.getZoom() >= COVERAGE_MIN_ZOOM) return;
    map.easeTo({ center: [targetLongitude, targetLatitude], zoom: Math.max(map.getZoom(), FOCUS_ZOOM), essential: true });
  }, [map, isLoaded, targetLatitude, targetLongitude]);

  return squares;
}
