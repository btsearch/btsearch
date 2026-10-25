import type { ObservedSiteEvidence } from "@openbts/shared/contract";
import { EARTH_RADIUS_M } from "@openbts/shared/geo";
import type { Feature, FeatureCollection, Polygon, Position } from "geojson";

export type EvidenceFit = NonNullable<ObservedSiteEvidence["fit"]>;
type EvidenceGrid = NonNullable<ObservedSiteEvidence["grid"]>;
export type TimingAdvanceSquare = ObservedSiteEvidence["timingAdvanceSquares"][number];
export type EvidencePoint = { latitude: number; longitude: number };
type Bounds = [[west: number, south: number], [east: number, north: number]];

const GRID_BUCKET_TENTHS = [7, 14, 23, 30] as const;
export const TA_BUCKET_METERS = [200, 400, 600] as const;

const METERS_PER_DEGREE = (EARTH_RADIUS_M * Math.PI) / 180;
const RING_STEPS = 72;
const SQUARE_ZOOM = 20;
const SQUARE_TILES = 2 ** SQUARE_ZOOM;

function metersPerLongitudeDegree(latitude: number): number {
  return METERS_PER_DEGREE * Math.cos((latitude * Math.PI) / 180);
}

function offsetPoint(origin: EvidencePoint, eastMeters: number, northMeters: number): Position {
  return [origin.longitude + eastMeters / metersPerLongitudeDegree(origin.latitude), origin.latitude + northMeters / METERS_PER_DEGREE];
}

function toLine(coordinates: Position[], kind: string): Feature {
  return { type: "Feature", geometry: { type: "LineString", coordinates }, properties: { kind } };
}

function toPolygon(ring: Position[], properties: Feature["properties"]): Feature<Polygon> {
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties };
}

function rectangle(origin: EvidencePoint, west: number, south: number, east: number, north: number): Position[] {
  return [
    offsetPoint(origin, west, south),
    offsetPoint(origin, east, south),
    offsetPoint(origin, east, north),
    offsetPoint(origin, west, north),
    offsetPoint(origin, west, south),
  ];
}

function decodeCost(cost: string): Uint8Array {
  return Uint8Array.from(atob(cost), (character) => character.charCodeAt(0));
}

function findGridBucket(tenths: number): number | null {
  const bucket = GRID_BUCKET_TENTHS.findIndex((limit) => tenths <= limit);
  return bucket === -1 ? null : bucket;
}

export function buildGridFeatures(grid: EvidenceGrid): FeatureCollection {
  const cost = decodeCost(grid.cost);
  const { origin, cellMeters, columns, rows } = grid;
  const features: Feature[] = [];
  for (let row = 0; row < rows; row += 1) {
    let runStart = 0;
    let runBucket: number | null = null;
    for (let column = 0; column <= columns; column += 1) {
      const value = column < columns ? cost[row * columns + column] : undefined;
      const bucket = value === undefined ? null : findGridBucket(value);
      if (bucket === runBucket) continue;
      if (runBucket !== null) {
        const ring = rectangle(origin, runStart * cellMeters, row * cellMeters, column * cellMeters, (row + 1) * cellMeters);
        features.push(toPolygon(ring, { bucket: runBucket }));
      }
      runStart = column;
      runBucket = bucket;
    }
  }
  return { type: "FeatureCollection", features };
}

export function buildCircleRing(center: EvidencePoint, radiusMeters: number): Position[] {
  return buildEllipseRing(center, radiusMeters, radiusMeters, 0);
}

export function buildEllipseRing(center: EvidencePoint, majorMeters: number, minorMeters: number, azimuthDegrees: number): Position[] {
  const azimuth = (azimuthDegrees * Math.PI) / 180;
  const ring: Position[] = [];
  for (let step = 0; step <= RING_STEPS; step += 1) {
    const angle = (step / RING_STEPS) * 2 * Math.PI;
    const along = majorMeters * Math.cos(angle);
    const across = minorMeters * Math.sin(angle);
    const east = along * Math.sin(azimuth) + across * Math.cos(azimuth);
    const north = along * Math.cos(azimuth) - across * Math.sin(azimuth);
    ring.push(offsetPoint(center, east, north));
  }
  return ring;
}

function toTileX(longitude: number): number {
  return Math.floor(((longitude + 180) / 360) * SQUARE_TILES);
}

function toTileY(latitude: number): number {
  const radians = (latitude * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * SQUARE_TILES);
}

function tileLongitude(x: number): number {
  return (x / SQUARE_TILES) * 360 - 180;
}

function tileLatitude(y: number): number {
  const n = Math.PI - (2 * Math.PI * y) / SQUARE_TILES;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function buildSquareRing({ latitude, longitude }: EvidencePoint): Position[] {
  const x = toTileX(longitude);
  const y = toTileY(latitude);
  const west = tileLongitude(x);
  const east = tileLongitude(x + 1);
  const north = tileLatitude(y);
  const south = tileLatitude(y + 1);
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

function findTimingAdvanceBucket(distanceMeters: number): number {
  const bucket = TA_BUCKET_METERS.findIndex((limit) => distanceMeters < limit);
  return bucket === -1 ? TA_BUCKET_METERS.length : bucket;
}

export function buildTimingAdvanceFeatures(squares: readonly TimingAdvanceSquare[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: squares.map((square, index) => toPolygon(buildSquareRing(square), { index, bucket: findTimingAdvanceBucket(square.distanceMeters) })),
  };
}

export function buildTimingAdvanceFocus(square: TimingAdvanceSquare): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [toPolygon(buildSquareRing(square), { kind: "square" }), toLine(buildCircleRing(square, square.distanceMeters), "ring")],
  };
}

export function buildFitFeatures(fit: EvidenceFit): FeatureCollection {
  const { ellipse, alternative } = fit;
  const features = [
    toLine(buildCircleRing(fit, fit.radiusMeters), "radius"),
    toLine(buildEllipseRing(fit, ellipse.majorMeters, ellipse.minorMeters, ellipse.azimuthDegrees), "ellipse"),
  ];
  if (alternative !== null) {
    const link: Position[] = [
      [alternative.longitude, alternative.latitude],
      [fit.longitude, fit.latitude],
    ];
    features.push(toLine(link, "alternative"));
  }
  return { type: "FeatureCollection", features };
}

export function toPosition({ latitude, longitude }: EvidencePoint): Position {
  return [longitude, latitude];
}

export function getBounds(positions: readonly Position[]): Bounds | null {
  if (positions.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [longitude, latitude] of positions) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }
  return [
    [west, south],
    [east, north],
  ];
}

export function listEvidenceBounds(points: readonly EvidencePoint[], fit: EvidenceFit | null): Bounds | null {
  const fitRing = fit === null ? [] : buildCircleRing(fit, fit.radiusMeters);
  return getBounds([...points.map(toPosition), ...fitRing]);
}
