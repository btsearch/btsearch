import type { TileParams } from "@openbts/shared/contract";
import { type SQL, type SQLWrapper, sql } from "drizzle-orm";
import type { FastifyReply } from "fastify";

import db from "../../../database/psql.js";
import { type Tile, childRange, quadkeyOf } from "./squares.js";

export const VECTOR_TILE_TYPE = "application/vnd.mapbox-vector-tile";
const TILE_EXTENT = 256;
const SQUARE_DEPTH = 6;
export const TRAIL_MIN_ZOOM = 6;
export const COVERAGE_MIN_ZOOM = 12;
export const TRAIL_ZOOM = 20;
export const PERSON_TRAIL_ZOOM = 18;
export const TILE_JSON_MAX_ZOOM = TRAIL_ZOOM - SQUARE_DEPTH;
export const PERSON_TRAIL_MAX_ZOOM = PERSON_TRAIL_ZOOM - SQUARE_DEPTH;
export const EMPTY_TILE = Buffer.alloc(0);

export const PUBLIC_TILE_CACHE = "public, max-age=3600, stale-while-revalidate=86400";
export const PRIVATE_TILE_CACHE = "private, max-age=60";
export const STAFF_TILE_CACHE = "private, no-store";
export const TILE_JSON_CACHE = "public, max-age=3600";
export const PRIVATE_TILE_JSON_CACHE = "private, max-age=3600";

export type TileSquares = { tile: Tile; zoom: number; first: number; last: number; shift: number };

export function tileOf(params: TileParams): Tile {
  return { zoom: params.z, x: params.x, y: params.y };
}

export function squareZoom(zoom: number, minZoom: number, finestZoom = TRAIL_ZOOM): number | null {
  if (zoom < minZoom) return null;
  return Math.min(finestZoom, zoom - (zoom % 2) + SQUARE_DEPTH);
}

export function tileSquares(tile: Tile, zoom: number, storedZoom: number): TileSquares {
  const shift = 2 * (storedZoom - zoom);
  if (storedZoom >= tile.zoom) {
    const [first, last] = childRange(tile, storedZoom);
    return { tile, zoom, first, last, shift };
  }
  const ancestor = Math.floor(quadkeyOf(tile) / 4 ** (tile.zoom - storedZoom));
  return { tile, zoom, first: ancestor, last: ancestor, shift };
}

function interleavedBits(offset: SQL, firstBit: number): SQL {
  const bits = Array.from(
    { length: SQUARE_DEPTH },
    (_, level) => sql`((${offset} >> ${sql.raw(String(level + firstBit))}) & ${sql.raw(String(2 ** level))})`,
  );
  return sql`(${sql.join(bits, sql` | `)})`;
}

export function squareOutline({ tile, zoom }: TileSquares, square: SQLWrapper): SQL {
  const bounds = sql`ST_TileEnvelope(${sql.raw(String(tile.zoom))}, ${sql.raw(String(tile.x))}, ${sql.raw(String(tile.y))})`;
  const depth = zoom - tile.zoom;
  if (depth < 0) {
    const outline = sql`ST_TileEnvelope(${sql.raw(String(zoom))}, ${sql.raw(String(tile.x >> -depth))}, ${sql.raw(String(tile.y >> -depth))})`;
    return sql`ST_AsMVTGeom(${outline}, ${bounds}, ${sql.raw(String(TILE_EXTENT))}, 0, true)`;
  }
  const [firstSquare] = childRange(tile, zoom);
  const offset = sql`(${square} - ${sql.raw(String(firstSquare))})::int`;
  const x = sql`${sql.raw(String(tile.x * 2 ** depth))} + ${interleavedBits(offset, 0)}`;
  const y = sql`${sql.raw(String(tile.y * 2 ** depth))} + ${interleavedBits(offset, 1)}`;
  const outline = sql`ST_TileEnvelope(${sql.raw(String(zoom))}, ${x}, ${y})`;
  return sql`ST_AsMVTGeom(${outline}, ${bounds}, ${sql.raw(String(TILE_EXTENT))}, 0, false)`;
}

export async function buildTile(layer: string, features: SQL, featureIdColumn?: string): Promise<Buffer> {
  const encoding = featureIdColumn
    ? sql`ST_AsMVT(feature, ${layer}, ${sql.raw(String(TILE_EXTENT))}, 'geom', ${featureIdColumn})`
    : sql`ST_AsMVT(feature, ${layer}, ${sql.raw(String(TILE_EXTENT))}, 'geom')`;
  const [row] = await db.execute<{ tile: Buffer }>(sql`SELECT coalesce(${encoding}, ''::bytea) AS tile FROM (${features}) AS feature`);
  return row?.tile ?? EMPTY_TILE;
}

export function withTileHeaders(res: FastifyReply, cacheControl: string): FastifyReply {
  return res.header("Content-Type", VECTOR_TILE_TYPE).header("Cache-Control", cacheControl);
}
