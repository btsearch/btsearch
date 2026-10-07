import { z } from "zod/v4";

import { AUDIT_SOURCES } from "../audit.ts";
import { UNKNOWN_BAND_NOTE } from "./bands.ts";
import { CELL_RATS } from "./cells.ts";
import { LIMIT_NOTE, cursorSchema, pagingSchema, userRefSchema } from "./common.ts";
import { photoUrlsSchema } from "./photos.ts";
import { sectorSchema } from "./stations.ts";

export const STATION_HISTORY_LIMIT = { default: 25, max: 100 } as const;

export const STATION_HISTORY_ACTIONS = ["create", "update", "delete"] as const;
export type StationHistoryAction = (typeof STATION_HISTORY_ACTIONS)[number];

export const STATION_HISTORY_REVERT_STATUSES = ["none", "partial", "complete"] as const;
export type StationHistoryRevertStatus = (typeof STATION_HISTORY_REVERT_STATUSES)[number];

export const STATION_HISTORY_STATION_FIELDS = ["siteId", "status", "notes", "operatorId", "isConfirmed"] as const;
export const STATION_HISTORY_LOCATION_FIELDS = [
  "regionId",
  "city",
  "address",
  "longitude",
  "latitude",
  "structureType",
  "structureOwner",
  "structureNote",
] as const;
export const STATION_HISTORY_IDENTIFIER_FIELDS = ["networksId", "networksName", "operatorName"] as const;
export const STATION_HISTORY_BACKHAUL_FIELDS = ["medium", "speedMbps", "model"] as const;
export const STATION_HISTORY_CELL_FIELDS = [
  "rat",
  "bandId",
  "cellType",
  "notes",
  "isConfirmed",
  "mode",
  "lac",
  "cid",
  "rnc",
  "enbid",
  "gnbid",
  "gnbidLength",
  "clid",
  "tac",
  "pci",
  "psc",
  "bsic",
  "uarfcn",
  "earfcn",
  "arfcn",
  "isEGsm",
  "supportsIot",
  "supportsRedCap",
] as const;

const VALUE_NOTE = "`null` if it was not set";
const REVERT_CALLER_NOTE = "if you are not allowed to revert changes to this station";

const historyValueSchema = z.union([z.string(), z.number(), z.boolean()]).nullable();
export type StationHistoryValue = z.infer<typeof historyValueSchema>;

function valueChangeSchema<const T extends readonly [string, ...string[]]>(fields: T) {
  return z.object({
    field: z.enum(fields).describe("The name of the field in the v2 API"),
    from: historyValueSchema.describe(`The value before the change, as the v2 API returns it, or ${VALUE_NOTE}`),
    to: historyValueSchema.describe(`The value after the change, or ${VALUE_NOTE}`),
  });
}

export const stationHistoryLocationSchema = z.object({
  id: z.number().int(),
  city: z.string().nullable(),
  address: z.string().nullable(),
});
export type StationHistoryLocation = z.infer<typeof stationHistoryLocationSchema>;

const locationRefChangeSchema = z.object({
  field: z.literal("location"),
  from: stationHistoryLocationSchema.nullable().describe("The location the station was at before the change, or `null` if it had none"),
  to: stationHistoryLocationSchema.nullable().describe("The location the station is at after the change, or `null` if it has none"),
});

const sectorRefChangeSchema = z.object({
  field: z.literal("sector"),
  from: sectorSchema.nullable().describe("The cell's sector as it was at that time, or `null` if it had none"),
  to: sectorSchema.nullable().describe("The cell's sector after the change, as it was at that time, or `null` if it has none"),
});

const azimuthSchema = z.number().int().nullable();
const azimuthsChangeSchema = z.object({
  field: z.literal("azimuths"),
  from: z.array(azimuthSchema).describe("The station's sector azimuths before the change, in sector order. `null` means an omnidirectional sector"),
  to: z.array(azimuthSchema).describe("The station's sector azimuths after the change, in the same form"),
});

const changeShape = {
  action: z
    .enum(STATION_HISTORY_ACTIONS)
    .describe(
      "Whether the part was created, updated or deleted. For `photos`, `create` means that photos were only added and " +
        "`delete` that photos were only removed. Always `update` for `sectors`",
    ),
  revertStatus: z.enum(STATION_HISTORY_REVERT_STATUSES).describe("Whether this part was reverted later"),
  isRevertible: z.boolean().describe(`Whether you can revert this part now. \`false\` ${REVERT_CALLER_NOTE}`),
  entryIds: z.array(z.number().int()).describe(`The entry ids to pass to \`POST /audit-operations/{id}/revert\`. Empty ${REVERT_CALLER_NOTE}`),
};

