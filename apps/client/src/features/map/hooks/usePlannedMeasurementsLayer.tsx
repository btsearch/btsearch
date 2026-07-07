import { type GeoJSONSource, type MapLayerMouseEvent, type Map as MapLibreMap, Popup } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

import { onBeforeStyleChange } from "@/components/ui/map";
import type { PlannedPEMStation } from "@/features/si2pem/api";
import { API_BASE } from "@/lib/api";
import { getOperatorColor } from "@/lib/operatorUtils";
import { hasReliableHoverPointer } from "@/lib/pointer";

import { PemPopupContent } from "../components/pemPopupContent";
import { PLANNED_PEM_LAYER_ID, PLANNED_PEM_SOURCE_ID } from "../constants";

const PEM_BOX_IMAGE_ID = "pem-box";

type PopupState = { popup: Popup; root: ReturnType<typeof createRoot> };
type PlannedMeasurementFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
};
type PlannedMeasurementFeatureCollection = { type: "FeatureCollection"; features: PlannedMeasurementFeature[] };

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

async function fetchMeasurements(bounds: string, operators: number[]): Promise<PlannedMeasurementFeatureCollection | null> {
  const params = new URLSearchParams({ bounds });
  if (operators.length) params.set("operators", operators.join(","));
  const res = await fetch(`${API_BASE}/pem/planned?${params.toString()}`);
  if (!res.ok) return null;
  const { data }: { totalCount: number; data: PlannedPEMStation[] } = await res.json();
  return {
    type: "FeatureCollection",
    features: data.map((f) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [f.location.longitude, f.location.latitude] },
      properties: {
        station_id: f.station_id,
        color: getOperatorColor(f.operator?.mnc ?? 0),
        operator_name: f.operator?.name ?? null,
        date_from: f.date?.from ?? null,
        date_to: f.date?.to ?? null,
        lab_name: f.lab?.name ?? null,
        lab_pca: f.lab?.PCA ?? null,
        city: f.location.city,
        address: f.location.address,
        status: f.status,
      },
    })),
  };
}

function getBoundsString(map: MapLibreMap): string {
  const b = map.getBounds();
  return `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
}

export function usePlannedMeasurementsLayer({
  map,
  isLoaded,
  enabled,
  operators = [],
}: {
  map: MapLibreMap | null;
  isLoaded: boolean;
  enabled: boolean;
  operators?: number[];
}) {
  const popupRef = useRef<PopupState | null>(null);
  const operatorsKey = operators.join(",");

  useEffect(() => {
    if (!map || !isLoaded || !enabled) return;
    let cancelled = false;
    let requestId = 0;
    const EMPTY: PlannedMeasurementFeatureCollection = { type: "FeatureCollection", features: [] };
    const selectedOperators = operatorsKey ? operatorsKey.split(",").map(Number) : [];
    const useHoverListeners = hasReliableHoverPointer();

    const initLayer = () => {
      try {
        if (!map.hasImage(PEM_BOX_IMAGE_ID)) {
          map.addImage(PEM_BOX_IMAGE_ID, createBoxSDF(18, 2, 2), { sdf: true });
        }
        if (!map.getSource(PLANNED_PEM_SOURCE_ID)) {
          map.addSource(PLANNED_PEM_SOURCE_ID, { type: "geojson", data: EMPTY });
        }
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

    const loadData = () => {
      const currentRequestId = ++requestId;
      void fetchMeasurements(getBoundsString(map), selectedOperators).then((data) => {
        if (cancelled || currentRequestId !== requestId || !data) return;
        try {
          void (map.getSource(PLANNED_PEM_SOURCE_ID) as GeoJSONSource)?.setData(data);
        } catch {}
      });
    };

    const handleClick = (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;

      popupRef.current = destroyPopup(popupRef.current);

      const container = document.createElement("div");
      const root = createRoot(container);
      const popup = new Popup({ closeButton: true, closeOnClick: true, maxWidth: "20rem", offset: 8 })
        .setLngLat(e.lngLat)
        .setDOMContent(container)
        .addTo(map);

      const popupState = { popup, root };
      popup.on("close", () => {
        root.unmount();
        if (popupRef.current === popupState) popupRef.current = null;
      });

      root.render(
        <PemPopupContent
          stationId={p.station_id}
          operatorName={p.operator_name}
          color={p.color}
          dateFrom={p.date_from}
          dateTo={p.date_to}
          labName={p.lab_name}
          labPca={p.lab_pca}
          city={p.city}
          address={p.address}
        />,
      );

      popupRef.current = popupState;
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    const refresh = () => {
      initLayer();
      loadData();
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

    refresh();
    map.on("styledata", refresh);
    map.on("moveend", loadData);
    attachLayerListeners();
    const unsubscribe = onBeforeStyleChange(map, detachLayerListeners);

    return () => {
      cancelled = true;
      popupRef.current = destroyPopup(popupRef.current);
      map.off("styledata", refresh);
      map.off("moveend", loadData);
      unsubscribe();
      detachLayerListeners();
      try {
        if (map.getStyle() !== undefined) {
          if (map.getLayer(PLANNED_PEM_LAYER_ID)) map.removeLayer(PLANNED_PEM_LAYER_ID);
          if (map.getSource(PLANNED_PEM_SOURCE_ID)) map.removeSource(PLANNED_PEM_SOURCE_ID);
        }
      } catch {}
    };
  }, [map, isLoaded, enabled, operatorsKey]);
}
