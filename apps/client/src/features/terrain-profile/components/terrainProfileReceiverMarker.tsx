import { SmartPhone01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { PROFILE_PART_PROPS } from "../focus";
import { useTerrainFormat } from "../format";
import type { GeoPoint } from "../types";
import { useMap } from "@/components/ui/map";
import { cn } from "@/lib/utils";

type TerrainProfileReceiverMarkerProps = {
  point: GeoPoint;
  heightMeters: number;
  onDrag: (point: GeoPoint) => void;
  onDragEnd: (point: GeoPoint) => void;
};

const UNPLACED_POSITION: [number, number] = [0, 0];
const HANDLE_CLASS = cn(
  "flex size-7 cursor-grab items-center justify-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-md",
  "outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
);
const CHIP_CLASS = cn(
  "pointer-events-none absolute top-1/2 left-full ml-1.5 inline-flex h-5.5 -translate-y-1/2 items-center rounded-lg border bg-background/95 px-1.5",
  "text-[11px] leading-none font-semibold whitespace-nowrap text-foreground shadow-md",
);

export function TerrainProfileReceiverMarker({ point, heightMeters, onDrag, onDragEnd }: TerrainProfileReceiverMarkerProps) {
  const { t } = useTranslation("terrainProfile");
  const { map } = useMap();
  const format = useTerrainFormat();
  const [element] = useState(() => document.createElement("div"));
  const markerRef = useRef<Marker | null>(null);
  const handlersRef = useRef({ onDrag, onDragEnd });
  const { latitude, longitude } = point;

  useEffect(() => {
    handlersRef.current = { onDrag, onDragEnd };
  }, [onDrag, onDragEnd]);

  useEffect(() => {
    if (!map) return;

    const marker = new Marker({ element, draggable: true }).setLngLat(UNPLACED_POSITION).addTo(map);
    const readPoint = (): GeoPoint => {
      const { lat, lng } = marker.getLngLat();
      return { latitude: lat, longitude: lng };
    };
    const handleDrag = () => handlersRef.current.onDrag(readPoint());
    const handleDragEnd = () => handlersRef.current.onDragEnd(readPoint());

    marker.on("drag", handleDrag);
    marker.on("dragend", handleDragEnd);
    markerRef.current = marker;

    return () => {
      marker.off("drag", handleDrag);
      marker.off("dragend", handleDragEnd);
      marker.remove();
      markerRef.current = null;
    };
  }, [map, element]);

  useEffect(() => {
    markerRef.current?.setLngLat([longitude, latitude]);
  }, [map, latitude, longitude]);

  return createPortal(
    <div className="relative flex size-7 items-center justify-center" {...PROFILE_PART_PROPS}>
      <button type="button" aria-label={t("marker.label")} className={HANDLE_CLASS}>
        <HugeiconsIcon icon={SmartPhone01Icon} className="size-3.5" aria-hidden="true" />
      </button>
      <span className={CHIP_CLASS}>{`${t("receiver.title")} · ${format.compact(heightMeters, 1)} m`}</span>
    </div>,
    element,
  );
}
