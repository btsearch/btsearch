import { z } from "zod/v4";

import { cellSchema } from "./cells.ts";
import { idSchema } from "./common.ts";
import { OBSERVATION_FLAG_CLOSED_REASONS } from "./constants.ts";
import { cellChangeList, cellUpdateChangeSchema, newGsmCellSchema, newLteCellSchema, newNrCellSchema, newUmtsCellSchema } from "./submissions.ts";

export const MAX_STATIONS_PER_APPLY = 50;

const CHANGES_NOTE =
  "Every cell created or updated here is marked as confirmed. In countries where all LTE cells of a station share one TAC, " +
  "a new or changed LTE TAC is also applied to the station's other LTE cells, so the changes for one station can contain only one such TAC";
const WRITTEN_NOTE =
  "The cells written to the station: first the created cells, then the updated cells, both in the order sent, " +
  "then, in countries where all LTE cells of a station share one TAC, the other LTE cells that received the TAC";
const OPERATION_ID_NOTE =
  "The audit operation that recorded everything the request wrote. One request is always one operation of the kind `analyzer.apply`. " +
  "`GET /audit-operations/{id}` returns it to administrators and to maintainers of the country";

const FLAG_IDS_NOTE = "Open flags of `GET /observed/flags` that these changes fix, each about this station";
const MAX_FLAGS_PER_STATION = 20;

const NOT_SENT = { isConfirmed: true, sectorKey: true } as const;
const createAction = { action: z.literal("create") };

export const cellApplyNewCellSchema = z.discriminatedUnion("rat", [
  newGsmCellSchema.omit(NOT_SENT),
  newUmtsCellSchema.omit(NOT_SENT),
  newLteCellSchema.omit(NOT_SENT),
  newNrCellSchema.omit(NOT_SENT),
]);
export type CellApplyNewCell = z.infer<typeof cellApplyNewCellSchema>;

const cellApplyCreateSchema = z.discriminatedUnion("rat", [
  newGsmCellSchema.omit(NOT_SENT).extend(createAction).strict(),
  newUmtsCellSchema.omit(NOT_SENT).extend(createAction).strict(),
  newLteCellSchema.omit(NOT_SENT).extend(createAction).strict(),
  newNrCellSchema.omit(NOT_SENT).extend(createAction).strict(),
]);
const cellApplyUpdateSchema = cellUpdateChangeSchema.omit({ sectorKey: true }).strict();
export type CellApplyUpdate = z.infer<typeof cellApplyUpdateSchema>;

export const cellApplyChangeSchema = z.union([cellApplyCreateSchema, cellApplyUpdateSchema]);
export type CellApplyChange = z.infer<typeof cellApplyChangeSchema>;

export const cellApplySchema = z
  .object({
    stationId: idSchema.describe("A station can be listed once per request"),
    cells: cellChangeList(cellApplyChangeSchema, "request").min(1).describe(CHANGES_NOTE),
    observationFlagIds: z.array(idSchema).min(1).max(MAX_FLAGS_PER_STATION).optional().describe(FLAG_IDS_NOTE),
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
  closedObservationFlagIds: z.array(z.number().int()).describe("The flags in the station's `observationFlagIds`, now closed as `applied`"),
});
export type AppliedCells = z.infer<typeof appliedCellsSchema>;

export const cellApplyConflictSchema = z.object({
  kind: z.literal("flagClosed"),
  field: z.string().describe("The flag's path in the request"),
  observationFlagId: z.number().int(),
  closedReason: z.enum(OBSERVATION_FLAG_CLOSED_REASONS).describe("As the flag's own `closedReason` says it"),
});
export type CellApplyConflict = z.infer<typeof cellApplyConflictSchema>;

export const cellApplyAnswerSchema = z.object({
  data: z.array(appliedCellsSchema).describe("One entry per station, in the order they were sent"),
  operationId: z.number().int().describe(OPERATION_ID_NOTE),
});
export type CellApplyAnswer = z.infer<typeof cellApplyAnswerSchema>;
