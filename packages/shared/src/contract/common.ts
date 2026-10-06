import { z } from "zod/v4";

export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/, "Must be a two-letter country code in upper case");

export const LIMIT_NOTE = "The maximum number of items to return";
export const INCLUDE_TOTAL_NOTE = "Set to `true` to include `paging.total`, the total number of matching items";

export const pagingSchema = z.object({
  limit: z.number().int().positive().describe("The page size that was used"),
  nextCursor: z.string().nullable().describe("Pass it as `cursor` to get the next page. `null` on the last page"),
  total: z.number().int().nonnegative().optional().describe("The total number of matching items. Only returned with `includeTotal=true`"),
});
export type Paging = z.infer<typeof pagingSchema>;

export const userRefSchema = z.object({
  id: z.uuid(),
  username: z.string().nullable(),
  name: z.string().nullable(),
  image: z.string().nullable(),
});
export type UserRef = z.infer<typeof userRefSchema>;

export const noContentSchema = z.undefined().describe("No content");

export const INCLUDE_NOTE = "Only returned when requested with `include`";

export const csvSchema = z.string().transform((value) => value.split(","));

export const MAX_ID = 2_147_483_647;
export const idSchema = z.number().int().positive().max(MAX_ID);
export const idParamSchema = z.coerce.number<number>().int().positive().max(MAX_ID);

const YEAR_MESSAGE = "Must be in the years 0001 to 9998";
const YEAR_LENGTH = 4;
const LATEST_YEAR = 9998;

function isStorableYear(year: number): boolean {
  return year >= 1 && year <= LATEST_YEAR;
}

export const instantSchema = z.iso
  .datetime({ offset: true })
  .refine((value) => isStorableYear(Number(value.slice(0, YEAR_LENGTH))) && isStorableYear(new Date(value).getUTCFullYear()), {
    message: YEAR_MESSAGE,
  });
export const daySchema = z.iso.date().refine((value) => isStorableYear(Number(value.slice(0, YEAR_LENGTH))), { message: YEAR_MESSAGE });

export const csvUuidsSchema = csvSchema.pipe(z.array(z.uuid()).min(1).max(100)).describe("Comma-separated UUIDs");
export const csvCountryCodesSchema = csvSchema.pipe(z.array(countryCodeSchema).min(1).max(100)).describe("Comma-separated two-letter country codes");
export const csvIdsSchema = csvSchema
  .pipe(z.array(z.coerce.number<string>().int().positive().max(MAX_ID)).min(1).max(100))
  .describe("Comma-separated ids");

export function csvEnumSchema<const T extends readonly [string, ...string[]]>(values: T) {
  return csvSchema.pipe(z.array(z.enum(values)).min(1)).describe(`Comma-separated list. Possible values: \`${values.join("`, `")}\``);
}

export const booleanQuerySchema = z.enum(["true", "false"]).transform((value) => value === "true");

export const MAX_LATITUDE = 90;
export const MAX_LONGITUDE = 180;

const DEGREES_PATTERN = /^-?\d{1,3}(?:\.\d{1,15})?$/;

function degreesQuerySchema(limit: number) {
  const error = `Must be a number of degrees from -${limit} to ${limit}, for example 52.2297`;
  return z.preprocess(
    (value) => (typeof value === "string" && DEGREES_PATTERN.test(value) ? value : undefined),
    z.coerce.number<string>({ error }).min(-limit).max(limit),
  );
}

export const latitudeQuerySchema = degreesQuerySchema(MAX_LATITUDE);
export const longitudeQuerySchema = degreesQuerySchema(MAX_LONGITUDE);

const bboxLongitudeSchema = z.coerce.number<string>().min(-180).max(180);
const bboxLatitudeSchema = z.coerce.number<string>().min(-90).max(90);

export const bboxSchema = csvSchema
  .pipe(z.tuple([bboxLongitudeSchema, bboxLatitudeSchema, bboxLongitudeSchema, bboxLatitudeSchema]))
  .refine(([west, south, east, north]) => west !== east && south < north, { message: "Must be west,south,east,north" })
  .describe("Bounding box as `west,south,east,north` in degrees. West may be greater than east for a box that crosses the 180th meridian");
export type Bbox = z.infer<typeof bboxSchema>;

export const limitSchema = z.coerce.number<number>().int().min(1).max(200).default(50).describe(LIMIT_NOTE);
export const cursorSchema = z.string().min(1).max(512).describe("The `paging.nextCursor` of the previous page. Omit it to get the first page");
export const OFFSET_LIMIT = 100_000;
export const offsetSchema = z.coerce
  .number<number>()
  .int()
  .min(0)
  .max(OFFSET_LIMIT)
  .describe("The number of items to skip. Cannot be combined with `cursor`");

export const CURSOR_OR_OFFSET_ISSUE = { path: ["offset"], error: "Use either cursor or offset" };

export function usesCursorOrOffset(query: { cursor?: string; offset?: number }): boolean {
  return query.cursor === undefined || query.offset === undefined;
}

export const AT_LEAST_ONE_FIELD_ISSUE = { error: "At least one field is required" };

export function hasAnyField(value: object): boolean {
  return Object.keys(value).length > 0;
}

export const SEARCH_QUERY_MAX_LENGTH = 500;

export const searchTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(SEARCH_QUERY_MAX_LENGTH)
  .refine((value) => !value.includes("\u0000"), { message: "Must not contain a null character" })
  .describe("Free text and keyword filters, for example `enbid:123456 rat:LTE Main Street`");
