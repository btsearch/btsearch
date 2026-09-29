import { QueryClientProvider } from "@tanstack/react-query";
import { type GeoJSONSource, type MapLayerMouseEvent, type Map as MapLibreMap, Popup } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef } from "react";
import { createRoot } from "react-dom/client";

import { PemPopupContent } from "../components/pemPopupContent";
import { PLANNED_PEM_LAYER_ID, PLANNED_PEM_SOURCE_ID } from "../constants";
import { onBeforeStyleChange } from "@/components/ui/map";
import type { PlannedPEMStation } from "@/features/si2pem/api";
import { API_BASE } from "@/lib/api";
import { getOperatorColor } from "@/lib/cellular/operators";
import { hasReliableHoverPointer } from "@/lib/dom/pointer";
import { queryClient } from "@/lib/queryClient";

const PEM_BOX_IMAGE_ID = "pem-box";

type PopupState = { popup: Popup; root: ReturnType<typeof createRoot> };
type PlannedMeasurementProperties = {
  station_id: string | null;
  internal_station_id: number | null;
  color: string;
  operator_name: string | null;
  operator_mnc: number | null;
  region_name: string | null;
  status: PlannedPEMStation["status"];
  disabled_date: string | null;
  date_from: string | null;
  date_to: string | null;
  lab_name: string | null;
  lab_pca: string | null;
  city: string;
  address: string;
};
type PlannedMeasurementFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: PlannedMeasurementProperties;
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

async function fetchMeasurements(bounds: string, operators: number[], signal: AbortSignal): Promise<PlannedMeasurementFeatureCollection | null> {
  const params = new URLSearchParams({ bounds });
  if (operators.length) params.set("operators", operators.join(","));
  const res = await fetch(`${API_BASE}/pem/planned?${params.toString()}`, { signal });
  if (!res.ok) return null;
  const { data }: { totalCount: number; data: PlannedPEMStation[] } = await res.json();
  return {
    type: "FeatureCollection",
    features: data.map((f) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [f.location.longitude, f.location.latitude] },
      properties: {
        station_id: f.station_id,
        internal_station_id: f.internal_station_id,
        color: getOperatorColor(f.operator?.mnc ?? 0),
        operator_name: f.operator?.name ?? null,
        operator_mnc: f.operator?.mnc ?? null,
        region_name: f.region?.name ?? null,
        status: f.status,
        disabled_date: f.disabled_date ?? null,
        date_from: f.date?.from ?? null,
        date_to: f.date?.to ?? null,
        lab_name: f.lab?.name ?? null,
        lab_pca: f.lab?.PCA ?? null,
        city: f.location.city,
        address: f.location.address,
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
  onOpenStation,
}: {
  map: MapLibreMap | null;
  isLoaded: boolean;
  enabled: boolean;
  operators?: number[];
  onOpenStation: (stationId: number) => boolean | void;
}) {
  const popupRef = useRef<PopupState | null>(null);
  const operatorsKey = operators.join(",");
  const openStation = useEffectEvent(onOpenStation);

  useEffect(() => {
    if (!map || !isLoaded || !enabled) return;
    let lastData: PlannedMeasurementFeatureCollection = { type: "FeatureCollection", features: [] };
    let requestController: AbortController | null = null;
    const selectedOperators = operatorsKey ? operatorsKey.split(",").map(Number) : [];
    const useHoverListeners = hasReliableHoverPointer();

    const initLayer = () => {
      try {
        if (!map.hasImage(PEM_BOX_IMAGE_ID)) {
          map.addImage(PEM_BOX_IMAGE_ID, createBoxSDF(18, 2, 2), { sdf: true });
        }
        if (!map.getSource(PLANNED_PEM_SOURCE_ID)) {
          map.addSource(PLANNED_PEM_SOURCE_ID, { type: "geojson", data: lastData });
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
      requestController?.abort();
      const controller = new AbortController();
      requestController = controller;
      fetchMeasurements(getBoundsString(map), selectedOperators, controller.signal)
        .then((data) => {
          if (controller.signal.aborted || !data) return;
          lastData = data;
          try {
            void (map.getSource(PLANNED_PEM_SOURCE_ID) as GeoJSONSource)?.setData(data);
          } catch {}
        })
        .catch(() => {});
    };

    const handleClick = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      const properties = feature?.properties as PlannedMeasurementProperties | undefined;
      if (!feature || !properties || feature.geometry.type !== "Point") return;
      const [longitude, latitude] = feature.geometry.coordinates;
      const internalStationId = typeof properties.internal_station_id === "number" ? properties.internal_station_id : null;

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
            stationId={properties.station_id}
            operatorName={properties.operator_name}
            operatorMnc={properties.operator_mnc}
            regionName={properties.region_name}
            status={properties.status}
            disabledDate={properties.disabled_date}
            dateFrom={properties.date_from}
            dateTo={properties.date_to}
            labName={properties.lab_name}
            labPca={properties.lab_pca}
            city={properties.city}
            address={properties.address}
            latitude={latitude}
            longitude={longitude}
            onClose={() => popup.remove()}
            onOpenStation={
              internalStationId === null
                ? undefined
                : () => {
                    if (openStation(internalStationId) !== false) popup.remove();
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
    loadData();
    map.on("styledata", initLayer);
    map.on("moveend", loadData);
    attachLayerListeners();
    const unsubscribe = onBeforeStyleChange(map, detachLayerListeners);

    return () => {
      requestController?.abort();
      popupRef.current = destroyPopup(popupRef.current);
      map.off("styledata", initLayer);
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
