import { z } from "zod/v4";

import {
  AT_LEAST_ONE_FIELD_ISSUE,
  bboxSchema,
  countryCodeSchema,
  csvCountryCodesSchema,
  hasAnyField,
  idParamSchema,
  latitudeQuerySchema,
  longitudeQuerySchema,
} from "./common.ts";

const regionCodeSchema = z.string().trim().min(1).max(3);
const regionNameSchema = z.string().trim().min(1).max(100);
const regionIsoCodeSchema = z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/, "Must be an ISO 3166-2 code, for example US-CA");

const REGION_CODE_NOTE = "A short code for the region. Must be unique within the country";
const REGION_NAME_NOTE = "The region's name. Must be unique within the country";
const ISO_CODE_NOTE = "ISO 3166-2 code, for example `US-CA`. Must start with the country's code and be unique across all regions";
const BBOX_NOTE =
  "Returns only the regions whose stored outline touches this bounding box, given as `west,south,east,north` in degrees. " +
  "West may be greater than east for a box that crosses the 180th meridian. A region without a stored outline never matches. " +
  "Cannot be combined with `latitude` and `longitude`";

export const regionSchema = z.object({
  id: z.number().int(),
  countryCode: countryCodeSchema,
  code: z.string().describe("A short code for the region, unique within its country. The `region:` search keyword accepts it"),
  name: z.string(),
  isoCode: z.string().nullable().describe("ISO 3166-2 code, for example `US-CA`"),
});
export type Region = z.infer<typeof regionSchema>;

export const regionParamsSchema = z.object({ id: idParamSchema });

export const regionListQuerySchema = z
  .object({
    countryCodes: csvCountryCodesSchema.optional(),
    bbox: bboxSchema.optional().describe(BBOX_NOTE),
    latitude: latitudeQuerySchema.optional().describe("Together with `longitude`, returns only the region this point lies in"),
    longitude: longitudeQuerySchema.optional().describe("Together with `latitude`, returns only the region this point lies in"),
  })
  .strict()
  .refine((query) => (query.latitude === undefined) === (query.longitude === undefined), {
    path: ["longitude"],
    message: "latitude and longitude must be sent together",
  })
  .refine((query) => query.bbox === undefined || (query.latitude === undefined && query.longitude === undefined), {
    path: ["bbox"],
    message: "bbox cannot be combined with latitude and longitude",
  });
export type RegionListQuery = z.infer<typeof regionListQuerySchema>;

export const regionCreateSchema = z
  .object({
    countryCode: countryCodeSchema,
    code: regionCodeSchema.describe(REGION_CODE_NOTE),
    name: regionNameSchema.describe(REGION_NAME_NOTE),
    isoCode: regionIsoCodeSchema.nullable().optional().describe(ISO_CODE_NOTE),
  })
  .strict();
export type RegionCreate = z.infer<typeof regionCreateSchema>;

export const regionUpdateSchema = z
  .object({
    code: regionCodeSchema.optional().describe(REGION_CODE_NOTE),
    name: regionNameSchema.optional().describe(REGION_NAME_NOTE),
    isoCode: regionIsoCodeSchema.nullable().optional().describe(`${ISO_CODE_NOTE}. \`null\` clears it`),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type RegionUpdate = z.infer<typeof regionUpdateSchema>;
