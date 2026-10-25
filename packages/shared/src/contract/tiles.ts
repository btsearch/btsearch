import { z } from "zod/v4";

import { csvBandIdsSchema } from "./bands.ts";
import { MAX_ID, csvEnumSchema, csvIdsSchema, csvSchema } from "./common.ts";
import { CELL_RATS } from "./constants.ts";

export const TILE_MAX_ZOOM = 20;
export const TRAIL_OPERATOR_LIMIT = 4;
export const COVERAGE_CELL_LIMIT = 48;

const tileIdsSchema = (limit: number) => csvSchema.pipe(z.array(z.coerce.number<string>().int().positive().max(MAX_ID)).min(1).max(limit));

export const tileParamsSchema = z
  .object({
    z: z.coerce.number<string>().int().min(0).max(TILE_MAX_ZOOM),
    x: z.coerce.number<string>().int().min(0),
    y: z.coerce.number<string>().int().min(0),
  })
  .refine(({ z: zoom, x, y }) => x < 2 ** zoom && y < 2 ** zoom, { path: ["x"], message: "Must be a tile of this zoom" });
export type TileParams = z.infer<typeof tileParamsSchema>;

export const trailTileQuerySchema = z
  .object({
    operatorIds: tileIdsSchema(TRAIL_OPERATOR_LIMIT).describe(
      "Comma-separated ids of up to 4 operators. For a shared network, its members' networks count too",
    ),
    rats: csvEnumSchema(CELL_RATS).optional(),
    bandIds: csvBandIdsSchema
      .optional()
      .describe("Comma-separated band ids. Use `unknown` for squares whose channel no single band of the country's band plan holds"),
  })
  .strict();
export type TrailTileQuery = z.infer<typeof trailTileQuerySchema>;

export const myTrailTileQuerySchema = z
  .object({
    operatorIds: csvIdsSchema.optional().describe("Comma-separated ids. For a shared network, its members' networks count too"),
    rats: csvEnumSchema(CELL_RATS).optional(),
  })
  .strict();
export type MyTrailTileQuery = z.infer<typeof myTrailTileQuerySchema>;

export const coverageTileQuerySchema = z
  .object({
    observedCellIds: tileIdsSchema(COVERAGE_CELL_LIMIT).describe(
      "Comma-separated ids of up to 48 observed cells, usually the cells of one site. Sorted ids let you share tiles other people already asked for",
    ),
  })
  .strict();
export type CoverageTileQuery = z.infer<typeof coverageTileQuerySchema>;

export const tileJsonSchema = z.object({
  tilejson: z.literal("3.0.0"),
  name: z.string(),
  attribution: z.string(),
  tiles: z.array(z.string()),
  minzoom: z.number().int(),
  maxzoom: z.number().int(),
  vector_layers: z.array(z.object({ id: z.string(), fields: z.record(z.string(), z.string()) })),
});
export type TileJson = z.infer<typeof tileJsonSchema>;
