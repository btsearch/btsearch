import { z } from "zod/v4";

import {
  AT_LEAST_ONE_FIELD_ISSUE,
  CURSOR_OR_OFFSET_ISSUE,
  INCLUDE_TOTAL_NOTE,
  booleanQuerySchema,
  csvCountryCodesSchema,
  csvEnumSchema,
  csvIdsSchema,
  cursorSchema,
  hasAnyField,
  idParamSchema,
  instantSchema,
  limitSchema,
  offsetSchema,
  pagingSchema,
  userRefSchema,
  usesCursorOrOffset,
} from "./common.ts";
import { KEEP_OTHER_COUNTRIES_LEAD, STATION_STATUSES, stationBaseSchema, stationLocationSchema } from "./stations.ts";

export const PHOTO_INCLUDES = ["location", "selections.station"] as const;
export type PhotoInclude = (typeof PHOTO_INCLUDES)[number];

export const PHOTO_SORTS = ["-createdAt", "createdAt", "-takenAt", "takenAt", "siteId", "-siteId"] as const;
export type PhotoSort = (typeof PHOTO_SORTS)[number];

const photoIncludeSchema = csvEnumSchema(PHOTO_INCLUDES);

export const photoIdSchema = z.uuid().overwrite((id) => id.toLowerCase());

export const photoUrlsSchema = z.object({
  thumb: z
    .string()
    .describe(
      "The path of the thumbnail, from the site root. A WebP image of at most 640 pixels on its shorter side and 1280 on its longer side. " +
        "Same as `display` if the photo has no thumbnail",
    ),
  display: z.string().describe("The path of the standard version, from the site root. A WebP image of at most 2048 pixels per side"),
  full: z
    .string()
    .describe(
      "The path of the full-size version, from the site root. An AVIF image of at most 4096 pixels per side, " +
        "stored only for photos wider or taller than 2560 pixels. Same as `display` if the photo has none",
    ),
});

export const photoSelectionSchema = z.object({
  stationId: z.number().int(),
  isMain: z.boolean().describe("Whether the photo is the station's main photo"),
  station: stationBaseSchema.optional().describe("Only returned with `include=selections.station`"),
});
export type PhotoSelection = z.infer<typeof photoSelectionSchema>;

export const photoDetailsShape = {
  width: z.number().int().nullable().describe("Width in pixels of the image at `urls.full`, or `null` if it is not known"),
  height: z.number().int().nullable().describe("Height in pixels of the image at `urls.full`, or `null` if it is not known"),
  note: z.string().nullable(),
  takenAt: z.iso.datetime().nullable().describe("When the photo was taken, or `null` if it is not known"),
  createdAt: z.iso.datetime(),
  author: userRefSchema
    .nullable()
    .describe(
      "The user who uploaded the photo, or `null` if that account has been deleted. " +
        "`name` is `null` for private profiles, unless you are the uploader or a staff member",
    ),
};

export const photoSchema = z.object({
  id: z.uuid(),
  locationId: z.number().int(),
  urls: photoUrlsSchema,
  ...photoDetailsShape,
  selections: z.array(photoSelectionSchema).describe("The stations that show the photo. Empty if no station shows it"),
  location: stationLocationSchema.optional().describe("Only returned with `include=location`"),
});
export type Photo = z.infer<typeof photoSchema>;

export const photoOwnerParamsSchema = z.object({ id: idParamSchema });
export const locationPhotoParamsSchema = z.object({ id: idParamSchema, photoId: photoIdSchema });

export const photoQuerySchema = z.object({ include: photoIncludeSchema.optional() }).strict();
export type PhotoQuery = z.infer<typeof photoQuerySchema>;

export const photoListQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .describe(
        "Matches part of the city, the address, the region's name or code, the photo's note, or the site id of a station that shows the photo. " +
          "Plain text only, without keywords",
      ),
    operatorIds: csvIdsSchema
      .optional()
      .describe(
        "Only photos shown by a station of one of these operators. For a shared network, the stations of its members count too. " +
          "Comma-separated ids",
      ),
    keepOtherCountries: booleanQuerySchema
      .optional()
      .describe(
        `${KEEP_OTHER_COUNTRIES_LEAD}. Photos in any other country match whichever operator's station shows them. ` +
          "Has no effect without `operatorIds`",
      ),
    regionIds: csvIdsSchema.optional(),
    countryCodes: csvCountryCodesSchema.optional(),
    statuses: csvEnumSchema(STATION_STATUSES)
      .optional()
      .describe(
        "Only photos shown by a station in one of these statuses. If omitted, `active` and `awaitingCells` stations count. " +
          `Comma-separated list. Possible values: \`${STATION_STATUSES.join("`, `")}\``,
      ),
    isMain: booleanQuerySchema
      .optional()
      .describe(
        "`true` returns only photos that are a station's main photo, `false` only photos that a station shows without using them as its main photo",
      ),
    takenAfter: instantSchema
      .optional()
      .describe("Only photos taken at or after this time. Photos without a known date are matched by their upload time"),
    createdAfter: instantSchema.optional().describe("Only photos uploaded at or after this time"),
    sort: z
      .enum(PHOTO_SORTS)
      .default("-createdAt")
      .describe(
        "The field to sort by, with a leading `-` for descending order. `createdAt` is the upload time, " +
          "`takenAt` uses the upload time for photos without a known date, " +
          "and `siteId` uses the lowest site id among the stations that show the photo",
      ),
    include: photoIncludeSchema.optional(),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    offset: offsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional().describe(INCLUDE_TOTAL_NOTE),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type PhotoListQuery = z.infer<typeof photoListQuerySchema>;

export const photoListSchema = z.object({
  data: z.array(photoSchema),
  paging: pagingSchema,
});
export type PhotoList = z.infer<typeof photoListSchema>;

export const PHOTO_MAX_BYTES = 20 * 1024 * 1024;

export const photoUploadShape = {
  notes: z.array(z.string()).optional().describe("One note per photo, in the same order as the photos. Notes are truncated to 100 characters"),
  takenAts: z
    .array(z.string())
    .optional()
    .describe("One value per photo: when it was taken, as an ISO 8601 date and time. If a value is empty, the date is read from the photo itself"),
  files: z.array(z.file().max(PHOTO_MAX_BYTES)).describe("The photos, up to 20 MB each. A photo's text fields must come before the photo"),
};

export const locationPhotoUploadSchema = z.object(photoUploadShape);

export const photoUpdateSchema = z
  .object({
    note: z.string().trim().max(100).nullable().optional().describe("A short note about the photo. `null` or an empty string clears it"),
    takenAt: instantSchema.nullable().optional().describe("When the photo was taken. Must not be in the future. `null` clears it"),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type PhotoUpdate = z.infer<typeof photoUpdateSchema>;

export const stationPhotosReplaceSchema = z
  .object({
    photoIds: z
      .array(photoIdSchema)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length, { message: "Photo ids must be unique" })
      .describe("The photos the station shows from now on. Each must belong to the station's location. Send an empty array to show none"),
    mainPhotoId: photoIdSchema
      .nullable()
      .optional()
      .describe("The station's main photo, which must be one of `photoIds`. If omitted or `null`, the station has no main photo"),
  })
  .strict()
  .refine((body) => body.mainPhotoId === undefined || body.mainPhotoId === null || body.photoIds.includes(body.mainPhotoId), {
    path: ["mainPhotoId"],
    message: "The main photo must be one of photoIds",
  });
export type StationPhotosReplace = z.infer<typeof stationPhotosReplaceSchema>;
