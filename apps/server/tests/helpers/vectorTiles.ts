import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

export type TileCorner = { x: number; y: number };
export type DecodedFeature = {
  id: number | undefined;
  properties: Record<string, number | string | boolean>;
  ring: TileCorner[];
  bounds: { west: number; south: number; east: number; north: number };
};
export type DecodedLayer = { extent: number; features: DecodedFeature[] };

export function decodeTile(body: Buffer, tile: { z: number; x: number; y: number }): Record<string, DecodedLayer> {
  const decoded = new VectorTile(new PbfReader(body));
  return Object.fromEntries(
    Object.entries(decoded.layers).map(([name, layer]) => [
      name,
      {
        extent: layer.extent,
        features: Array.from({ length: layer.length }, (_, index) => {
          const feature = layer.feature(index);
          const [ring = []] = feature.loadGeometry();
          const geometry = feature.toGeoJSON(tile.x, tile.y, tile.z).geometry;
          const corners = geometry.type === "Polygon" ? (geometry.coordinates[0] ?? []) : [];
          const longitudes = corners.map(([longitude]) => longitude ?? 0);
          const latitudes = corners.map(([, latitude]) => latitude ?? 0);
          return {
            id: feature.id,
            properties: feature.properties,
            ring: ring.map(({ x, y }) => ({ x, y })),
            bounds: {
              west: Math.min(...longitudes),
              south: Math.min(...latitudes),
              east: Math.max(...longitudes),
              north: Math.max(...latitudes),
            },
          };
        }),
      },
    ]),
  );
}

export function surveyorArea(ring: readonly TileCorner[]): number {
  return (
    ring.reduce((total, corner, index) => {
      const next = ring[(index + 1) % ring.length] ?? corner;
      return total + corner.x * next.y - next.x * corner.y;
    }, 0) / 2
  );
}
