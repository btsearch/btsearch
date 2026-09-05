import { Marker } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef } from "react";

import { useMap } from "@/components/ui/map";
import { getNsgReplayPosition } from "@/lib/nsg/replayPosition";
import type { NsgLocation } from "@/lib/nsg/types";

import type { ReplayClock } from "./replayClock";

const SELECTED_DOT_CLASS = "relative h-3.5 w-3.5 rounded-full border-2 border-white shadow-md";

export function SelectedMarker({
  points,
  selected,
  playheadMs,
  clock,
  color,
  title,
}: {
  points: NsgLocation[];
  selected: NsgLocation | null;
  playheadMs: number | null;
  clock: ReplayClock;
  color: string;
  title: string;
}) {
  const { map } = useMap();
  const markerRef = useRef<Marker | null>(null);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const updateMarker = useEffectEvent((time: number | null) => {
    const marker = markerRef.current;
    if (!marker) return;
    let position: Pick<NsgLocation, "latitude" | "longitude"> | null = selected;
    if (playheadMs !== null) position = time === null ? null : getNsgReplayPosition(points, time);
    marker.getElement().style.visibility = position ? "visible" : "hidden";
    if (position) marker.setLngLat([position.longitude, position.latitude]);
    if (dotRef.current) {
      dotRef.current.style.backgroundColor = color;
      dotRef.current.title = title;
    }
  });

  useEffect(() => {
    if (!map) return;
    const element = document.createElement("div");
    element.dataset.testid = "nsg-selected-marker";
    element.className = "cursor-pointer";
    element.style.visibility = "hidden";
    const dot = document.createElement("div");
    dot.className = SELECTED_DOT_CLASS;
    element.appendChild(dot);
    const marker = new Marker({ element, subpixelPositioning: true }).setLngLat([0, 0]).addTo(map);
    markerRef.current = marker;
    dotRef.current = dot;
    updateMarker(clock.get());
    const unsubscribe = clock.subscribe((time) => {
      if (time !== null) updateMarker(time);
    });

    return () => {
      unsubscribe();
      marker.remove();
      markerRef.current = null;
      dotRef.current = null;
    };
  }, [map, clock]);

  useEffect(() => {
    updateMarker(clock.get());
  }, [map, clock, points, selected, playheadMs, color, title]);

  return null;
}
