import { z } from "zod/v4";

import { UNKNOWN_BAND_NOTE } from "./bands.ts";
import { BSIC_MAX, CELL_FIELD_NOTES, CELL_RATS, CELL_TYPES, NR_MODES, PSC_MAX } from "./cells.ts";
import {
  AT_LEAST_ONE_FIELD_ISSUE,
  CURSOR_OR_OFFSET_ISSUE,
  INCLUDE_TOTAL_NOTE,
  MAX_ID,
  booleanQuerySchema,
  countryCodeSchema,
  csvCountryCodesSchema,
  csvEnumSchema,
  csvIdsSchema,
  csvUuidsSchema,
  cursorSchema,
  hasAnyField,
  idSchema,
  instantSchema,
  limitSchema,
  offsetSchema,
  pagingSchema,
  userRefSchema,
  usesCursorOrOffset,
} from "./common.ts";
import { photoDetailsShape, photoIdSchema, photoUploadShape, photoUrlsSchema } from "./photos.ts";
import {
  BACKHAUL_MEDIUMS,
  SECTOR_AZIMUTH_NOTE,
  STATION_IDENTIFIER_KIND_NOTE,
  STATION_SITE_ID_NOTE,
  STATION_STATUSES,
  stationBaseSchema,
  stationLocationSchema,
} from "./stations.ts";
import { STRUCTURE_INPUT_NOTE, structureInputSchema, structureTypeSchema, submittedStructureInputSchema } from "./structures.ts";

export const SUBMISSION_ACTIONS = ["create", "update", "delete"] as const;
export type SubmissionAction = (typeof SUBMISSION_ACTIONS)[number];

export const SUBMISSION_STATUSES = ["pending", "accepted", "rejected"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const SUBMISSION_ORIGINS = ["manual", "analyzer"] as const;
export type SubmissionOrigin = (typeof SUBMISSION_ORIGINS)[number];

export const ANALYZER_SUBMISSIONS_LIMIT = { max: 100, windowHours: 32 } as const;

export const LOCATION_MOVES = ["station", "location"] as const;
export type LocationMove = (typeof LOCATION_MOVES)[number];

export const STATION_IDENTIFIER_KINDS = ["networksId", "networksName", "operatorName"] as const;
export type StationIdentifierKind = (typeof STATION_IDENTIFIER_KINDS)[number];

export const REVIEW_DECISIONS = ["approve", "reject"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const SUBMISSION_INCLUDES = ["station", "station.location"] as const;
export type SubmissionInclude = (typeof SUBMISSION_INCLUDES)[number];

export const SUBMISSION_SUBMITTERS = ["mine", "all"] as const;
export const SUBMISSION_SORTS = ["-createdAt", "createdAt"] as const;
export type SubmissionSort = (typeof SUBMISSION_SORTS)[number];

export const SUBMISSION_NOTE_MAX_LENGTH = 2000;
export const SUBMISSION_PHOTO_LIMIT = 10;
export const MAX_SECTOR_CHANGES = 30;
export const MAX_CELL_CHANGES = 200;

const knownOrNullSchema = z.number().int().min(0).max(MAX_ID).nullable();
const identifierSchema = knownOrNullSchema.optional();
const SWITCH_NOTE = "Rejected with 400 while the site has it disabled";
const bsicSchema = z.number().int().min(0).max(BSIC_MAX).nullable().optional().describe(`Base station identity code. ${SWITCH_NOTE}`);
const pscSchema = z.number().int().min(0).max(PSC_MAX).nullable().optional().describe(`Primary scrambling code. ${SWITCH_NOTE}`);
const noteSchema = z.string().trim().max(SUBMISSION_NOTE_MAX_LENGTH);
const azimuthSchema = z.number().int().min(0).max(359).nullable();
const sectorKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "Must be 1 to 64 letters, digits, dashes or underscores")
  .refine((key) => !/^sector-\d+$/.test(key), { message: "This key is reserved for existing sectors" });

const IDENTIFIER_VALUE_NOTE = "The new value. `null` removes the identifier. A `networksId` must be a number of up to 9 digits";

const stationIdentifierChangeSchema = z
  .object({
    kind: z.enum(STATION_IDENTIFIER_KINDS).describe(STATION_IDENTIFIER_KIND_NOTE),
    value: z.string().trim().min(1).max(50).nullable().describe(IDENTIFIER_VALUE_NOTE),
  })
  .strict()
  .refine((identifier) => identifier.kind !== "networksId" || identifier.value === null || /^\d{1,9}$/.test(identifier.value), {
    path: ["value"],
    message: "networksId must be a number",
  });

const backhaulChangeSchema = z
  .object({
    medium: z.enum(BACKHAUL_MEDIUMS).optional(),
    speedMbps: z.number().int().min(1).max(2_147_483_647).nullable().optional(),
    model: z.string().trim().max(100).nullable().optional().describe("The model of the microwave link. Only stored for the `microwave` medium"),
  })
  .strict();

const BACKHAUL_INPUT_NOTE =
  "How the station is connected to the operator's network. Omitted fields are left unchanged, and `null` removes the backhaul";

export const stationChangeInputSchema = z
  .object({
    siteId: z.string().trim().min(1).max(16).optional().describe(STATION_SITE_ID_NOTE),
    operatorId: idSchema.optional(),
    notes: z.string().nullable().optional(),
    identifiers: z
      .array(stationIdentifierChangeSchema)
      .max(STATION_IDENTIFIER_KINDS.length)
      .refine((identifiers) => new Set(identifiers.map((identifier) => identifier.kind)).size === identifiers.length, {
        message: "Each identifier kind can appear once",
      })
      .optional()
      .describe("Other ids and names of the station. Each kind can appear once"),
    backhaul: backhaulChangeSchema.nullable().optional().describe(BACKHAUL_INPUT_NOTE),
  })
  .strict();
export type StationChangeInput = z.infer<typeof stationChangeInputSchema>;

export const stationEditInputSchema = stationChangeInputSchema
  .extend({
    status: z.enum(STATION_STATUSES).optional().describe("Editors only. Sets the status of an existing station"),
    isConfirmed: z.boolean().optional().describe("Editors only. Whether the station is confirmed"),
  })
  .strict();
export type StationEditInput = z.infer<typeof stationEditInputSchema>;

export const newStationInputSchema = stationChangeInputSchema
  .extend({
    siteId: z.string().trim().min(1).max(16).describe(STATION_SITE_ID_NOTE),
    operatorId: idSchema,
    isConfirmed: z.boolean().optional().describe("Whether the station is confirmed. Defaults to `true`"),
  })
  .strict()
  .refine((station) => !station.backhaul || station.backhaul.medium !== undefined, {
    path: ["backhaul", "medium"],
    message: "Required for a new station's backhaul",
  });
export type NewStationInput = z.infer<typeof newStationInputSchema>;

const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);
const locationPlaceShape = {
  regionId: idSchema.optional().describe("If omitted, the region is derived from the coordinates"),
  city: z.string().trim().max(100).nullable().optional(),
  address: z.string().trim().nullable().optional(),
  structure: structureInputSchema.optional().describe(STRUCTURE_INPUT_NOTE),
};
const MOVED_STATION_NOTE = "When a station is moved to other coordinates, the structure of its old location is not carried over";
const LOCATION_MOVE_INPUT_NOTE =
  "What moves when an existing station gets new coordinates. `station` moves only this station to the location at those coordinates, " +
  "which is created if there is none. `location` moves the whole location with all its stations. " +
  "Only allowed together with `latitude` and `longitude`. Defaults to `station`, or to the value already stored when you update a submission";

