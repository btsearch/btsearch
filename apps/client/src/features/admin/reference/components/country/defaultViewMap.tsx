import { useEffect } from "react";

import type { CountryView } from "../../types";
import { toPickedView } from "./defaultViewDraft";
import { MapControls, Map as MapGL, type MapRef, MapRoute, useMap } from "@/components/ui/map";

type DefaultViewPickerMapProps = {
  initialView: CountryView | null;
  onVisibleViewChange: (view: CountryView) => void;
};

type VisibleViewReporterProps = {
  onVisibleViewChange: (view: CountryView) => void;
};

const OUTLINE_COLOR = "#449AC0";
const OUTLINE_WIDTH = 2;
const OUTLINE_DASH: [number, number] = [2, 2];
const PREVIEW_FIT_OPTIONS = { padding: 16, animate: false };
const PICKER_FIT_OPTIONS = { padding: 24 };
const WORLD_CENTER: [number, number] = [10, 30];
const WORLD_ZOOM = 1;
const FLAT_MAP_PITCH = 0;

function readVisibleView(map: MapRef): CountryView {
  const bounds = map.getBounds();
  return toPickedView({ west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() });
}

function ViewCamera({ west, south, east, north }: CountryView) {
  const { map } = useMap();

  useEffect(() => {
    if (map === null) return;
    map.fitBounds([west, south, east, north], PREVIEW_FIT_OPTIONS);
  }, [map, west, south, east, north]);

  return null;
}

function ViewOutline({ west, south, east, north }: CountryView) {
  return (
    <MapRoute
      coordinates={[
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ]}
      color={OUTLINE_COLOR}
      width={OUTLINE_WIDTH}
      opacity={1}
      dashArray={OUTLINE_DASH}
      interactive={false}
    />
  );
}

function VisibleViewReporter({ onVisibleViewChange }: VisibleViewReporterProps) {
  const { map } = useMap();

  useEffect(() => {
    if (map === null) return;

    const reportVisibleView = () => onVisibleViewChange(readVisibleView(map));
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.on("moveend", reportVisibleView);
    reportVisibleView();

    return () => {
      map.off("moveend", reportVisibleView);
    };
  }, [map, onVisibleViewChange]);

  return null;
}

export function DefaultViewPreviewMap({ west, south, east, north }: CountryView) {
  return (
    <MapGL bounds={[west, south, east, north]} fitBoundsOptions={PREVIEW_FIT_OPTIONS} interactive={false}>
      <ViewCamera west={west} south={south} east={east} north={north} />
      <ViewOutline west={west} south={south} east={east} north={north} />
    </MapGL>
  );
}

export function DefaultViewPickerMap({ initialView, onVisibleViewChange }: DefaultViewPickerMapProps) {
  return (
    <MapGL
      center={WORLD_CENTER}
      zoom={WORLD_ZOOM}
      bounds={initialView === null ? undefined : [initialView.west, initialView.south, initialView.east, initialView.north]}
      fitBoundsOptions={PICKER_FIT_OPTIONS}
      dragRotate={false}
      touchPitch={false}
      maxPitch={FLAT_MAP_PITCH}
    >
      <VisibleViewReporter onVisibleViewChange={onVisibleViewChange} />
      {initialView === null ? null : (
        <ViewOutline west={initialView.west} south={initialView.south} east={initialView.east} north={initialView.north} />
      )}
      <MapControls showZoom position="top-right" />
    </MapGL>
  );
}
