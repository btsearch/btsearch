import type { ObservationFlag, ObservedSite } from "@openbts/shared/contract";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import type { ReactNode } from "react";

import { type EvidencePoint, buildCircleRing, buildEllipseRing, getBounds, toPosition } from "../map/geometry";
import { ESTIMATE_COLORS } from "../map/palette";
import { type FlagTextContext, getStationSubject } from "../model/flagText";
import { Map as MapGL, MapMarker, MarkerContent, useMap, useResolvedTheme } from "@/components/ui/map";
import { LAYER_FADE } from "@/features/map/crowd/layers/layerFade";
import { type GeoJsonLayer, useGeoJsonLayers } from "@/features/map/crowd/layers/useGeoJsonLayers";
import { getOperatorLook } from "@/features/map/data/mapLookups";
import { formatDistance } from "@/lib/format";

type EstimateMiniMapProps = {
  flag: ObservationFlag;
  site: ObservedSite;
  ctx: FlagTextContext;
  action: ReactNode;
};

type EstimateShapesProps = {
  shapes: FeatureCollection;
  color: string;
};

type ComparedStation = EvidencePoint & { operatorId: number | null; distanceMeters: number };

const SOURCE_ID = "flag-estimate-shapes";
const AREA_FILL_ID = "flag-estimate-area-fill";
const AREA_LINE_ID = "flag-estimate-area-line";
const RING_LINE_ID = "flag-estimate-ring";
const LINK_LINE_ID = "flag-estimate-link";
const LINK_COLOR = "#334155";
const FIT_PADDING = 28;
const FIT_MAX_ZOOM = 16;

function findComparedStation(flag: ObservationFlag): ComparedStation | null {
  if (flag.kind !== "suggestedSite" && flag.kind !== "positionDiffers") return null;
  const location = flag.station?.location ?? null;
  if (location === null) return null;
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    operatorId: flag.station?.operatorId ?? null,
    distanceMeters: flag.evidence.distanceMeters,
  };
}

function getCaption(flag: ObservationFlag, ctx: FlagTextContext): string {
  const { t, language } = ctx;
  if (flag.kind === "positionDiffers") return t("observationFlags.map.estimateAndStation", { station: getStationSubject(flag).text });
  const placement = flag.observedSite?.placement ?? null;
  const radius =
    placement?.kind === "fit"
      ? t("observationFlags.map.radius", { radius: formatDistance(placement.radiusMeters, language) })
      : t("observationFlags.map.snapped");
  if (flag.kind === "suggestedSite") return `${radius} · ${t("observationFlags.map.station", { station: getStationSubject(flag).text })}`;
  return radius;
}

function toFeature(geometry: Geometry, shape: string): Feature {
  return { type: "Feature", geometry, properties: { shape } };
}

function buildShapes(site: ObservedSite, center: EvidencePoint, station: EvidencePoint | null): FeatureCollection {
  const features: Feature[] = [];
  const { placement } = site;
  if (placement?.kind === "fit") {
    const { majorMeters, minorMeters, azimuthDegrees } = placement.ellipse;
    features.push(toFeature({ type: "Polygon", coordinates: [buildEllipseRing(center, majorMeters, minorMeters, azimuthDegrees)] }, "area"));
    features.push(toFeature({ type: "LineString", coordinates: buildCircleRing(center, placement.radiusMeters) }, "ring"));
  }
  if (station !== null) features.push(toFeature({ type: "LineString", coordinates: [toPosition(center), toPosition(station)] }, "link"));
  return { type: "FeatureCollection", features };
}

function listPositions(shapes: FeatureCollection): Position[] {
  return shapes.features.flatMap(({ geometry }) => {
    if (geometry.type === "Polygon") return geometry.coordinates.flat();
    if (geometry.type === "LineString") return geometry.coordinates;
    return [];
  });
}

