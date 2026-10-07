import type { Map as MapLibreMap } from "maplibre-gl";

export type MapBox = { west: number; south: number; east: number; north: number };
export type MapBoxCenter = { latitude: number; longitude: number };

const SNAP_GRID_DIVISIONS = 64;
const MINIMUM_SPAN_DEGREES = 1e-7;
const FULL_TURN_DEGREES = 360;
const WESTERNMOST_LONGITUDE = -180;
const EASTERNMOST_LONGITUDE = 180;
const SOUTHERNMOST_LATITUDE = -90;
const NORTHERNMOST_LATITUDE = 90;
const BOX_PART_COUNT = 4;

export function readSnappedMapBox(map: MapLibreMap): MapBox {
  const bounds = map.getBounds();
  const span = Math.max(bounds.getNorth() - bounds.getSouth(), MINIMUM_SPAN_DEGREES);
  const step = 2 ** Math.floor(Math.log2(span / SNAP_GRID_DIVISIONS));
  const snapDown = (value: number) => Math.floor(value / step) * step;
  const snapUp = (value: number) => Math.ceil(value / step) * step;

  return { west: snapDown(bounds.getWest()), south: snapDown(bounds.getSouth()), east: snapUp(bounds.getEast()), north: snapUp(bounds.getNorth()) };
}

export function formatV1Bounds(box: MapBox): string {
  return `${box.south},${box.west},${box.north},${box.east}`;
}

function wrapLongitudes(west: number, east: number): [number, number] {
  if (east - west >= FULL_TURN_DEGREES) return [WESTERNMOST_LONGITUDE, EASTERNMOST_LONGITUDE];

  const wholeTurns = Math.floor((west - WESTERNMOST_LONGITUDE) / FULL_TURN_DEGREES) * FULL_TURN_DEGREES;
  const wrappedWest = west - wholeTurns;
  const wrappedEast = east - wholeTurns;
  return [wrappedWest, wrappedEast > EASTERNMOST_LONGITUDE ? wrappedEast - FULL_TURN_DEGREES : wrappedEast];
}

export function formatV2Bbox(box: MapBox): string {
  const [west, east] = wrapLongitudes(box.west, box.east);
  const south = Math.max(SOUTHERNMOST_LATITUDE, box.south);
  const north = Math.min(NORTHERNMOST_LATITUDE, box.north);
  return `${west},${south},${east},${north}`;
}

export function parseV1Bounds(bounds: string): MapBox | null {
  const parts = bounds.split(",").map(Number);
  if (parts.length !== BOX_PART_COUNT || parts.some((part) => Number.isNaN(part))) return null;

  const [south, west, north, east] = parts;
  return { west, south, east, north };
}

export function toV2Bbox(bounds: string): string | null {
  const box = parseV1Bounds(bounds);
  return box === null ? null : formatV2Bbox(box);
}

export function getMapBoxCenter(box: MapBox): MapBoxCenter {
  return { latitude: (box.south + box.north) / 2, longitude: (box.west + box.east) / 2 };
}
