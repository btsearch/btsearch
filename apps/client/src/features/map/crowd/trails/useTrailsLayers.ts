import type { Band } from "@openbts/shared/contract";
import type { CellRat } from "@openbts/shared/contract/constants";
import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";

import { MY_TRAILS_LAYER_ID, MY_TRAILS_SOURCE_ID, TRAILS_LAYER_ID, TRAILS_SOURCE_ID } from "../../constants";
import { UNKNOWN_BAND_LABEL } from "../../data/mapFilters";
import { listBandIdsByLabels } from "../../data/mapLookups";
import { TRAILS_SOURCE_LAYER, type TrailTiles, getTrailTileJsonUrl } from "../api/tiles";
import { useVectorFillLayer } from "../layers/useVectorFillLayer";
import { SHOWN_SQUARE_OPACITY, levelColor, myTrailColor } from "../style/expressions";
import type { CrowdTheme } from "../style/palette";

type UseTrailsLayersArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  theme: CrowdTheme;
  tiles: TrailTiles | null;
  bandLabels: readonly number[];
  bands: readonly Band[] | undefined;
  rats: readonly CellRat[];
};

type TrailFilter = ExpressionSpecification | boolean;

const NOTHING_SHOWN: TrailFilter = false;

function ratFilter(rats: readonly CellRat[]): TrailFilter | null {
  return rats.length > 0 ? ["in", ["get", "rat"], ["literal", [...rats]]] : null;
}

function bandFilter(labels: readonly number[], bands: readonly Band[] | undefined): TrailFilter | null {
  if (labels.length === 0) return null;
  const knownLabels = labels.filter((label) => label !== UNKNOWN_BAND_LABEL);
  if (knownLabels.length > 0 && bands === undefined) return NOTHING_SHOWN;

  const bandIds = knownLabels.length > 0 && bands !== undefined ? listBandIdsByLabels(bands, knownLabels) : [];
  const conditions: ExpressionSpecification[] = [];
  if (bandIds.length > 0) conditions.push(["in", ["get", "bandId"], ["literal", bandIds]]);
  if (knownLabels.length < labels.length) conditions.push(["!", ["has", "bandId"]]);
  return conditions.length > 0 ? ["any", ...conditions] : NOTHING_SHOWN;
}

function combineFilters(filters: readonly (TrailFilter | null)[]): TrailFilter | undefined {
  const shown = filters.filter((filter): filter is TrailFilter => filter !== null);
  if (shown.length === 0) return undefined;
  return shown.length === 1 ? shown[0] : ["all", ...shown];
}

export function useTrailsLayers({ map, isLoaded, theme, tiles, bandLabels, bands, rats }: UseTrailsLayersArgs) {
  const isMine = tiles?.kind === "mine";
  const byRat = ratFilter(rats);

  const publicTrails = useVectorFillLayer({
    map,
    isLoaded,
    sourceId: TRAILS_SOURCE_ID,
    layerId: TRAILS_LAYER_ID,
    sourceLayer: TRAILS_SOURCE_LAYER,
    level: "squares",
    tileJsonUrl: tiles !== null && !isMine ? getTrailTileJsonUrl(tiles) : null,
    fillColor: levelColor(theme),
    opacity: SHOWN_SQUARE_OPACITY,
    filter: combineFilters([byRat, bandFilter(bandLabels, bands)]),
    sortKey: ["get", "level"],
  });
  const myTrails = useVectorFillLayer({
    map,
    isLoaded,
    sourceId: MY_TRAILS_SOURCE_ID,
    layerId: MY_TRAILS_LAYER_ID,
    sourceLayer: TRAILS_SOURCE_LAYER,
    level: "squares",
    tileJsonUrl: tiles !== null && isMine ? getTrailTileJsonUrl(tiles) : null,
    fillColor: myTrailColor(theme),
    opacity: 1,
    filter: combineFilters([byRat]),
    sortKey: ["get", "samples"],
  });

  return isMine ? myTrails : publicTrails;
}