export const newLocationInputSchema = z.object({ ...locationPlaceShape, latitude: latitudeSchema, longitude: longitudeSchema }).strict();
export type NewLocationInput = z.infer<typeof newLocationInputSchema>;

const locationChangeShape = {
  ...locationPlaceShape,
  structure: structureInputSchema.optional().describe(`${STRUCTURE_INPUT_NOTE}. ${MOVED_STATION_NOTE}`),
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
  move: z.enum(LOCATION_MOVES).optional().describe(LOCATION_MOVE_INPUT_NOTE),
};
const SUBMITTED_STRUCTURE_NOTE =
  `${STRUCTURE_INPUT_NOTE}. ${MOVED_STATION_NOTE}. ` +
  "To propose an owner that is not in the list of structure owners yet, send its name in `ownerName` instead of an `ownerId`";
const COORDINATES_TOGETHER_ISSUE = { path: ["longitude"], message: "latitude and longitude must be sent together" };
const MOVE_NEEDS_COORDINATES_ISSUE = { path: ["move"], message: "move needs latitude and longitude" };

function hasBothCoordinatesOrNone(location: { latitude?: number; longitude?: number }): boolean {
  return (location.latitude === undefined) === (location.longitude === undefined);
}

function movesOnlyWithCoordinates(location: { latitude?: number; move?: LocationMove }): boolean {
  return location.move === undefined || location.latitude !== undefined;
}

export const locationChangeInputSchema = z
  .object(locationChangeShape)
  .strict()
  .refine(hasBothCoordinatesOrNone, COORDINATES_TOGETHER_ISSUE)
  .refine(movesOnlyWithCoordinates, MOVE_NEEDS_COORDINATES_ISSUE);
export type LocationChangeInput = z.infer<typeof locationChangeInputSchema>;

export const submittedLocationInputSchema = z
  .object({ ...locationChangeShape, structure: submittedStructureInputSchema.optional().describe(SUBMITTED_STRUCTURE_NOTE) })
  .strict()
  .refine(hasBothCoordinatesOrNone, COORDINATES_TOGETHER_ISSUE)
  .refine(movesOnlyWithCoordinates, MOVE_NEEDS_COORDINATES_ISSUE);
export type SubmittedLocationInput = z.infer<typeof submittedLocationInputSchema>;

export const SECTOR_LIMITS_NOTE = "A station can have up to 15 sectors, each with a different azimuth";
const NEW_SECTOR_KEY_NOTE = "A temporary key for the new sector. Cells in the same request reference it through `sectorKey`";

export const newSectorInputSchema = z
  .object({
    key: sectorKeySchema.describe(NEW_SECTOR_KEY_NOTE),
    azimuth: azimuthSchema.describe(SECTOR_AZIMUTH_NOTE),
  })
  .strict();
export type NewSectorInput = z.infer<typeof newSectorInputSchema>;

export const sectorChangeInputSchema = z.union([
  z
    .object({
      action: z.literal("create"),
      key: sectorKeySchema.describe(NEW_SECTOR_KEY_NOTE),
      azimuth: azimuthSchema.describe(SECTOR_AZIMUTH_NOTE),
    })
    .strict(),
  z.object({ action: z.literal("update"), id: idSchema, azimuth: azimuthSchema.describe(SECTOR_AZIMUTH_NOTE) }).strict(),
  z.object({ action: z.literal("delete"), id: idSchema }).strict(),
]);
export type SectorChangeInput = z.infer<typeof sectorChangeInputSchema>;

