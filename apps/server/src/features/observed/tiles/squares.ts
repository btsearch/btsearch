export const SQUARE_ZOOM = 20;

const MAX_LATITUDE = 85.05112877980659;

export type Point = { latitude: number; longitude: number };
export type Tile = { zoom: number; x: number; y: number };
type Ring = readonly (readonly [longitude: number, latitude: number])[];
export type Polygon = readonly Ring[];
export type QuadkeyRange = readonly [first: number, last: number];

export function tileAt({ latitude, longitude }: Point, zoom: number): Tile {
  const size = 2 ** zoom;
  const sine = Math.sin((Math.min(Math.max(latitude, -MAX_LATITUDE), MAX_LATITUDE) * Math.PI) / 180);
  const x = ((longitude + 180) / 360) * size;
  const y = (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size;
  const last = size - 1;
  return { zoom, x: Math.trunc(Math.min(Math.max(x, 0), last)), y: Math.trunc(Math.min(Math.max(y, 0), last)) };
}

export function quadkeyOf({ zoom, x, y }: Tile): number {
  let key = 0;
  for (let level = zoom - 1; level >= 0; level--) key = key * 4 + ((y >> level) & 1) * 2 + ((x >> level) & 1);
  return key;
}

export function tileOfQuadkey(key: number, zoom: number): Tile {
  let x = 0;
  let y = 0;
  for (let level = 0; level < zoom; level++) {
    const digit = Math.floor(key / 4 ** level) % 4;
    x += (digit % 2) * 2 ** level;
    y += Math.floor(digit / 2) * 2 ** level;
  }
  return { zoom, x, y };
}

function pointInTiles(zoom: number, x: number, y: number): Point {
  const size = 2 ** zoom;
  return { latitude: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI, longitude: (x / size) * 360 - 180 };
}

export function tileCenter({ zoom, x, y }: Tile): Point {
  return pointInTiles(zoom, x + 0.5, y + 0.5);
}

export function squareCenter(square: number, zoom = SQUARE_ZOOM): Point {
  return tileCenter(tileOfQuadkey(square, zoom));
}

export function childRange(tile: Tile, zoom: number): QuadkeyRange {
  const children = 4 ** (zoom - tile.zoom);
  const key = quadkeyOf(tile);
  return [key * children, (key + 1) * children - 1];
}

function boundsOf(polygons: readonly Polygon[]) {
  const corners = polygons.flatMap((polygon) => polygon.flat());
  return {
    west: Math.min(...corners.map(([longitude]) => longitude)),
    east: Math.max(...corners.map(([longitude]) => longitude)),
    south: Math.min(...corners.map(([, latitude]) => latitude)),
    north: Math.max(...corners.map(([, latitude]) => latitude)),
  };
}

export function rangesCovering(polygons: readonly Polygon[], zoom: number, mostTiles = 4): QuadkeyRange[] {
  if (polygons.every((polygon) => polygon.every((ring) => ring.length === 0))) return [];

  const { west, east, south, north } = boundsOf(polygons);
  for (let coarser = zoom; coarser >= 0; coarser--) {
    const northWest = tileAt({ latitude: north, longitude: west }, coarser);
    const southEast = tileAt({ latitude: south, longitude: east }, coarser);
    const columns = southEast.x - northWest.x + 1;
    const rows = southEast.y - northWest.y + 1;
    if (columns * rows > mostTiles && coarser > 0) continue;

    return Array.from({ length: columns * rows }, (_, index) =>
      childRange({ zoom: coarser, x: northWest.x + (index % columns), y: northWest.y + Math.floor(index / columns) }, zoom),
    );
  }
  return [];
}

function crossings({ latitude, longitude }: Point, ring: Ring): number {
  let count = 0;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [longitudeA, latitudeA] = ring[index]!;
    const [longitudeB, latitudeB] = ring[previous]!;
    const spans = latitudeA > latitude !== latitudeB > latitude;
    if (spans && longitude < ((longitudeB - longitudeA) * (latitude - latitudeA)) / (latitudeB - latitudeA) + longitudeA) count++;
  }
  return count;
}

export function isInside(point: Point, polygons: readonly Polygon[]): boolean {
  return polygons.some((polygon) => polygon.reduce((total, ring) => total + crossings(point, ring), 0) % 2 === 1);
}
