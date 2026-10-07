import { QueryClientProvider, keepPreviousData, useQuery } from "@tanstack/react-query";
import { type GeoJSONSource, type MapLayerMouseEvent, type Map as MapLibreMap, Popup } from "maplibre-gl";
import { useEffect, useEffectEvent, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";

import { PemPopupContent } from "../components/pemPopupContent";
import { PLANNED_PEM_LAYER_ID, PLANNED_PEM_SOURCE_ID } from "../constants";
import { type MapLookups, getOperatorLook, useMapLookups } from "../data/mapLookups";
import { listRegisterOperators } from "../data/mapRequests";
import { useMapQueryHousekeeping } from "./useMapQueryHousekeeping";
import { onBeforeStyleChange } from "@/components/ui/map";
import { MAP_PLANNED_MEASUREMENTS_FAMILY, type MapPlannedMeasurement, mapPlannedMeasurementsQueryOptions } from "@/features/si2pem/api";
import { hasReliableHoverPointer } from "@/lib/dom/pointer";
import { queryClient } from "@/lib/queryClient";

const PEM_BOX_IMAGE_ID = "pem-box";
const PLANNED_MEASUREMENT_QUERY_FAMILIES = new Set([MAP_PLANNED_MEASUREMENTS_FAMILY]);
const NO_OPERATOR_IDS: readonly number[] = [];

type PopupState = { popup: Popup; root: ReturnType<typeof createRoot> };
type PlannedMeasurementProperties = {
  siteId: string | null;
  stationId: number | null;
  operatorId: number | null;
  color: string;
  startsOn: string | null;
  endsOn: string | null;
  laboratoryName: string | null;
  accreditationNumber: string | null;
  city: string | null;
  address: string | null;
};
type PlannedMeasurementFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: PlannedMeasurementProperties;
};
type PlannedMeasurementFeatureCollection = { type: "FeatureCollection"; features: PlannedMeasurementFeature[] };

const NO_MEASUREMENT_FEATURES: PlannedMeasurementFeatureCollection = { type: "FeatureCollection", features: [] };

function destroyPopup(state: PopupState | null): null {
  state?.popup.remove();
  return null;
}

function createBoxSDF(size: number, padding: number, borderWidth: number): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "white";
  ctx.fillRect(padding, padding, size - padding * 2, borderWidth);
  ctx.fillRect(padding, size - padding - borderWidth, size - padding * 2, borderWidth);
  ctx.fillRect(padding, padding, borderWidth, size - padding * 2);
  ctx.fillRect(size - padding - borderWidth, padding, borderWidth, size - padding * 2);
  return ctx.getImageData(0, 0, size, size);
}

function toMeasurementFeature(measurement: MapPlannedMeasurement, lookups: MapLookups): PlannedMeasurementFeature {
  const operatorLook = getOperatorLook(lookups, measurement.operatorId);

  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [measurement.location.longitude, measurement.location.latitude] },
    properties: {
      siteId: measurement.siteId,
      stationId: measurement.stationId,
      operatorId: measurement.operatorId,
      color: operatorLook.color,
      startsOn: measurement.startsOn,
      endsOn: measurement.endsOn,
      laboratoryName: measurement.laboratory?.name ?? null,
      accreditationNumber: measurement.laboratory?.accreditationNumber ?? null,
      city: measurement.location.city,
      address: measurement.location.address,
    },
  };
}

function toMeasurementFeatures(measurements: readonly MapPlannedMeasurement[], lookups: MapLookups): PlannedMeasurementFeatureCollection {
  return { type: "FeatureCollection", features: measurements.map((measurement) => toMeasurementFeature(measurement, lookups)) };
}

function readText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

type UsePlannedMeasurementsLayerArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  enabled: boolean;
  bbox: string;
  isMoving: boolean;
  operatorIds: readonly number[];
  isPickingReceiver?: boolean;
  onOpenStation: (stationId: number) => boolean | void;
};