const SECTOR_ID_NOTE = "One of the station's sectors to attach the cell to. `null` detaches the cell from its sector";
const SECTOR_KEY_NOTE = "The `key` of a sector created in the same request, to attach the cell to it. Use either `sectorId` or `sectorKey`";

const cellPlacementShape = {
  sectorId: idSchema.nullable().optional().describe(SECTOR_ID_NOTE),
  sectorKey: sectorKeySchema.optional().describe(SECTOR_KEY_NOTE),
  cellType: z.enum(CELL_TYPES).nullable().optional(),
  notes: z.string().nullable().optional(),
};
const { sectorKey: _sectorKey, ...cellReferenceShape } = cellPlacementShape;
const SECTOR_KEY_OR_ID = { path: ["sectorKey"], message: "Use either sectorId or sectorKey" };
const createAction = { action: z.literal("create") };

const BAND_ID_NOTE = "The cell's band. It must be a band of the cell's technology that is in the country's band plan";
const UNKNOWN_NOTE = "`null` if unknown";
const NR_MODE_NOTE = `${CELL_FIELD_NOTES.mode}. A non-standalone cell cannot have \`tac\`, \`gnbid\`, \`clid\` or RedCap support`;

const newCellShape = {
  bandId: idSchema.describe(BAND_ID_NOTE),
  ...cellPlacementShape,
  isConfirmed: z.boolean().optional().describe("Editors only. Whether the cell is confirmed. Defaults to `false`"),
};

export const newGsmCellSchema = z
  .object({
    ...newCellShape,
    rat: z.literal("gsm"),
    lac: z.number().int().min(0).max(MAX_ID).describe(CELL_FIELD_NOTES.lac),
    cid: z.number().int().min(0).max(MAX_ID).describe(CELL_FIELD_NOTES.cid),
    isEGsm: z.boolean().optional().describe(CELL_FIELD_NOTES.isEGsm),
    bsic: bsicSchema,
  })
  .strict();
export const newUmtsCellSchema = z
  .object({
    ...newCellShape,
    rat: z.literal("umts"),
    lac: identifierSchema.describe(CELL_FIELD_NOTES.lac),
    rnc: knownOrNullSchema.describe(`${CELL_FIELD_NOTES.rnc}. ${UNKNOWN_NOTE}`),
    cid: knownOrNullSchema.describe(`${CELL_FIELD_NOTES.cid}. ${UNKNOWN_NOTE}, which is only allowed if \`rnc\` is \`null\` too`),
    psc: pscSchema,
    uarfcn: identifierSchema.describe(CELL_FIELD_NOTES.uarfcn),
  })
  .strict();
export const newLteCellSchema = z
  .object({
    ...newCellShape,
    rat: z.literal("lte"),
    tac: identifierSchema.describe(CELL_FIELD_NOTES.tac),
    enbid: knownOrNullSchema.describe(`${CELL_FIELD_NOTES.enbid}. ${UNKNOWN_NOTE}`),
    clid: knownOrNullSchema.describe(`${CELL_FIELD_NOTES.clid}. ${UNKNOWN_NOTE}, which is only allowed if \`enbid\` is \`null\` too`),
    pci: identifierSchema.describe(CELL_FIELD_NOTES.pci),
    earfcn: identifierSchema.describe(CELL_FIELD_NOTES.earfcn),
    supportsIot: z.boolean().optional().describe(CELL_FIELD_NOTES.supportsIot),
  })
  .strict();
export const newNrCellSchema = z
  .object({
    ...newCellShape,
    rat: z.literal("nr"),
    mode: z.enum(NR_MODES).describe(NR_MODE_NOTE),
    tac: identifierSchema.describe(CELL_FIELD_NOTES.tac),
    gnbid: identifierSchema.describe(CELL_FIELD_NOTES.gnbid),
    clid: identifierSchema.describe(CELL_FIELD_NOTES.clid),
    pci: identifierSchema.describe(CELL_FIELD_NOTES.pci),
    arfcn: identifierSchema.describe(CELL_FIELD_NOTES.arfcn),
    supportsRedCap: z.boolean().optional().describe(CELL_FIELD_NOTES.supportsRedCap),
  })
  .strict();

export const newCellInputSchema = z
  .discriminatedUnion("rat", [newGsmCellSchema, newUmtsCellSchema, newLteCellSchema, newNrCellSchema])
  .refine((cell) => cell.sectorKey === undefined || cell.sectorId === undefined, SECTOR_KEY_OR_ID);
export type NewCellInput = z.infer<typeof newCellInputSchema>;

const cellCreateChangeSchema = z.discriminatedUnion("rat", [
  newGsmCellSchema.extend(createAction).strict(),
  newUmtsCellSchema.extend(createAction).strict(),
  newLteCellSchema.extend(createAction).strict(),
  newNrCellSchema.extend(createAction).strict(),
]);