function listLayers(color: string): GeoJsonLayer[] {
  return [
    {
      spec: {
        id: AREA_FILL_ID,
        type: "fill",
        source: SOURCE_ID,
        filter: ["==", ["get", "shape"], "area"],
        paint: { "fill-color": color, "fill-opacity": 0, "fill-opacity-transition": LAYER_FADE },
      },
      fade: { id: AREA_FILL_ID, property: "fill-opacity", opacity: 0.16 },
    },
    {
      spec: {
        id: AREA_LINE_ID,
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["get", "shape"], "area"],
        paint: { "line-color": color, "line-width": 1.5, "line-opacity": 0, "line-opacity-transition": LAYER_FADE },
      },
      fade: { id: AREA_LINE_ID, property: "line-opacity", opacity: 1 },
    },
    {
      spec: {
        id: RING_LINE_ID,
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["get", "shape"], "ring"],
        paint: { "line-color": color, "line-width": 1, "line-dasharray": [3, 3], "line-opacity": 0, "line-opacity-transition": LAYER_FADE },
      },
      fade: { id: RING_LINE_ID, property: "line-opacity", opacity: 0.9 },
    },
    {
      spec: {
        id: LINK_LINE_ID,
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["get", "shape"], "link"],
        paint: { "line-color": LINK_COLOR, "line-width": 1.25, "line-dasharray": [2, 3], "line-opacity": 0, "line-opacity-transition": LAYER_FADE },
      },
      fade: { id: LINK_LINE_ID, property: "line-opacity", opacity: 0.8 },
    },
  ];
}

function EstimateShapes({ shapes, color }: EstimateShapesProps) {
  const { map, isLoaded } = useMap();
  useGeoJsonLayers({ map, isLoaded, sourceId: SOURCE_ID, data: shapes, layers: listLayers(color), level: "marks" });
  return null;
}

export function EstimateMiniMap({ flag, site, ctx, action }: EstimateMiniMapProps) {
  const theme = useResolvedTheme();
  if (site.latitude === null || site.longitude === null) return null;

  const center = { latitude: site.latitude, longitude: site.longitude };
  const station = findComparedStation(flag);
  const shapes = buildShapes(site, center, station);
  const color = ESTIMATE_COLORS[theme];
  const caption = getCaption(flag, ctx);
  const midpoint =
    station === null ? null : { latitude: (center.latitude + station.latitude) / 2, longitude: (center.longitude + station.longitude) / 2 };

  return (
    <section aria-label={caption} className="relative h-[200px] shrink-0 overflow-hidden rounded-lg border">
      <MapGL
        key={`${site.id}:${station?.latitude ?? ""}:${station?.longitude ?? ""}`}
        className="absolute inset-0"
        interactive={false}
        bounds={getBounds([toPosition(center), ...listPositions(shapes)]) ?? undefined}
        fitBoundsOptions={{ padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM }}
      >
        <EstimateShapes shapes={shapes} color={color} />
        {station === null ? null : (
          <MapMarker latitude={station.latitude} longitude={station.longitude}>
            <MarkerContent className="cursor-default">
              <span
                className="block size-4 rounded-full border-2 border-white shadow-sm"
                style={{ backgroundColor: getOperatorLook(ctx.lookups, station.operatorId).color }}
              />
            </MarkerContent>
          </MapMarker>
        )}
        {midpoint === null || station === null ? null : (
          <MapMarker latitude={midpoint.latitude} longitude={midpoint.longitude}>
            <MarkerContent className="cursor-default">
              <span className="-translate-y-2.5 block rounded-sm bg-background/90 px-1 text-[11px] font-semibold text-foreground tabular-nums">
                {formatDistance(station.distanceMeters, ctx.language)}
              </span>
            </MarkerContent>
          </MapMarker>
        )}
        <MapMarker latitude={center.latitude} longitude={center.longitude}>
          <MarkerContent className="cursor-default">
            <span className="block size-2.5 rounded-full border-[3px] bg-white" style={{ borderColor: color }} />
          </MarkerContent>
        </MapMarker>
      </MapGL>
      <div className="absolute top-2 right-2 z-10">{action}</div>
      <span className="absolute bottom-2 left-2 z-10 rounded-md bg-background px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground">
        {caption}
      </span>
    </section>
  );
}
