import { z } from "zod/v4";

import { cellSchema } from "./cells.ts";
import { idSchema } from "./common.ts";
import { cellChangeList, cellUpdateChangeSchema, newGsmCellSchema, newLteCellSchema, newNrCellSchema, newUmtsCellSchema } from "./submissions.ts";

export const MAX_STATIONS_PER_APPLY = 50;

const CHANGES_NOTE =
  "Every cell created or updated here is marked as confirmed. A new or changed LTE TAC is also applied to the station's other LTE cells, " +
  "so the changes for one station can contain only one such TAC";
const WRITTEN_NOTE =
  "The cells written to the station: first the created cells, then the updated cells, both in the order sent, " +
  "then the other LTE cells that received the TAC";
const OPERATION_ID_NOTE =
  "The audit operation that recorded everything the request wrote. One request is always one operation of the kind `analyzer.apply`. " +
  "`GET /audit-operations/{id}` returns it to administrators and to maintainers of the country";

const NOT_SENT = { isConfirmed: true, sectorKey: true } as const;
const createAction = { action: z.literal("create") };

const cellApplyCreateSchema = z.discriminatedUnion("rat", [
  newGsmCellSchema.omit(NOT_SENT).extend(createAction).strict(),
  newUmtsCellSchema.omit(NOT_SENT).extend(createAction).strict(),
  newLteCellSchema.omit(NOT_SENT).extend(createAction).strict(),
  newNrCellSchema.omit(NOT_SENT).extend(createAction).strict(),
]);
const cellApplyUpdateSchema = cellUpdateChangeSchema.omit({ sectorKey: true }).strict();

export const cellApplyChangeSchema = z.union([cellApplyCreateSchema, cellApplyUpdateSchema]);
export type CellApplyChange = z.infer<typeof cellApplyChangeSchema>;

export const cellApplySchema = z
  .object({
    stationId: idSchema.describe("The station whose cells are created and updated. A station can be listed once per request"),
    cells: cellChangeList(cellApplyChangeSchema, "request").min(1).describe(CHANGES_NOTE),
  })
  .strict();
export type CellApply = z.infer<typeof cellApplySchema>;

function listsEachStationOnce(items: readonly CellApply[]): boolean {
  return new Set(items.map((item) => item.stationId)).size === items.length;
}

export const cellApplyManySchema = z
  .array(cellApplySchema)
  .min(1)
  .max(MAX_STATIONS_PER_APPLY)
  .refine(listsEachStationOnce, { message: "A station can be listed once per request" });

export const appliedCellsSchema = z.object({
  stationId: z.number().int(),
  cells: z.array(cellSchema).describe(WRITTEN_NOTE),
});
export type AppliedCells = z.infer<typeof appliedCellsSchema>;

export const cellApplyAnswerSchema = z.object({
  data: z.array(appliedCellsSchema).describe("One entry per station, in the order they were sent"),
  operationId: z.number().int().describe(OPERATION_ID_NOTE),
});
export type CellApplyAnswer = z.infer<typeof cellApplyAnswerSchema>;