const cellRadioUpdateShape = {
  mode: z.enum(NR_MODES).optional().describe(NR_MODE_NOTE),
  lac: identifierSchema.describe(CELL_FIELD_NOTES.lac),
  cid: identifierSchema.describe(CELL_FIELD_NOTES.cid),
  rnc: identifierSchema.describe(CELL_FIELD_NOTES.rnc),
  enbid: identifierSchema.describe(CELL_FIELD_NOTES.enbid),
  gnbid: identifierSchema.describe(CELL_FIELD_NOTES.gnbid),
  clid: identifierSchema.describe(CELL_FIELD_NOTES.clid),
  tac: identifierSchema.describe(CELL_FIELD_NOTES.tac),
  pci: identifierSchema.describe(CELL_FIELD_NOTES.pci),
  psc: pscSchema,
  bsic: bsicSchema,
  uarfcn: identifierSchema.describe(CELL_FIELD_NOTES.uarfcn),
  earfcn: identifierSchema.describe(CELL_FIELD_NOTES.earfcn),
  arfcn: identifierSchema.describe(CELL_FIELD_NOTES.arfcn),
  isEGsm: z.boolean().optional().describe(CELL_FIELD_NOTES.isEGsm),
  supportsIot: z.boolean().optional().describe(CELL_FIELD_NOTES.supportsIot),
  supportsRedCap: z.boolean().optional().describe(CELL_FIELD_NOTES.supportsRedCap),
};

export const cellUpdateChangeSchema = z
  .object({
    action: z.literal("update"),
    id: idSchema,
    bandId: idSchema.optional().describe(BAND_ID_NOTE),
    ...cellPlacementShape,
    ...cellRadioUpdateShape,
  })
  .strict();

const cellDeleteChangeSchema = z.object({ action: z.literal("delete"), id: idSchema }).strict();

const SUBMITTED_CELL_NOTE =
  "One cell change. A `create` adds a cell, an `update` changes the cell in `id`, and a `delete` removes it. " +
  "An `update` needs at least one field besides `id`, and it can be a field you set to `null`. " +
  "An update that names only the `id` is rejected with 400, because a submission cannot confirm a cell";

function namesFieldToChange(cell: { action: string }): boolean {
  if (cell.action !== "update") return true;
  return Object.entries(cell).some(([field, value]) => field !== "action" && field !== "id" && value !== undefined);
}

function isValidSoFar(payload: { issues: readonly unknown[] }): boolean {
  return payload.issues.length === 0;
}

const UPDATE_NEEDS_A_FIELD = { message: "A cell update needs at least one field to change", when: isValidSoFar };

export const cellChangeInputSchema = z
  .union([cellCreateChangeSchema, cellUpdateChangeSchema, cellDeleteChangeSchema])
  .refine((cell) => cell.action === "delete" || cell.sectorKey === undefined || cell.sectorId === undefined, SECTOR_KEY_OR_ID)
  .refine(namesFieldToChange, UPDATE_NEEDS_A_FIELD)
  .describe(SUBMITTED_CELL_NOTE);
export type CellChangeInput = z.infer<typeof cellChangeInputSchema>;

const CONFIRMED_TICK = { isConfirmed: true } as const;

const submittedCellCreateSchema = z.discriminatedUnion("rat", [
  newGsmCellSchema.omit(CONFIRMED_TICK).extend(createAction).strict(),
  newUmtsCellSchema.omit(CONFIRMED_TICK).extend(createAction).strict(),
  newLteCellSchema.omit(CONFIRMED_TICK).extend(createAction).strict(),
  newNrCellSchema.omit(CONFIRMED_TICK).extend(createAction).strict(),
]);

export const submittedCellInputSchema = z
  .union([submittedCellCreateSchema, cellUpdateChangeSchema, cellDeleteChangeSchema])
  .refine((cell) => cell.action === "delete" || cell.sectorKey === undefined || cell.sectorId === undefined, SECTOR_KEY_OR_ID)
  .refine(namesFieldToChange, UPDATE_NEEDS_A_FIELD)
  .describe(SUBMITTED_CELL_NOTE);
export type SubmittedCellInput = z.infer<typeof submittedCellInputSchema>;

const cellUpdateEditSchema = cellUpdateChangeSchema
  .extend({
    isConfirmed: z.boolean().optional().describe("Editors only. Whether the cell is confirmed"),
    stationId: idSchema.optional().describe("Editors only. Moves the cell to another station and clears its sector"),
  })
  .strict();

