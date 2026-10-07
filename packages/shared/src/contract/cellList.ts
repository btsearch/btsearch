import { z } from "zod/v4";

import { csvBandIdsSchema } from "./bands.ts";
import { CELL_RATS, gsmCellSchema, lteCellSchema, nrCellSchema, umtsCellSchema } from "./cells.ts";
import {
  CURSOR_OR_OFFSET_ISSUE,
  INCLUDE_TOTAL_NOTE,
  LIMIT_NOTE,
  booleanQuerySchema,
  csvEnumSchema,
  csvIdsSchema,
  cursorSchema,
  idParamSchema,
  instantSchema,
  offsetSchema,
  pagingSchema,
  usesCursorOrOffset,
} from "./common.ts";
import { STATION_STATUSES, areaFilterShape, stationBaseSchema } from "./stations.ts";

export const CELL_INCLUDES = ["band", "station"] as const;
export type CellInclude = (typeof CELL_INCLUDES)[number];

export const CELL_SORTS = ["-id", "id", "createdAt", "-createdAt", "updatedAt", "-updatedAt"] as const;
export type CellSort = (typeof CELL_SORTS)[number];

const stationPart = { station: stationBaseSchema.optional().describe("Only returned with `include=station`") };

export const listedGsmCellSchema = gsmCellSchema.extend(stationPart);
export const listedUmtsCellSchema = umtsCellSchema.extend(stationPart);
export const listedLteCellSchema = lteCellSchema.extend(stationPart);
export const listedNrCellSchema = nrCellSchema.extend(stationPart);

export const listedCellSchema = z.discriminatedUnion("rat", [listedGsmCellSchema, listedUmtsCellSchema, listedLteCellSchema, listedNrCellSchema]);
export type ListedCell = z.infer<typeof listedCellSchema>;

export const cellParamsSchema = z.object({ id: idParamSchema });

export const cellQuerySchema = z.object({ include: csvEnumSchema(CELL_INCLUDES).optional() }).strict();
export type CellQuery = z.infer<typeof cellQuerySchema>;

const OPERATORS_NOTE = "Filters by operator. For a shared network, the cells of its members are returned too. Comma-separated ids";
const STATUSES_NOTE =
  "Filters by the status of the cell's station. If omitted, cells of `inactive` stations are not returned. " +
  `Comma-separated list. Possible values: \`${STATION_STATUSES.join("`, `")}\``;
const SORT_NOTE = "The field to sort by, with a leading `-` for descending order. A `cursor` only works with the `sort` it was returned for";

export const cellListQuerySchema = z
  .object({
    stationIds: csvIdsSchema.optional(),
    operatorIds: csvIdsSchema.optional().describe(OPERATORS_NOTE),
    bandIds: csvBandIdsSchema.optional(),
    rats: csvEnumSchema(CELL_RATS).optional(),
    statuses: csvEnumSchema(STATION_STATUSES).optional().describe(STATUSES_NOTE),
    ...areaFilterShape,
    createdAfter: instantSchema.optional().describe("Only cells added at or after this time"),
    updatedAfter: instantSchema.optional().describe("Only cells last changed at or after this time"),
    include: csvEnumSchema(CELL_INCLUDES).optional(),
    sort: z.enum(CELL_SORTS).default("-id").describe(SORT_NOTE),
    limit: z.coerce.number<number>().int().min(1).max(1000).default(50).describe(LIMIT_NOTE),
    cursor: cursorSchema.optional(),
    offset: offsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional().describe(INCLUDE_TOTAL_NOTE),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type CellListQuery = z.infer<typeof cellListQuerySchema>;

export const cellListSchema = z.object({
  data: z.array(listedCellSchema),
  paging: pagingSchema,
});
export type CellList = z.infer<typeof cellListSchema>;