export function usePlannedMeasurementsLayer({
  map,
  isLoaded,
  enabled,
  bbox,
  isMoving,
  operatorIds,
  isPickingReceiver = false,
  onOpenStation,
}: UsePlannedMeasurementsLayerArgs) {
  const popupRef = useRef<PopupState | null>(null);
  const shownFeaturesRef = useRef(NO_MEASUREMENT_FEATURES);
  const openStation = useEffectEvent(onOpenStation);
  const readIsPickingReceiver = useEffectEvent(() => isPickingReceiver);
  const { lookups } = useMapLookups();

  useMapQueryHousekeeping({ bounds: bbox, isMoving, queryFamilies: PLANNED_MEASUREMENT_QUERY_FAMILIES });

  const registerOperators = listRegisterOperators(operatorIds, lookups?.operators);
  const registerOperatorIds = registerOperators?.map((operator) => operator.id) ?? NO_OPERATOR_IDS;
  const { data: measurements } = useQuery({
    ...mapPlannedMeasurementsQueryOptions(bbox, registerOperatorIds),
    enabled: enabled && registerOperators !== null && !isMoving,
    placeholderData: keepPreviousData,
  });

  const features = useMemo(
    () => (measurements === undefined || lookups === undefined ? null : toMeasurementFeatures(measurements, lookups)),
    [measurements, lookups],
  );

  useEffect(() => {
    if (features !== null) shownFeaturesRef.current = features;
  }, [features]);

  useEffect(() => {
    if (!map || !isLoaded || !enabled) return;
    const useHoverListeners = hasReliableHoverPointer();

    const initLayer = () => {
      try {
        if (!map.hasImage(PEM_BOX_IMAGE_ID)) map.addImage(PEM_BOX_IMAGE_ID, createBoxSDF(18, 2, 2), { sdf: true });
        if (!map.getSource(PLANNED_PEM_SOURCE_ID)) map.addSource(PLANNED_PEM_SOURCE_ID, { type: "geojson", data: shownFeaturesRef.current });
        if (!map.getLayer(PLANNED_PEM_LAYER_ID)) {
          map.addLayer({
            id: PLANNED_PEM_LAYER_ID,
            type: "symbol",
            source: PLANNED_PEM_SOURCE_ID,
            layout: {
              "icon-image": PEM_BOX_IMAGE_ID,
              "icon-size": 1,
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
            },
            paint: {
              "icon-color": ["get", "color"],
              "icon-opacity": 0.9,
            },
          });
        }
      } catch {}
    };

    const handleClick = (e: MapLayerMouseEvent) => {
      if (readIsPickingReceiver()) return;

      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const [longitude, latitude] = feature.geometry.coordinates;
      const { properties } = feature;
      const stationId = readNumber(properties.stationId);

      popupRef.current = destroyPopup(popupRef.current);

      const container = document.createElement("div");
      container.className = "station-popup-container outline-none";
      container.tabIndex = -1;
      const root = createRoot(container);
      const popup = new Popup({ className: "station-map-popup", closeButton: false, closeOnClick: true, maxWidth: "none", offset: 12 })
        .setLngLat([longitude, latitude])
        .setDOMContent(container)
        .addTo(map);
      container.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        popup.remove();
      });

      const popupState = { popup, root };
      popup.on("close", () => {
        queueMicrotask(() => root.unmount());
        if (popupRef.current === popupState) popupRef.current = null;
      });

      root.render(
        <QueryClientProvider client={queryClient}>
          <PemPopupContent
            siteId={readText(properties.siteId)}
            operatorId={readNumber(properties.operatorId)}
            startsOn={readText(properties.startsOn)}
            endsOn={readText(properties.endsOn)}
            laboratoryName={readText(properties.laboratoryName)}
            accreditationNumber={readText(properties.accreditationNumber)}
            city={readText(properties.city)}
            address={readText(properties.address)}
            latitude={latitude}
            longitude={longitude}
            onClose={() => popup.remove()}
            onOpenStation={
              stationId === null
                ? undefined
                : () => {
                    if (openStation(stationId) !== false) popup.remove();
                  }
            }
          />
        </QueryClientProvider>,
      );

      popupRef.current = popupState;
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    const attachLayerListeners = () => {
      map.on("click", PLANNED_PEM_LAYER_ID, handleClick);
      if (!useHoverListeners) return;
      map.on("mouseenter", PLANNED_PEM_LAYER_ID, handleMouseEnter);
      map.on("mouseleave", PLANNED_PEM_LAYER_ID, handleMouseLeave);
    };

    const detachLayerListeners = () => {
      map.off("click", PLANNED_PEM_LAYER_ID, handleClick);
      if (!useHoverListeners) return;
      map.off("mouseenter", PLANNED_PEM_LAYER_ID, handleMouseEnter);
      map.off("mouseleave", PLANNED_PEM_LAYER_ID, handleMouseLeave);
      map.getCanvas().style.cursor = "";
    };

    initLayer();
    map.on("styledata", initLayer);
    attachLayerListeners();
    const unsubscribe = onBeforeStyleChange(map, detachLayerListeners);

    return () => {
      popupRef.current = destroyPopup(popupRef.current);
      map.off("styledata", initLayer);
      unsubscribe();
      detachLayerListeners();
      try {
        if (map.getStyle() !== undefined) {
          if (map.getLayer(PLANNED_PEM_LAYER_ID)) map.removeLayer(PLANNED_PEM_LAYER_ID);
          if (map.getSource(PLANNED_PEM_SOURCE_ID)) map.removeSource(PLANNED_PEM_SOURCE_ID);
        }
      } catch {}
    };
  }, [map, isLoaded, enabled]);

  useEffect(() => {
    if (!map || !isLoaded || !enabled || features === null) return;
    try {
      void (map.getSource(PLANNED_PEM_SOURCE_ID) as GeoJSONSource | undefined)?.setData(features);
    } catch {}
  }, [map, isLoaded, enabled, features]);
}