export const cellUpdateSchema = z
  .object({
    bandId: idSchema.optional().describe(BAND_ID_NOTE),
    ...cellReferenceShape,
    ...cellRadioUpdateShape,
    isConfirmed: z.boolean().optional().describe("Whether the cell is confirmed"),
    stationId: idSchema.optional().describe("Moves the cell to another station and clears its sector"),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type CellUpdate = z.infer<typeof cellUpdateSchema>;

export const cellEditInputSchema = z
  .union([cellCreateChangeSchema, cellUpdateEditSchema, cellDeleteChangeSchema])
  .refine((cell) => cell.action === "delete" || cell.sectorKey === undefined || cell.sectorId === undefined, SECTOR_KEY_OR_ID);
export type CellEditInput = z.infer<typeof cellEditInputSchema>;

const SELECT_PHOTOS_NOTE = "Existing photos to show on the station. When updating a station, they must be photos of its location";
const REMOVE_PHOTOS_NOTE = "Photos the station should no longer show. Only allowed when updating a station, and only for photos it shows now";

const photoPicksShape = {
  selectIds: z.array(photoIdSchema).max(50).optional().describe(SELECT_PHOTOS_NOTE),
  removeIds: z.array(photoIdSchema).max(50).optional().describe(REMOVE_PHOTOS_NOTE),
  mainPhotoId: photoIdSchema.optional().describe("The photo to make the station's main photo. Must be one of `selectIds`"),
};

function checkPhotoPicks(photos: { selectIds?: string[]; removeIds?: string[]; mainPhotoId?: string }, ctx: z.RefinementCtx): void {
  if (photos.mainPhotoId !== undefined && !photos.selectIds?.includes(photos.mainPhotoId)) {
    ctx.addIssue({ code: "custom", path: ["mainPhotoId"], message: "Must be one of selectIds" });
  }
  if (photos.removeIds?.some((id) => photos.selectIds?.includes(id))) {
    ctx.addIssue({ code: "custom", path: ["removeIds"], message: "A photo cannot be both selected and removed" });
  }
}

export const submissionPhotoPicksInputSchema = z.object(photoPicksShape).strict().superRefine(checkPhotoPicks);
export type SubmissionPhotoPicksInput = z.infer<typeof submissionPhotoPicksInputSchema>;

const UPLOAD_COUNT_NOTE =
  "The number of photos you are going to upload with `POST /submissions/{id}/photos`. Required for a new station without cells. " +
  "The submission returns it as `changes.photos.announcedCount`";

export const submissionPhotosInputSchema = z
  .object({
    uploadCount: z.number().int().min(1).max(SUBMISSION_PHOTO_LIMIT).optional().describe(UPLOAD_COUNT_NOTE),
    ...photoPicksShape,
  })
  .strict()
  .superRefine(checkPhotoPicks);
export type SubmissionPhotosInput = z.infer<typeof submissionPhotosInputSchema>;

function targetsEachCellOnce(cells: readonly CellChangeInput[]): boolean {
  const ids = cells.flatMap((cell) => (cell.action === "create" ? [] : [cell.id]));
  return new Set(ids).size === ids.length;
}

export function cellChangeList<T extends z.ZodType<CellChangeInput>>(cellSchema: T, per: "submission" | "request") {
  return z
    .array(cellSchema)
    .max(MAX_CELL_CHANGES)
    .refine(targetsEachCellOnce, { message: `A cell can be changed once per ${per}` });
}

const LOCATION_CHANGE_NOTE =
  "The location fields to set. Without coordinates, they edit the location the station is at, which it shares with the other stations there. " +
  "With coordinates, the station moves as `move` says. A new station needs `latitude` and `longitude`";

const submissionContentShape = {
  station: stationChangeInputSchema.optional().describe("The station fields to set. A new station needs `siteId` and `operatorId`"),
  location: submittedLocationInputSchema.optional().describe(LOCATION_CHANGE_NOTE),
  sectors: z.array(sectorChangeInputSchema).max(MAX_SECTOR_CHANGES).optional().describe(SECTOR_LIMITS_NOTE),
  cells: cellChangeList(cellChangeInputSchema, "submission").optional(),
};

const SUBMISSION_ACTION_NOTE =
  "What the submission asks for: `create` adds a new station, `update` changes the station in `stationId`, and `delete` deactivates it";
const STATION_ID_INPUT_NOTE = "The station to update or delete. Required for `update` and `delete`, and not allowed for `create`";

export const submissionCreateSchema = z
  .object({
    action: z
      .enum(SUBMISSION_ACTIONS)
      .describe(`${SUBMISSION_ACTION_NOTE}. A \`create\` needs \`station\`, and a \`delete\` carries no changes, only a \`note\``),
    stationId: idSchema.optional().describe(STATION_ID_INPUT_NOTE),
    origin: z.enum(SUBMISSION_ORIGINS).optional().describe("Where the change comes from. Defaults to `manual`"),
    note: noteSchema.nullable().optional().describe("A note for the editor who reviews the submission"),
    station: submissionContentShape.station,
    location: submissionContentShape.location,
    sectors: submissionContentShape.sectors,
    cells: cellChangeList(submittedCellInputSchema, "submission").optional(),
    photos: submissionPhotosInputSchema.optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.action === "create" && body.stationId !== undefined) {
      ctx.addIssue({ code: "custom", path: ["stationId"], message: "Must not be set when creating a station" });
    }
    if (body.action !== "create" && body.stationId === undefined) {
      ctx.addIssue({ code: "custom", path: ["stationId"], message: "Required when updating or deleting a station" });
    }
    if (body.action !== "update" && body.photos?.removeIds?.length) {
      ctx.addIssue({ code: "custom", path: ["photos", "removeIds"], message: "Photos can only be removed when updating a station" });
    }
    if (body.action === "delete" && (body.station || body.location || body.sectors?.length || body.cells?.length || body.photos)) {
      ctx.addIssue({ code: "custom", path: ["action"], message: "A delete carries no changes, only a note" });
    }
    if (body.action !== "create") return;

    if (!body.station) ctx.addIssue({ code: "custom", path: ["station"], message: "Required for a new station" });
    if (body.station && body.station.siteId === undefined) {
      ctx.addIssue({ code: "custom", path: ["station", "siteId"], message: "Required for a new station" });
    }
    if (body.station && body.station.operatorId === undefined) {
      ctx.addIssue({ code: "custom", path: ["station", "operatorId"], message: "Required for a new station" });
    }
    if (body.station?.backhaul && body.station.backhaul.medium === undefined) {
      ctx.addIssue({ code: "custom", path: ["station", "backhaul", "medium"], message: "Required for a new station's backhaul" });
    }
    if (body.location && body.location.latitude === undefined) {
      ctx.addIssue({ code: "custom", path: ["location"], message: "latitude and longitude are required for a new station" });
    }
    if (body.sectors?.some((sector) => sector.action !== "create")) {
      ctx.addIssue({ code: "custom", path: ["sectors"], message: "A new station can only create sectors" });
    }
    if (body.cells?.some((cell) => cell.action !== "create")) {
      ctx.addIssue({ code: "custom", path: ["cells"], message: "A new station can only create cells" });
    }
  });
export type SubmissionCreate = z.infer<typeof submissionCreateSchema>;

export const MAX_SUBMISSIONS_PER_REQUEST = 50;
export const submissionCreateManySchema = z.array(submissionCreateSchema).min(1).max(MAX_SUBMISSIONS_PER_REQUEST);

const REVIEW_NOTE_INPUT_NOTE =
  "The reviewer's note for the submitter. Only administrators and editors whose grant covers the submission can set it. `null` clears it";
const EXPECTED_UPDATED_AT_NOTE =
  "The `updatedAt` of the submission as you last saw it. If the submission has changed since then, the request fails with 409";

export const submissionUpdateSchema = z
  .object({
    note: noteSchema.nullable().optional().describe("The submitter's note for the reviewer. `null` clears it"),
    reviewNote: noteSchema.nullable().optional().describe(REVIEW_NOTE_INPUT_NOTE),
    ...submissionContentShape,
    photos: submissionPhotoPicksInputSchema.optional(),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type SubmissionUpdate = z.infer<typeof submissionUpdateSchema>;

export const submissionReviewSchema = z
  .object({
    decision: z.enum(REVIEW_DECISIONS),
    note: noteSchema.nullable().optional().describe("Saved as the submission's `reviewNote`. If omitted or `null`, the existing review note is kept"),
    expectedUpdatedAt: instantSchema.optional().describe(EXPECTED_UPDATED_AT_NOTE),
  })
  .strict();
export type SubmissionReview = z.infer<typeof submissionReviewSchema>;

export const stationChangeSchema = z.object({
  siteId: z.string().optional(),
  operatorId: z.number().int().optional(),
  notes: z.string().nullable().optional(),
  identifiers: z
    .array(z.object({ kind: z.enum(STATION_IDENTIFIER_KINDS), value: z.string().nullable() }))
    .optional()
    .describe("The identifiers the submission sets. A `null` value removes that identifier"),
  backhaul: z
    .object({
      medium: z.enum(BACKHAUL_MEDIUMS).optional(),
      speedMbps: z.number().int().nullable().optional(),
      model: z.string().nullable().optional(),
    })
    .nullable()
    .optional()
    .describe("The backhaul fields the submission sets. `null` if it removes the backhaul"),
});
export type StationChange = z.infer<typeof stationChangeSchema>;

const PROPOSED_OWNER_ID_NOTE = "The existing owner the submission sets. `null` if it clears the owner or proposes a new one in `ownerName`";
const PROPOSED_OWNER_NAME_NOTE =
  "The name of a new owner the submission proposes. That owner is added to the list of structure owners when the submission is accepted. " +
  "`null` if the submission sets an existing owner or clears the owner. Returned whenever `ownerId` is";

const structureChangeSchema = z.object({
  type: structureTypeSchema.nullable().optional(),
  ownerId: z.number().int().nullable().optional().describe(PROPOSED_OWNER_ID_NOTE),
  ownerName: z.string().nullable().optional().describe(PROPOSED_OWNER_NAME_NOTE),
  note: z.string().nullable().optional(),
});

const LOCATION_MOVE_NOTE =
  "What moves if the submission changes the coordinates: only the station (`station`) or the whole location with all its stations (`location`)";

export const locationChangeSchema = z.object({
  regionId: z.number().int().optional(),
  city: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  structure: structureChangeSchema.optional().describe("The structure fields that the change sets. A field set to `null` is cleared"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  move: z.enum(LOCATION_MOVES).describe(LOCATION_MOVE_NOTE),
});
export type LocationChange = z.infer<typeof locationChangeSchema>;

const SECTOR_ACTION_NOTE = "`null` for submissions that list the station's complete set of sectors instead of single changes";
const SECTOR_CHANGE_ID_NOTE = "The existing sector the entry refers to. `null` for an entry that names none, such as a new sector";
const SECTOR_CHANGE_KEY_NOTE = "The entry's key within the submission. A cell change points at a new sector through `sectorKey`";

export const sectorChangeSchema = z.object({
  action: z.enum(SUBMISSION_ACTIONS).nullable().describe(SECTOR_ACTION_NOTE),
  id: z.number().int().nullable().describe(SECTOR_CHANGE_ID_NOTE),
  key: z.string().describe(SECTOR_CHANGE_KEY_NOTE),
  azimuth: z.number().int().nullable().describe(SECTOR_AZIMUTH_NOTE),
});
export type SectorChange = z.infer<typeof sectorChangeSchema>;

const CELL_CHANGE_ID_NOTE = "The id of the change itself, as opposed to `id`, the cell it applies to";
const CELL_SECTOR_ID_NOTE = "The existing sector the change attaches the cell to, or `null`";
const CELL_SECTOR_KEY_NOTE = "The `key` of the entry in `sectors` the change attaches the cell to, or `null`";
const SECTOR_CLEARED_NOTE =
  "`true` if the change detaches the cell from its sector. If it is `false` and `sectorId` and `sectorKey` are `null`, the sector does not change";
const DISABLED_CODE_NOTE = "`null` if unknown, and always `null` while the site has it disabled";

export const cellChangeSchema = z.object({
  changeId: z.number().int().describe(CELL_CHANGE_ID_NOTE),
  action: z.enum(SUBMISSION_ACTIONS),
  id: z.number().int().nullable().describe("The cell that is updated or deleted. `null` for a new cell"),
  rat: z.enum(CELL_RATS).nullable(),
  bandId: z.number().int().nullable().describe(UNKNOWN_BAND_NOTE),
  sectorId: z.number().int().nullable().describe(CELL_SECTOR_ID_NOTE),
  sectorKey: z.string().nullable().describe(CELL_SECTOR_KEY_NOTE),
  isSectorCleared: z.boolean().describe(SECTOR_CLEARED_NOTE),
  cellType: z.enum(CELL_TYPES).nullable(),
  notes: z.string().nullable(),
  isConfirmed: z.boolean().describe("Whether a new cell is created as confirmed. Not used for an `update` or a `delete`"),
  mode: z.enum(NR_MODES).optional().describe(CELL_FIELD_NOTES.mode),
  lac: z.number().int().nullable().optional().describe(CELL_FIELD_NOTES.lac),
  cid: z.number().int().nullable().optional().describe(CELL_FIELD_NOTES.cid),
  rnc: z.number().int().nullable().optional().describe(CELL_FIELD_NOTES.rnc),
  enbid: z.number().int().nullable().optional().describe(CELL_FIELD_NOTES.enbid),
  gnbid: z.number().int().nullable().optional().describe(CELL_FIELD_NOTES.gnbid),
  clid: z.number().int().nullable().optional().describe(CELL_FIELD_NOTES.clid),
  tac: z.number().int().nullable().optional().describe(CELL_FIELD_NOTES.tac),
  pci: z.number().int().nullable().optional().describe(CELL_FIELD_NOTES.pci),
  psc: z.number().int().nullable().optional().describe(`Primary scrambling code. ${DISABLED_CODE_NOTE}`),
  bsic: z.number().int().nullable().optional().describe(`Base station identity code. ${DISABLED_CODE_NOTE}`),
  uarfcn: z.number().int().nullable().optional().describe(CELL_FIELD_NOTES.uarfcn),
  earfcn: z.number().int().nullable().optional().describe(CELL_FIELD_NOTES.earfcn),
  arfcn: z.number().int().nullable().optional().describe(CELL_FIELD_NOTES.arfcn),
  isEGsm: z.boolean().optional().describe(CELL_FIELD_NOTES.isEGsm),
  supportsIot: z.boolean().optional().describe(CELL_FIELD_NOTES.supportsIot),
  supportsRedCap: z.boolean().optional().describe(CELL_FIELD_NOTES.supportsRedCap),
});
export type CellChange = z.infer<typeof cellChangeSchema>;

export const submissionPhotoPickSchema = z.object({
  id: z.uuid(),
  urls: photoUrlsSchema,
  ...photoDetailsShape,
  isMain: z.boolean().describe("Whether the submission makes it the station's main photo"),
});

const STATION_CHANGE_NOTE = "The station fields the submission sets. For an `update`, only the fields it changes. `null` if it sets none";
const LOCATION_CHANGE_RESULT_NOTE = "The location fields the submission sets. For an `update`, only the fields it changes. `null` if it sets none";
const CELL_CHANGES_NOTE =
  "The cell changes. Each entry only has the radio fields of its technology, and a `delete` has none. " +
  "For an `update`, the band, type, notes and radio fields hold the values the cell will have, not only the ones that change";
const ANNOUNCED_COUNT_NOTE =
  "The number of photos the submitter said they would upload, as sent in `photos.uploadCount`. `0` if they announced none. " +
  "If it is higher than `uploadedCount`, announced photos are still missing. " +
  "It goes back to `0` when the uploaded photos of a rejected submission are deleted";

export const submissionChangesSchema = z.object({
  station: stationChangeSchema.nullable().describe(STATION_CHANGE_NOTE),
  location: locationChangeSchema.nullable().describe(LOCATION_CHANGE_RESULT_NOTE),
  sectors: z.array(sectorChangeSchema),
  cells: z.array(cellChangeSchema).describe(CELL_CHANGES_NOTE),
  photos: z.object({
    announcedCount: z.number().int().describe(ANNOUNCED_COUNT_NOTE),
    uploadedCount: z.number().int().describe("The number of photos uploaded to the submission. `GET /submissions/{id}/photos` returns them"),
    selected: z.array(submissionPhotoPickSchema).describe("Existing photos the station will show"),
    removed: z.array(submissionPhotoPickSchema.omit({ isMain: true })).describe("Photos the station will no longer show"),
  }),
});
export type SubmissionChanges = z.infer<typeof submissionChangesSchema>;

const SUBMISSION_STATUS_NOTE =
  "`pending` until an editor reviews the submission, then `accepted` if it was approved and its changes were written, or `rejected`";
const SUBMISSION_ORIGIN_NOTE =
  "Where the change comes from, as labelled by the submitter: `manual`, or `analyzer` for a change prepared from a phone log. It is only a label";
const SUBMISSION_STATION_NOTE = "The station the submission changes. For a `create`, `null` until the submission is accepted, then the new station";
const SUBMISSION_COUNTRY_NOTE =
  "The country the submission is about. It comes from the proposed location if there is one, " +
  "otherwise from the station's location, the proposed operator or the station's operator, in that order. " +
  "It is stored when the submission is created or edited, so it does not change if the station moves to another country later. " +
  "`null` if the country is unknown";
const INCLUDED_STATION_NOTE =
  "Only returned with `include=station` or `include=station.location`. " +
  "`null` if the submission has no station yet or the station is in a country you cannot access";
const INCLUDED_STATION_LOCATION_NOTE =
  "Only returned with `include=station.location`. The location the station is at now. " +
  "What a pending submission proposes is in `changes.location`, not here. `null` for a station without a location";

export const submissionStationSchema = stationBaseSchema.extend({
  location: stationLocationSchema.nullable().optional().describe(INCLUDED_STATION_LOCATION_NOTE),
});
export type SubmissionStation = z.infer<typeof submissionStationSchema>;

export const submissionSchema = z.object({
  id: z.uuid(),
  action: z.enum(SUBMISSION_ACTIONS).describe(SUBMISSION_ACTION_NOTE),
  status: z.enum(SUBMISSION_STATUSES).describe(SUBMISSION_STATUS_NOTE),
  origin: z.enum(SUBMISSION_ORIGINS).describe(SUBMISSION_ORIGIN_NOTE),
  stationId: z.number().int().nullable().describe(SUBMISSION_STATION_NOTE),
  countryCode: countryCodeSchema.nullable().describe(SUBMISSION_COUNTRY_NOTE),
  note: z.string().nullable().describe("The submitter's note for the reviewer"),
  reviewNote: z.string().nullable().describe("The reviewer's note for the submitter"),
  submitter: userRefSchema.nullable().describe("`null` if the submitter's account was deleted"),
  reviewer: userRefSchema.nullable().describe("The user who reviewed the submission. `null` until it is reviewed"),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable().describe("`null` until the submission is reviewed"),
  changes: submissionChangesSchema,
  station: submissionStationSchema.nullable().optional().describe(INCLUDED_STATION_NOTE),
});
export type Submission = z.infer<typeof submissionSchema>;

export const submissionPhotoSchema = z.object({
  id: z.uuid(),
  urls: photoUrlsSchema,
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  note: z.string().nullable(),
  takenAt: z.iso.datetime().nullable(),
  isMain: z.boolean().describe("Whether the photo becomes the station's main photo when the submission is accepted"),
  createdAt: z.iso.datetime(),
  author: userRefSchema.nullable(),
});
export type SubmissionPhoto = z.infer<typeof submissionPhotoSchema>;

export const submissionPhotoUploadSchema = z.object({
  ...photoUploadShape,
  isMains: z
    .array(z.enum(["true", "false"]))
    .optional()
    .describe("One value per photo: whether it is the main photo. If several are `true`, the first one wins"),
  files: photoUploadShape.files
    .max(SUBMISSION_PHOTO_LIMIT)
    .describe("The photos, up to 20 MB each and 10 per submission. A photo's text fields must come before the photo"),
});

const MAIN_PHOTO_NOTE = "Makes this the main photo of the submission, in place of any other of its photos, uploaded or selected";

export const submissionPhotoUpdateSchema = z
  .object({
    note: z.string().trim().max(100).nullable().optional(),
    takenAt: instantSchema.nullable().optional().describe("When the photo was taken. It cannot be in the future. `null` clears it"),
    isMain: z.literal(true).optional().describe(MAIN_PHOTO_NOTE),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type SubmissionPhotoUpdate = z.infer<typeof submissionPhotoUpdateSchema>;

export const submissionParamsSchema = z.object({ id: z.uuid() });
export const submissionPhotoParamsSchema = z.object({ id: z.uuid(), photoId: photoIdSchema });

const submissionIncludeSchema = csvEnumSchema(SUBMISSION_INCLUDES);

export const submissionQuerySchema = z.object({ include: submissionIncludeSchema.optional() }).strict();
export type SubmissionQuery = z.infer<typeof submissionQuerySchema>;

const SUBMITTERS_NOTE =
  "`mine` returns your own submissions. `all` returns everyone's and is only for editors and administrators; " +
  "an editor gets the submissions their grant covers";
const OPERATORS_FILTER_NOTE = "Filters by the station's operator or by the operator the submission proposes. Comma-separated ids";
const REGIONS_FILTER_NOTE = "Filters by the region of the station's location or of the location the submission proposes. Comma-separated ids";

export const submissionListQuerySchema = z
  .object({
    submitters: z.enum(SUBMISSION_SUBMITTERS).default("mine").describe(SUBMITTERS_NOTE),
    submitterIds: csvUuidsSchema.optional().describe("Filters by submitter. Only allowed with `submitters=all`. Comma-separated UUIDs"),
    statuses: csvEnumSchema(SUBMISSION_STATUSES).optional(),
    actions: csvEnumSchema(SUBMISSION_ACTIONS).optional(),
    countryCodes: csvCountryCodesSchema.optional().describe("Filters by `countryCode`. Comma-separated two-letter country codes"),
    operatorIds: csvIdsSchema.optional().describe(OPERATORS_FILTER_NOTE),
    regionIds: csvIdsSchema.optional().describe(REGIONS_FILTER_NOTE),
    q: z.string().trim().min(1).max(100).optional().describe("Matches the start of a submission id or any part of the station's site id"),
    createdAfter: instantSchema.optional().describe("Only submissions created at or after this time"),
    sort: z.enum(SUBMISSION_SORTS).default("-createdAt").describe("The field to sort by, with a leading `-` for descending order"),
    include: submissionIncludeSchema.optional(),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    offset: offsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional().describe(INCLUDE_TOTAL_NOTE),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type SubmissionListQuery = z.infer<typeof submissionListQuerySchema>;

export const submissionListSchema = z.object({
  data: z.array(submissionSchema),
  paging: pagingSchema,
});
export type SubmissionList = z.infer<typeof submissionListSchema>;

export const rejectedPhotoRemovalSchema = z.object({
  submissions: z.number().int().nonnegative().describe("The number of rejected submissions whose uploaded photos this request deleted"),
  photos: z.number().int().nonnegative().describe("The number of uploaded photos this request deleted"),
  hasMore: z.boolean().describe("Whether any rejected submissions with uploaded photos remain. If so, send the request again to delete them"),
});
export type RejectedPhotoRemoval = z.infer<typeof rejectedPhotoRemovalSchema>;
