import { HugeiconsIcon } from "@hugeicons/react";
import type { ObservedCellRecord, ObservedSiteEvidence } from "@openbts/shared/contract";
import type { CellRat } from "@openbts/shared/contract/constants";
import type { FeatureCollection } from "geojson";
import type { LngLatBoundsLike, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { useEffect, useEffectEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type EvidencePoint,
  type TimingAdvanceSquare,
  buildFitFeatures,
  buildGridFeatures,
  buildTimingAdvanceFeatures,
  buildTimingAdvanceFocus,
  listEvidenceBounds,
} from "../map/geometry";
import { type EvidenceOverlay, OVERLAYS, TA_COLORS, listZoneColors } from "../map/palette";
import { formatCellBand, getFieldCode, getNodeCode, readItemNumber } from "../model/format";
import { EvidenceLayersPanel, EvidenceLegend, type LayerToggles } from "./evidenceMapControls";
import { CHOICE_ICONS, type PlaceChoice } from "./placeChoices";
import { CloseButton } from "@/components/ui/close-button";
import { MapControls, Map as MapGL, MapMarker, MapPopup, MapStyleSwitcher, MarkerContent, useMap, useResolvedTheme } from "@/components/ui/map";
import { PopupCoordinatesFooter } from "@/features/map/components/popupParts";
import { POLAND_CENTER } from "@/features/map/constants";
import { COVERAGE_SOURCE_LAYER, getCoverageTileJsonUrl, transformCrowdTileRequest } from "@/features/map/crowd/api/tiles";
import { LAYER_FADE } from "@/features/map/crowd/layers/layerFade";
import { useGeoJsonLayers } from "@/features/map/crowd/layers/useGeoJsonLayers";
import { useVectorFillLayer } from "@/features/map/crowd/layers/useVectorFillLayer";
import { SHOWN_SQUARE_OPACITY, levelColor } from "@/features/map/crowd/style/expressions";
import { useMapLookups } from "@/features/map/data/mapLookups";
import { formatDistance } from "@/lib/format";
import { cn } from "@/lib/utils";

type EvidenceMapProps = {
  evidence: ObservedSiteEvidence;
  choices: readonly PlaceChoice[];
  chosenKey: string | null;
  fallbackPoint: EvidencePoint | null;
  isStaff: boolean;
  isAdmin: boolean;
  onChoose: (key: string) => void;
};

type EvidenceMapContentProps = Omit<EvidenceMapProps, "fallbackPoint">;

type PlaceMarkProps = {
  choice: PlaceChoice;
  isChosen: boolean;
  onChoose: (key: string) => void;
};

type PointMarkProps = {
  point: EvidencePoint;
  label: string;
  isDashed: boolean;
  overlay: EvidenceOverlay;
};

type CellIdentityPart = { label: string; value: string };

type CellIdentityLineProps = { cell: ObservedCellRecord };

type TimingAdvancePopupProps = {
  square: TimingAdvanceSquare;
  cell: ObservedCellRecord | undefined;
  onClose: () => void;
};

const GRID_SOURCE_ID = "evidence-grid-source";
const GRID_LAYER_ID = "evidence-grid-fill";
const COVERAGE_SOURCE_ID = "evidence-coverage-source";
const COVERAGE_LAYER_ID = "evidence-coverage-fill";
const FIT_SOURCE_ID = "evidence-fit-source";
const FIT_RADIUS_LAYER_ID = "evidence-fit-radius";
const FIT_ELLIPSE_LAYER_ID = "evidence-fit-ellipse";
const FIT_LINK_LAYER_ID = "evidence-fit-link";
const TA_SOURCE_ID = "evidence-ta-source";
const TA_FILL_LAYER_ID = "evidence-ta-fill";
const TA_OUTLINE_LAYER_ID = "evidence-ta-outline";
const TA_FOCUS_SOURCE_ID = "evidence-ta-focus-source";
const TA_FOCUS_RING_LAYER_ID = "evidence-ta-focus-ring";
const TA_FOCUS_SQUARE_LAYER_ID = "evidence-ta-focus-square";
const LAYER_ORDER = [
  GRID_LAYER_ID,
  COVERAGE_LAYER_ID,
  FIT_RADIUS_LAYER_ID,
  FIT_ELLIPSE_LAYER_ID,
  FIT_LINK_LAYER_ID,
  TA_FOCUS_RING_LAYER_ID,
  TA_FILL_LAYER_ID,
  TA_OUTLINE_LAYER_ID,
  TA_FOCUS_SQUARE_LAYER_ID,
];
const FIT_OPTIONS = { padding: 64, maxZoom: 17, duration: 0 };
const FALLBACK_ZOOM = 15;
const COUNTRY_ZOOM = 6;
const SATELLITE_STYLES = new Set(["satellite", "esriSatellite"]);
const OVERLAY_SELECTOR = ".maplibregl-marker, .maplibregl-popup";
const DEFAULT_TOGGLES: LayerToggles = { grid: true, ta: true, readings: false, places: true };
const CHANNEL_FIELDS: Record<CellRat, string> = { gsm: "arfcn", umts: "uarfcn", lte: "earfcn", nr: "arfcn" };

function isOverlayClick(event: MapMouseEvent): boolean {
  const { target } = event.originalEvent;
  return target instanceof Element && target.closest(OVERLAY_SELECTOR) !== null;
}

function readSquareIndex(map: MapLibreMap, event: MapMouseEvent): number | null {
  if (map.getLayer(TA_FILL_LAYER_ID) === undefined) return null;
  const [feature] = map.queryRenderedFeatures(event.point, { layers: [TA_FILL_LAYER_ID] });
  const index: unknown = feature?.properties?.index;
  return typeof index === "number" ? index : null;
}

function listCellIdentity(cell: ObservedCellRecord): CellIdentityPart[] {
  const channel = readItemNumber(cell, CHANNEL_FIELDS[cell.rat]);
  const parts: CellIdentityPart[] = [{ label: getNodeCode(cell.rat), value: formatCellIds(cell) }];
  if (channel !== null) parts.push({ label: getFieldCode("channel", cell.rat), value: String(channel) });
  return parts;
}

function formatCellIds(cell: ObservedCellRecord): string {
  switch (cell.rat) {
    case "lte":
      return `${cell.enbid} / ${cell.clid}`;
    case "nr":
      return `${cell.gnbid} / ${cell.clid}`;
    case "umts":
      return `${cell.rnc} / ${cell.cid}`;
    case "gsm":
      return `${cell.lac} / ${cell.cid}`;
  }
}

function CellIdentityLine({ cell }: CellIdentityLineProps) {
  return (
    <p className="text-[11px] leading-4">
      {listCellIdentity(cell).map((part, index) => (
        <span key={part.label}>
          {index > 0 ? <span className="mx-1 text-muted-foreground">/</span> : null}
          <span className="text-muted-foreground">{part.label}</span> <span className="font-mono font-medium tabular-nums">{part.value}</span>
        </span>
      ))}
    </p>
  );
}

function TimingAdvancePopup({ square, cell, onClose }: TimingAdvancePopupProps) {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const { lookups } = useMapLookups();

  return (
    <MapPopup
      longitude={square.longitude}
      latitude={square.latitude}
      closeOnClick={false}
      onClose={onClose}
      className="w-64 animate-none rounded-none border-0 bg-transparent p-0 shadow-none"
    >
      <div role="dialog" aria-label={t("observationFlags.evidence.ta.popupLabel")} className="text-sm">
        <div className="flow-root border-b border-border/50 py-2 pr-1.5 pl-3">
          <div className="float-right -my-0.5 ml-2 flex items-center">
            <CloseButton size="xs" onClick={onClose} />
          </div>
          <h3 className="text-sm leading-5 font-medium tabular-nums">
            {t("observationFlags.evidence.ta.distance", { distance: formatDistance(square.distanceMeters, i18n.language) })}
          </h3>
          <p className="text-[11px] leading-4 text-muted-foreground">{t("observationFlags.summary.readings", { count: square.samples })}</p>
        </div>
        <div className="px-3 py-2">
          {cell === undefined ? (
            <p className="font-mono text-[11px] leading-4 font-medium tabular-nums">#{square.observedCellId}</p>
          ) : (
            <>
              <CellIdentityLine cell={cell} />
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{formatCellBand(cell, lookups, i18n.language)}</p>
            </>
          )}
        </div>
        <p className="border-t border-border/50 px-3 py-2 text-[11px] leading-4 text-muted-foreground">{t("observationFlags.evidence.ta.note")}</p>
        <PopupCoordinatesFooter latitude={square.latitude} longitude={square.longitude} />
      </div>
    </MapPopup>
  );
}

function PointMark({ point, label, isDashed, overlay }: PointMarkProps) {
  return (
    <MapMarker longitude={point.longitude} latitude={point.latitude}>
      <MarkerContent className="cursor-default">
        <span
          aria-hidden="true"
          className={cn("block size-3 rounded-full bg-white", isDashed ? "border-[2.5px] border-dashed" : "border-[3.5px]")}
          style={{ borderColor: overlay.point }}
        />
        <span
          className="absolute top-full left-1/2 mt-1 ml-1.5 text-xs font-bold whitespace-nowrap"
          style={{ color: overlay.label, textShadow: `0 0 3px ${overlay.halo}, 0 0 3px ${overlay.halo}` }}
        >
          {label}
        </span>
      </MarkerContent>
    </MapMarker>
  );
}

function PlaceMark({ choice, isChosen, onChoose }: PlaceMarkProps) {
  const { t } = useTranslation("admin");
  const share = choice.share ?? "";
  const text = choice.isSnap ? `${t("observationFlags.evidence.marks.here")} · ${share}` : share;

  return (
    <MapMarker longitude={choice.longitude} latitude={choice.latitude}>
      <MarkerContent className="cursor-default">
        <span
          aria-hidden="true"
          className={cn("block size-2 rounded-xs border-2 bg-white", choice.isSnap ? "border-primary" : "border-neutral-950")}
        />
        <button
          type="button"
          aria-pressed={isChosen}
          aria-label={t(choice.isSnap ? "observationFlags.evidence.marks.snappedLabel" : "observationFlags.evidence.marks.label", {
            place: choice.title,
            share,
          })}
          onClick={() => onChoose(choice.key)}
          className={cn(
            "absolute bottom-3 left-0 inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border px-1.5 text-xs font-bold whitespace-nowrap tabular-nums shadow-sm transition-[box-shadow,border-color] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            choice.isSnap ? "border-transparent bg-primary text-primary-foreground" : "border-black/20 bg-white text-neutral-950",
            isChosen ? "ring-2" : null,
            choice.isSnap ? "ring-white" : "ring-primary",
          )}
        >
          <HugeiconsIcon icon={CHOICE_ICONS[choice.kind]} aria-hidden="true" className="size-3.25" />
          {text}
        </button>
      </MarkerContent>
    </MapMarker>
  );
}

function EvidenceMapContent({ evidence, choices, chosenKey, isStaff, isAdmin, onChoose }: EvidenceMapContentProps) {
  const { t } = useTranslation("admin");
  const { map, isLoaded, mapStyle } = useMap();
  const theme = useResolvedTheme();
  const [toggles, setToggles] = useState(DEFAULT_TOGGLES);
  const [squareIndex, setSquareIndex] = useState<number | null>(null);
  const { fit, grid, timingAdvanceSquares, cells } = evidence;
  const overlay = OVERLAYS[SATELLITE_STYLES.has(mapStyle) ? "satellite" : theme];
  const cellIds = cells.map((cell) => cell.id);
  const selectedSquare = squareIndex === null || !toggles.ta ? null : (timingAdvanceSquares[squareIndex] ?? null);
  const isSnapped = evidence.candidates.some((candidate) => candidate.isSnap);
  const gridData: FeatureCollection | null = toggles.grid && grid !== null ? buildGridFeatures(grid) : null;
  const zoneColors = listZoneColors(overlay);

  useGeoJsonLayers({
    map,
    isLoaded,
    sourceId: GRID_SOURCE_ID,
    data: gridData,
    order: LAYER_ORDER,
    layers: [
      {
        spec: {
          id: GRID_LAYER_ID,
          type: "fill",
          source: GRID_SOURCE_ID,
          paint: {
            "fill-color": ["match", ["get", "bucket"], 0, zoneColors[0], 1, zoneColors[1], 2, zoneColors[2], zoneColors[3]],
            "fill-antialias": false,
            "fill-opacity": 0,
            "fill-opacity-transition": LAYER_FADE,
          },
        },
        fade: { id: GRID_LAYER_ID, property: "fill-opacity", opacity: 1 },
      },
    ],
  });

  const readings = useVectorFillLayer({
    map,
    isLoaded,
    sourceId: COVERAGE_SOURCE_ID,
    layerId: COVERAGE_LAYER_ID,
    sourceLayer: COVERAGE_SOURCE_LAYER,
    order: LAYER_ORDER,
    tileJsonUrl: toggles.readings && cellIds.length > 0 ? getCoverageTileJsonUrl(cellIds, isStaff) : null,
    fillColor: levelColor(theme),
    opacity: SHOWN_SQUARE_OPACITY,
    sortKey: ["get", "level"],
  });

  useGeoJsonLayers({
    map,
    isLoaded,
    sourceId: FIT_SOURCE_ID,
    data: fit === null ? null : buildFitFeatures(fit),
    order: LAYER_ORDER,
    layers: [
      {
        spec: {
          id: FIT_RADIUS_LAYER_ID,
          type: "line",
          source: FIT_SOURCE_ID,
          filter: ["==", ["get", "kind"], "radius"],
          paint: {
            "line-color": overlay.ring,
            "line-width": 1.25,
            "line-dasharray": [4, 4],
            "line-opacity": 0,
            "line-opacity-transition": LAYER_FADE,
          },
        },
        fade: { id: FIT_RADIUS_LAYER_ID, property: "line-opacity", opacity: 0.9 },
      },
      {
        spec: {
          id: FIT_ELLIPSE_LAYER_ID,
          type: "line",
          source: FIT_SOURCE_ID,
          filter: ["==", ["get", "kind"], "ellipse"],
          paint: { "line-color": overlay.ring, "line-width": 1.75, "line-opacity": 0, "line-opacity-transition": LAYER_FADE },
        },
        fade: { id: FIT_ELLIPSE_LAYER_ID, property: "line-opacity", opacity: 1 },
      },
      {
        spec: {
          id: FIT_LINK_LAYER_ID,
          type: "line",
          source: FIT_SOURCE_ID,
          filter: ["==", ["get", "kind"], "alternative"],
          layout: { "line-cap": "round" },
          paint: {
            "line-color": overlay.ring,
            "line-width": 1.25,
            "line-dasharray": [1, 3],
            "line-opacity": 0,
            "line-opacity-transition": LAYER_FADE,
          },
        },
        fade: { id: FIT_LINK_LAYER_ID, property: "line-opacity", opacity: 1 },
      },
    ],
  });

  useGeoJsonLayers({
    map,
    isLoaded,
    sourceId: TA_SOURCE_ID,
    data: toggles.ta && timingAdvanceSquares.length > 0 ? buildTimingAdvanceFeatures(timingAdvanceSquares) : null,
    order: LAYER_ORDER,
    layers: [
      {
        spec: {
          id: TA_FILL_LAYER_ID,
          type: "fill",
          source: TA_SOURCE_ID,
          paint: {
            "fill-color": ["match", ["get", "bucket"], 0, TA_COLORS[0], 1, TA_COLORS[1], 2, TA_COLORS[2], TA_COLORS[3]],
            "fill-opacity": 0,
            "fill-opacity-transition": LAYER_FADE,
          },
        },
        fade: { id: TA_FILL_LAYER_ID, property: "fill-opacity", opacity: 1 },
      },
      {
        spec: {
          id: TA_OUTLINE_LAYER_ID,
          type: "line",
          source: TA_SOURCE_ID,
          paint: { "line-color": overlay.taOutline, "line-width": 1, "line-opacity": 0, "line-opacity-transition": LAYER_FADE },
        },
        fade: { id: TA_OUTLINE_LAYER_ID, property: "line-opacity", opacity: 1 },
      },
    ],
  });

  useGeoJsonLayers({
    map,
    isLoaded,
    sourceId: TA_FOCUS_SOURCE_ID,
    data: selectedSquare === null ? null : buildTimingAdvanceFocus(selectedSquare),
    order: LAYER_ORDER,
    layers: [
      {
        spec: {
          id: TA_FOCUS_RING_LAYER_ID,
          type: "line",
          source: TA_FOCUS_SOURCE_ID,
          filter: ["==", ["get", "kind"], "ring"],
          paint: {
            "line-color": overlay.taRing,
            "line-width": 2,
            "line-dasharray": [3.5, 2.5],
            "line-opacity": 0,
            "line-opacity-transition": LAYER_FADE,
          },
        },
        fade: { id: TA_FOCUS_RING_LAYER_ID, property: "line-opacity", opacity: 1 },
      },
      {
        spec: {
          id: TA_FOCUS_SQUARE_LAYER_ID,
          type: "line",
          source: TA_FOCUS_SOURCE_ID,
          filter: ["==", ["get", "kind"], "square"],
          paint: { "line-color": overlay.taRing, "line-width": 2, "line-opacity": 0, "line-opacity-transition": LAYER_FADE },
        },
        fade: { id: TA_FOCUS_SQUARE_LAYER_ID, property: "line-opacity", opacity: 1 },
      },
    ],
  });

  const pickSquare = useEffectEvent((event: MapMouseEvent) => {
    if (map === null || isOverlayClick(event)) return;
    const index = readSquareIndex(map, event);
    setSquareIndex(index === squareIndex ? null : index);
  });

  useEffect(() => {
    if (!map || !isLoaded) return;
    const handleClick = (event: MapMouseEvent) => pickSquare(event);
    const handleMove = (event: MapMouseEvent) => {
      map.getCanvas().style.cursor = readSquareIndex(map, event) === null ? "" : "pointer";
    };
    map.on("click", handleClick);
    map.on("mousemove", handleMove);
    return () => {
      map.off("click", handleClick);
      map.off("mousemove", handleMove);
    };
  }, [map, isLoaded]);

  const placeChoices = choices.filter((choice) => choice.kind !== "fit" && choice.kind !== "alternative");

  return (
    <>
      {fit === null ? null : (
        <PointMark
          point={fit}
          label={t(isSnapped ? "observationFlags.evidence.marks.fitUnsnapped" : "observationFlags.evidence.marks.fit")}
          isDashed={false}
          overlay={overlay}
        />
      )}
      {fit?.alternative ? (
        <PointMark point={fit.alternative} label={t("observationFlags.evidence.choices.second")} isDashed overlay={overlay} />
      ) : null}
      {toggles.places
        ? placeChoices.map((choice) => <PlaceMark key={choice.key} choice={choice} isChosen={choice.key === chosenKey} onChoose={onChoose} />)
        : null}
      {selectedSquare === null ? null : (
        <TimingAdvancePopup
          square={selectedSquare}
          cell={cells.find((cell) => cell.id === selectedSquare.observedCellId)}
          onClose={() => setSquareIndex(null)}
        />
      )}
      <EvidenceLayersPanel
        toggles={toggles}
        evidence={evidence}
        onToggle={(key) => setToggles((current) => ({ ...current, [key]: !current[key] }))}
      />
      <EvidenceLegend toggles={toggles} evidence={evidence} overlay={overlay} theme={theme} readings={readings} isAdmin={isAdmin} />
    </>
  );
}

function getInitialBounds(evidence: ObservedSiteEvidence): LngLatBoundsLike | undefined {
  const points = evidence.candidates.map((candidate) => ({ latitude: candidate.latitude, longitude: candidate.longitude }));
  return listEvidenceBounds(points, evidence.fit) ?? undefined;
}

export function EvidenceMap({ fallbackPoint, ...contentProps }: EvidenceMapProps) {
  const { t } = useTranslation("admin");
  const [bounds] = useState(() => getInitialBounds(contentProps.evidence));
  const center: [number, number] = fallbackPoint === null ? POLAND_CENTER : [fallbackPoint.longitude, fallbackPoint.latitude];

  return (
    <div
      role="region"
      aria-label={t("observationFlags.evidence.mapLabel")}
      className="relative min-h-0 min-w-0 flex-1 max-md:h-[55svh] max-md:flex-none"
    >
      <MapGL
        center={center}
        zoom={fallbackPoint === null ? COUNTRY_ZOOM : FALLBACK_ZOOM}
        bounds={bounds}
        fitBoundsOptions={FIT_OPTIONS}
        initialMapStyle="satellite"
        transformRequest={transformCrowdTileRequest}
        dragRotate={false}
      >
        <EvidenceMapContent {...contentProps} />
        <MapControls showZoom showScale position="top-right" />
        <MapStyleSwitcher position="bottom-left" className="md:bottom-14" />
      </MapGL>
    </div>
  );
}
