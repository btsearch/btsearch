import { z } from "zod/v4";

import { AT_LEAST_ONE_FIELD_ISSUE, hasAnyField } from "./common.ts";
import {
  MAX_CELL_CHANGES,
  MAX_SECTOR_CHANGES,
  SECTOR_LIMITS_NOTE,
  cellChangeList,
  cellEditInputSchema,
  locationChangeInputSchema,
  newCellInputSchema,
  newLocationInputSchema,
  newSectorInputSchema,
  newStationInputSchema,
  sectorChangeInputSchema,
  stationEditInputSchema,
} from "./submissions.ts";

const STATUS_FOLLOWS_CELLS =
  "Adding the first cell makes an `awaitingCells` station `active`, and removing the last cell makes it `awaitingCells` again. " +
  "A `status` sent in `station` takes precedence";
const SECTOR_CHANGES_NOTE = `Sectors that are not listed stay as they are. ${SECTOR_LIMITS_NOTE}, and a sector can only be deleted once no cell is attached to it`;

export const stationCreateSchema = z
  .object({
    station: newStationInputSchema,
    location: newLocationInputSchema.optional().describe("If omitted, the station has no location and belongs to its operator's country"),
    sectors: z.array(newSectorInputSchema).max(MAX_SECTOR_CHANGES).optional().describe(SECTOR_LIMITS_NOTE),
    cells: z.array(newCellInputSchema).max(MAX_CELL_CHANGES).optional().describe("A station created without cells gets the status `awaitingCells`"),
  })
  .strict();
export type StationCreate = z.infer<typeof stationCreateSchema>;

export const stationUpdateSchema = z
  .object({
    station: stationEditInputSchema.optional(),
    location: locationChangeInputSchema.nullable().optional().describe("Send `null` to detach the station from its location"),
    sectors: z.array(sectorChangeInputSchema).max(MAX_SECTOR_CHANGES).optional().describe(SECTOR_CHANGES_NOTE),
    cells: cellChangeList(cellEditInputSchema, "request").optional().describe(STATUS_FOLLOWS_CELLS),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type StationUpdate = z.infer<typeof stationUpdateSchema>;

export const cellCreateManySchema = z.array(newCellInputSchema).min(1).max(MAX_CELL_CHANGES);