export const stationHistoryStationChangeSchema = z.object({
  kind: z.literal("station"),
  ...changeShape,
  fields: z.array(z.union([valueChangeSchema(STATION_HISTORY_STATION_FIELDS), locationRefChangeSchema])),
});

export const stationHistoryLocationChangeSchema = z.object({
  kind: z.literal("location"),
  ...changeShape,
  fields: z
    .array(valueChangeSchema(STATION_HISTORY_LOCATION_FIELDS))
    .describe("`structureOwner` holds the owner's name, or the owner's id if the name is no longer known"),
});

export const stationHistoryIdentifiersChangeSchema = z.object({
  kind: z.literal("identifiers"),
  ...changeShape,
  fields: z.array(valueChangeSchema(STATION_HISTORY_IDENTIFIER_FIELDS)),
});

export const stationHistoryBackhaulChangeSchema = z.object({
  kind: z.literal("backhaul"),
  ...changeShape,
  fields: z.array(valueChangeSchema(STATION_HISTORY_BACKHAUL_FIELDS)),
});

export const stationHistorySectorsChangeSchema = z.object({
  kind: z.literal("sectors"),
  ...changeShape,
  fields: z.array(azimuthsChangeSchema),
});

export const stationHistoryCellSchema = z.object({
  id: z.number().int(),
  rat: z.enum(CELL_RATS),
  bandId: z.number().int().nullable().describe(UNKNOWN_BAND_NOTE),
  cid: z.number().int().nullable().describe("Only set for GSM and UMTS cells"),
  clid: z.number().int().nullable().describe("Only set for LTE and NR cells"),
  fields: z
    .array(z.union([valueChangeSchema(STATION_HISTORY_CELL_FIELDS), sectorRefChangeSchema]))
    .describe("The fields that changed on the cell. For a new or removed cell, every value it has"),
});
export type StationHistoryCell = z.infer<typeof stationHistoryCellSchema>;

export const stationHistoryCellsChangeSchema = z.object({
  kind: z.literal("cells"),
  ...changeShape,
  cells: z.array(stationHistoryCellSchema).describe("Each cell as it was before the change, or as it was created if it is new"),
});

export const stationHistoryPhotoSchema = z.object({
  id: z.uuid().nullable().describe("`null` if the photo no longer exists"),
  urls: photoUrlsSchema.nullable().describe("`null` if the photo no longer exists"),
});
export type StationHistoryPhoto = z.infer<typeof stationHistoryPhotoSchema>;

export const stationHistoryPhotosChangeSchema = z.object({
  kind: z.literal("photos"),
  ...changeShape,
  added: z.array(stationHistoryPhotoSchema).describe("The photos the station started to show"),
  removed: z.array(stationHistoryPhotoSchema).describe("The photos the station stopped showing"),
  main: z
    .object({ from: stationHistoryPhotoSchema.nullable(), to: stationHistoryPhotoSchema.nullable() })
    .nullable()
    .describe("The main photo before and after the change. `null` if it did not change"),
});

export const stationHistoryChangeSchema = z.discriminatedUnion("kind", [
  stationHistoryStationChangeSchema,
  stationHistoryLocationChangeSchema,
  stationHistoryIdentifiersChangeSchema,
  stationHistoryBackhaulChangeSchema,
  stationHistorySectorsChangeSchema,
  stationHistoryCellsChangeSchema,
  stationHistoryPhotosChangeSchema,
]);
export type StationHistoryChange = z.infer<typeof stationHistoryChangeSchema>;

export const stationHistoryItemSchema = z.object({
  id: z.number().int().describe("The id of the saved change. It is the id that `GET /audit-operations/{id}` takes"),
  createdAt: z.iso.datetime(),
  source: z.enum(AUDIT_SOURCES).describe("`api`: a person, through the site or the API. `import`: an automatic import. `system`: a server job"),
  author: userRefSchema.nullable().describe("The author of the change. `null` unless you are a staff member, and for changes that no person made"),
  isRevert: z.boolean().describe("Whether this change reverted an earlier one"),
  changes: z.array(stationHistoryChangeSchema).min(1).describe("The parts of the change that affect this station"),
});
export type StationHistoryItem = z.infer<typeof stationHistoryItemSchema>;

export const stationHistoryQuerySchema = z
  .object({
    limit: z.coerce.number<number>().int().min(1).max(STATION_HISTORY_LIMIT.max).default(STATION_HISTORY_LIMIT.default).describe(LIMIT_NOTE),
    cursor: cursorSchema.optional(),
  })
  .strict();
export type StationHistoryQuery = z.infer<typeof stationHistoryQuerySchema>;

export const stationHistoryListSchema = z.object({
  data: z.array(stationHistoryItemSchema).describe("Newest first"),
  paging: pagingSchema,
});
export type StationHistoryList = z.infer<typeof stationHistoryListSchema>;
