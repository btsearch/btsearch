import { destinationPoint } from "@openbts/shared/geo";
import type { FeatureCollection, Polygon } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useEffectEvent, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { buildCircleRing } from "../map/geometry";
import { ESTIMATE_COLORS } from "../map/palette";
import { MapMarker, MarkerContent, useMap, useResolvedTheme } from "@/components/ui/map";
import { PICKER_CIRCLE_LAYER_ID } from "@/features/map/constants";
import { formatDistance } from "@/lib/format";

type EstimateOverlayProps = {
  latitude: number;
  longitude: number;
  radiusMeters: number | null;
};

type EstimateArea = {
  data: FeatureCollection<Polygon>;
  color: string;
};

const SOURCE_ID = "observed-estimate";
const FILL_LAYER_ID = "observed-estimate-fill";
const LINE_LAYER_ID = "observed-estimate-line";
const LAYER_IDS = [FILL_LAYER_ID, LINE_LAYER_ID];
const SOUTH_DEGREES = 180;
const FILL_OPACITY = 0.1;
const LINE_WIDTH = 1.5;
const LINE_DASHES = [3, 3];

function toCircle(latitude: number, longitude: number, radiusMeters: number): FeatureCollection<Polygon> {
  const ring = buildCircleRing({ latitude, longitude }, radiusMeters);
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] };
}

function addEstimateLayers(map: MapLibreMap, area: EstimateArea): void {
  try {
    if (!map.getSource(SOURCE_ID)) map.addSource(SOURCE_ID, { type: "geojson", data: area.data });
    const beforeId = map.getLayer(PICKER_CIRCLE_LAYER_ID) === undefined ? undefined : PICKER_CIRCLE_LAYER_ID;
    if (!map.getLayer(FILL_LAYER_ID)) {
      map.addLayer(
        { id: FILL_LAYER_ID, type: "fill", source: SOURCE_ID, paint: { "fill-color": area.color, "fill-opacity": FILL_OPACITY } },
        beforeId,
      );
    }
    if (!map.getLayer(LINE_LAYER_ID)) {
      map.addLayer(
        {
          id: LINE_LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          paint: { "line-color": area.color, "line-width": LINE_WIDTH, "line-dasharray": LINE_DASHES },
        },
        beforeId,
      );
    }
  } catch {}
}

function removeEstimateLayers(map: MapLibreMap): void {
  try {
    for (const layerId of LAYER_IDS) if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  } catch {}
}

function useEstimateLayers(area: EstimateArea | null): void {
  const { map, isLoaded } = useMap();
  const readArea = useEffectEvent(() => area);
  const isShown = area !== null;

  useEffect(() => {
    if (map === null || !isLoaded || !isShown) return;

    const addLayers = () => {
      const shownArea = readArea();
      if (shownArea !== null) addEstimateLayers(map, shownArea);
    };
    addLayers();
    map.on("styledata", addLayers);
    return () => {
      map.off("styledata", addLayers);
      removeEstimateLayers(map);
    };
  }, [map, isLoaded, isShown]);

  useEffect(() => {
    if (map === null || !isLoaded || area === null) return;
    try {
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      void source?.setData(area.data);
      for (const layerId of LAYER_IDS) {
        if (!map.getLayer(layerId)) continue;
        map.setPaintProperty(layerId, layerId === FILL_LAYER_ID ? "fill-color" : "line-color", area.color);
      }
    } catch {}
  }, [map, isLoaded, area]);
}

export function EstimateOverlay({ latitude, longitude, radiusMeters }: EstimateOverlayProps) {
  const { t, i18n } = useTranslation("admin");
  const theme = useResolvedTheme();
  const color = ESTIMATE_COLORS[theme];
  const area = useMemo(
    () => (radiusMeters === null ? null : { data: toCircle(latitude, longitude, radiusMeters), color }),
    [latitude, longitude, radiusMeters, color],
  );
  const [labelLatitude, labelLongitude] =
    radiusMeters === null ? [latitude, longitude] : destinationPoint(latitude, longitude, SOUTH_DEGREES, radiusMeters);

  useEstimateLayers(area);

  return (
    <>
      {radiusMeters === null ? null : (
        <MapMarker longitude={labelLongitude} latitude={labelLatitude} anchor="top">
          <MarkerContent className="pointer-events-none cursor-default">
            <span className="mt-1 block rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] leading-4 font-bold whitespace-nowrap text-foreground/80 shadow-xs">
              {t("observationFlags.createStation.estimateLabel", { radius: formatDistance(radiusMeters, i18n.language) })}
            </span>
          </MarkerContent>
        </MapMarker>
      )}
      <span className="pointer-events-none absolute bottom-2 left-2 z-10 max-w-[calc(100%-5rem)] rounded-md bg-background px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground">
        {t("observationFlags.createStation.mapHint")}
      </span>
    </>
  );
}
