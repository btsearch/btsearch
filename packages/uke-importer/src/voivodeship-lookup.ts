import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { featureCollection, point, polygon } from "@turf/helpers";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from "geojson";
import geojsonRbush from "geojson-rbush";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const createGeojsonRbush = geojsonRbush as unknown as typeof import("geojson-rbush").default;

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const geojsonPath = path.join(__dirname, "..", "poland.voivodeships.max.json");
const TOLERANCE_METERS = 2000;
const METERS_PER_DEGREE = 111_320;

interface VoivodeshipProperties {
  terc: string;
  name: string;
}

type VoivodeshipFeature = Feature<Polygon, VoivodeshipProperties>;

function explodeMultiPolygons(fc: FeatureCollection): FeatureCollection<Polygon, VoivodeshipProperties> {
  const out: VoivodeshipFeature[] = [];
  for (const f of fc.features) {
    if (f.geometry?.type === "Polygon") {
      out.push(f as VoivodeshipFeature);
    } else if (f.geometry?.type === "MultiPolygon") {
      const multiPolygon = f as Feature<MultiPolygon, VoivodeshipProperties>;
      for (const rings of multiPolygon.geometry.coordinates) {
        out.push(polygon(rings, multiPolygon.properties) as VoivodeshipFeature);
      }
    }
  }
  return featureCollection(out) as FeatureCollection<Polygon, VoivodeshipProperties>;
}

function createSpatialIndex() {
  const woj = JSON.parse(fs.readFileSync(geojsonPath, "utf8")) as FeatureCollection;
  const wojExploded = explodeMultiPolygons(woj);

  const tree = createGeojsonRbush<Geometry>();
  tree.load(wojExploded);

  return tree;
}

const tree = createSpatialIndex();

function segmentDistanceFromOrigin([ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function distanceToOutline(lon: number, lat: number, feature: VoivodeshipFeature): number {
  const lonScale = METERS_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
  const toMeters = ([x = lon, y = lat]: Position): [number, number] => [(x - lon) * lonScale, (y - lat) * METERS_PER_DEGREE];

  let nearest = Number.POSITIVE_INFINITY;
  for (const ring of feature.geometry.coordinates) {
    for (const [index, end] of ring.entries()) {
      const start = ring[index - 1];
      if (start !== undefined) nearest = Math.min(nearest, segmentDistanceFromOrigin(toMeters(start), toMeters(end)));
    }
  }
  return nearest;
}

function nearestTerytWithinTolerance(lon: number, lat: number): string | null {
  const latSpan = TOLERANCE_METERS / METERS_PER_DEGREE;
  const lonSpan = latSpan / Math.cos((lat * Math.PI) / 180);
  const candidates = tree.search([lon - lonSpan, lat - latSpan, lon + lonSpan, lat + latSpan]).features as VoivodeshipFeature[];

  let nearest: { terc: string; distance: number } | null = null;
  for (const feature of candidates) {
    const distance = distanceToOutline(lon, lat, feature);
    if (distance <= TOLERANCE_METERS && (nearest === null || distance < nearest.distance)) nearest = { terc: feature.properties.terc, distance };
  }
  return nearest?.terc ?? null;
}

export function findVoivodeshipByTeryt(lon: number, lat: number): string | null {
  const pt = point([lon, lat]);
  const candidates = tree.search(pt).features as VoivodeshipFeature[];
  for (const f of candidates) {
    if (booleanPointInPolygon(pt, f)) return f.properties?.terc ?? null;
  }

  return nearestTerytWithinTolerance(lon, lat);
}
