import { z } from "zod/v4";

import { CELL_RATS } from "./cells.ts";
import {
  CURSOR_OR_OFFSET_ISSUE,
  INCLUDE_TOTAL_NOTE,
  LIMIT_NOTE,
  MAX_ID,
  booleanQuerySchema,
  csvEnumSchema,
  csvIdsSchema,
  cursorSchema,
  daySchema,
  latitudeQuerySchema,
  longitudeQuerySchema,
  pagingSchema,
  usesCursorOrOffset,
} from "./common.ts";
import { operatorSchema } from "./operators.ts";
import { regionSchema } from "./regions.ts";
import { bboxSchema } from "./stations.ts";

export const EMF_REPORT_KINDS = ["measurement", "filing"] as const;
export type EmfReportKind = (typeof EMF_REPORT_KINDS)[number];

export const EMF_MEASUREMENT_STATUSES = ["planned", "completed", "cancelled"] as const;
export type EmfMeasurementStatus = (typeof EMF_MEASUREMENT_STATUSES)[number];

export const DEFAULT_EMF_MEASUREMENT_STATUSES: readonly EmfMeasurementStatus[] = ["planned"];

export const EMF_INCLUDES = ["operator", "region"] as const;
export type EmfInclude = (typeof EMF_INCLUDES)[number];

export const EMF_SITE_ID_MAX_LENGTH = 64;
export const EMF_REGISTER_PAGE_LIMIT = 100;
export const EMF_FILTER_COMBINATION_LIMIT = 16;
export const EMF_OFFSET_LIMIT = 10_000_000;

const idQuerySchema = z.coerce.number<string>().int().positive().max(MAX_ID);
const siteIdQuerySchema = z.string().trim().min(1).max(EMF_SITE_ID_MAX_LENGTH);
const siteIdFilterSchema = siteIdQuerySchema.describe("Matches site ids that contain this text, ignoring case");

export type EmfSiteReference = {
  stationId?: number;
  officialSiteId?: number;
  siteId?: string;
  latitude?: number;
  longitude?: number;
  operatorId?: number;
};

const siteReferenceShape = {
  stationId: idQuerySchema.optional().describe("The id of a station in the database"),
  officialSiteId: idQuerySchema.optional().describe("The id of a site in the official register"),
  siteId: siteIdQuerySchema
    .optional()
    .describe("The operator's site id, for a station that is not in the database. Requires `latitude` and `longitude`"),
  latitude: latitudeQuerySchema.optional(),
  longitude: longitudeQuerySchema.optional(),
  operatorId: idQuerySchema
    .optional()
    .describe("The operator of the site, used together with `siteId`. `GET /emf/reports` needs it to find the operator's filings"),
};
const SITE_REFERENCE_ISSUE = { message: "Send one of: stationId, officialSiteId, or siteId with latitude and longitude" };

function namesOneSite(query: EmfSiteReference): boolean {
  const ways = [query.stationId, query.officialSiteId, query.siteId].filter((value) => value !== undefined).length;
  if (ways !== 1) return false;
  if (query.siteId !== undefined) return query.latitude !== undefined && query.longitude !== undefined;
  return query.latitude === undefined && query.longitude === undefined && query.operatorId === undefined;
}

export const emfReportSchema = z.object({
  kind: z.enum(EMF_REPORT_KINDS).describe("`measurement` for a report of a measurement, `filing` for the report an operator attached to a filing"),
  url: z.url(),
  measuredOn: daySchema.nullable().describe("The day of the measurement. `null` for a filing"),
  registeredOn: daySchema.nullable().describe("The day the filing was registered. `null` for a measurement"),
  publishedAt: z.iso.datetime().nullable().describe("When the filing was published. `null` for a measurement"),
  laboratoryName: z.string().nullable().describe("The laboratory that made the measurement. `null` if it is not known, and for a filing"),
  filerName: z.string().nullable().describe("The company that submitted the filing. `null` for a measurement"),
  installationDocumentUrl: z.url().nullable().describe("The installation document attached to the filing, if any. `null` for a measurement"),
  hasAntennaTable: z.boolean().describe("`true` for a laboratory report, the only kind that `GET /emf/antennas` reads"),
});
export type EmfReport = z.infer<typeof emfReportSchema>;

export const emfReportListQuerySchema = z.object(siteReferenceShape).strict().refine(namesOneSite, SITE_REFERENCE_ISSUE);
export type EmfReportListQuery = z.infer<typeof emfReportListQuerySchema>;

export const emfAntennaBandSchema = z.object({
  label: z.string().nullable().describe("The band as it appears in the report, for example `LTE1800`"),
  rat: z.enum(CELL_RATS).nullable().describe("`null` if the technology cannot be told from the report"),
  frequencyMhz: z.number(),
  eirpWatts: z.number().nullable(),
  tiltRange: z.object({ min: z.number(), max: z.number() }).nullable().describe("The tilt range given in the report, in degrees"),
  measuredTilt: z.number().nullable().describe("The tilt the laboratory measured, in degrees"),
});
export type EmfAntennaBand = z.infer<typeof emfAntennaBandSchema>;

export const emfAntennaSchema = z.object({
  rowNumber: z.number().int().nullable().describe("The row's number in the report's table"),
  pageNumber: z.number().int(),
  model: z.string().nullable(),
  manufacturer: z.string().nullable(),
  heightMeters: z.number().describe("Height above the ground"),
  azimuth: z.number().nullable(),
  totalEirpWatts: z.number().nullable(),
  bands: z.array(emfAntennaBandSchema),
});
export type EmfAntenna = z.infer<typeof emfAntennaSchema>;

export const emfReportHeadSchema = z.object({
  url: z.url(),
  measuredOn: daySchema.nullable().describe("The day of the measurement. `null` if the register does not give it"),
  laboratoryName: z.string().nullable().describe("The laboratory that made the measurement. `null` if it is not known"),
});
export type EmfReportHead = z.infer<typeof emfReportHeadSchema>;

export const emfAntennaReportSchema = z.object({
  report: emfReportHeadSchema.nullable().describe("The report the antennas were read from, or `null` if the site has no laboratory report"),
  antennas: z.array(emfAntennaSchema).describe("Empty when the report has no antenna table that could be read"),
});
export type EmfAntennaReport = z.infer<typeof emfAntennaReportSchema>;

export const emfAntennaQuerySchema = z
  .object({
    ...siteReferenceShape,
    reportUrl: z.url().max(2048).optional().describe("The URL of one of the site's laboratory reports. If omitted, the newest one is read"),
  })
  .strict()
  .refine(namesOneSite, SITE_REFERENCE_ISSUE);
export type EmfAntennaQuery = z.infer<typeof emfAntennaQuerySchema>;

const emfSiteShape = {
  siteId: z.string().nullable(),
  operatorId: z.number().int().nullable().describe("The operator matched to the company SI2PEM names, or `null` if there is no match"),
  stationId: z.number().int().nullable().describe("The station in the database with this site id and operator, or `null` if there is none"),
};
const emfPlaceShape = {
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    city: z.string().nullable(),
    address: z.string().nullable(),
  }),
  regionId: z.number().int().nullable().describe("The region matched to the one SI2PEM names, or `null` if there is no match"),
};
const emfIncludeShape = {
  operator: operatorSchema.nullable().optional().describe("Only returned with `include=operator`"),
  region: regionSchema.nullable().optional().describe("Only returned with `include=region`"),
};

export const emfMeasurementSchema = z.object({
  id: z.number().int().nullable().describe("The measurement's number in SI2PEM. `null` for rows requested with `bbox`, where SI2PEM provides none"),
  ...emfSiteShape,
  status: z.enum(EMF_MEASUREMENT_STATUSES),
  startsOn: daySchema.nullable(),
  endsOn: daySchema.nullable(),
  laboratory: z.object({ name: z.string(), accreditationNumber: z.string().nullable() }).nullable(),
  ...emfPlaceShape,
  reportUrl: z.url().nullable(),
  ...emfIncludeShape,
});
export type EmfMeasurement = z.infer<typeof emfMeasurementSchema>;

export const emfInactiveSiteSchema = z.object({
  ...emfSiteShape,
  disabledOn: daySchema.nullable(),
  ...emfPlaceShape,
  ...emfIncludeShape,
});
export type EmfInactiveSite = z.infer<typeof emfInactiveSiteSchema>;

export const emfFilingSchema = z.object({
  ...emfSiteShape,
  siteName: z.string().nullable(),
  filerName: z.string().nullable().describe("The company that submitted the filing, or the site's operator if SI2PEM names no filer"),
  publishedAt: z.iso.datetime(),
  registeredOn: daySchema.nullable(),
  referenceNumber: z.string().nullable(),
  ...emfPlaceShape,
  installationDocumentUrl: z.url().nullable(),
  reportUrl: z.url().nullable(),
  ...emfIncludeShape,
});
export type EmfFiling = z.infer<typeof emfFilingSchema>;

const emfOffsetSchema = z.coerce
  .number<number>()
  .int()
  .min(0)
  .max(EMF_OFFSET_LIMIT)
  .describe(
    `The number of items to skip. It can be as high as ${EMF_OFFSET_LIMIT.toLocaleString("en-US")}, so you can jump straight to the last page. ` +
      "Cannot be combined with `cursor`",
  );
const pagingShape = {
  cursor: cursorSchema.optional(),
  offset: emfOffsetSchema.optional(),
  includeTotal: booleanQuerySchema.optional().describe(INCLUDE_TOTAL_NOTE),
};
const CSV_IDS_NOTE = "Comma-separated ids";
const REGISTER_ORDER_NOTE = "SI2PEM's register accepts one value per request, so results for several values are returned one group after another";

function filterCombinations(...filters: (readonly unknown[] | undefined)[]): number {
  return filters.reduce((product, values) => product * (values?.length ?? 1), 1);
}

export const emfMeasurementListQuerySchema = z
  .object({
    statuses: csvEnumSchema(EMF_MEASUREMENT_STATUSES)
      .optional()
      .describe(
        `Comma-separated list. Possible values: \`${EMF_MEASUREMENT_STATUSES.join("`, `")}\`. ` +
          "Defaults to `planned`, the only status available with `bbox`",
      ),
    operatorIds: csvIdsSchema.optional().describe(`${CSV_IDS_NOTE}. ${REGISTER_ORDER_NOTE}`),
    regionIds: csvIdsSchema.optional().describe(`${CSV_IDS_NOTE}. Cannot be combined with \`bbox\`, where SI2PEM does not provide the region`),
    siteId: siteIdFilterSchema.optional(),
    bbox: bboxSchema
      .optional()
      .describe("Bounding box as `west,south,east,north` in degrees. If set, the list comes from SI2PEM's map layer instead of its register"),
    include: csvEnumSchema(EMF_INCLUDES).optional(),
    limit: z.coerce
      .number<number>()
      .int()
      .min(1)
      .max(1000)
      .default(50)
      .describe(`${LIMIT_NOTE}. At most ${EMF_REGISTER_PAGE_LIMIT} without \`bbox\``),
    ...pagingShape,
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE)
  .refine((query) => query.bbox === undefined || (query.statuses ?? DEFAULT_EMF_MEASUREMENT_STATUSES).every((status) => status === "planned"), {
    path: ["statuses"],
    message: "With bbox only planned measurements are available",
  })
  .refine((query) => query.bbox === undefined || query.regionIds === undefined, {
    path: ["regionIds"],
    message: "regionIds cannot be combined with bbox",
  })
  .refine((query) => query.bbox !== undefined || query.limit <= EMF_REGISTER_PAGE_LIMIT, {
    path: ["limit"],
    message: `Without bbox the limit is at most ${EMF_REGISTER_PAGE_LIMIT}`,
  })
  .refine(
    (query) => query.bbox !== undefined || filterCombinations(query.statuses, query.operatorIds, query.regionIds) <= EMF_FILTER_COMBINATION_LIMIT,
    { message: `statuses, operatorIds and regionIds may combine to at most ${EMF_FILTER_COMBINATION_LIMIT} requests to SI2PEM` },
  );
export type EmfMeasurementListQuery = z.infer<typeof emfMeasurementListQuerySchema>;

export const emfMeasurementListSchema = z.object({
  data: z.array(emfMeasurementSchema),
  paging: pagingSchema,
});
export type EmfMeasurementList = z.infer<typeof emfMeasurementListSchema>;

export const emfInactiveSiteListQuerySchema = z
  .object({
    operatorIds: csvIdsSchema.optional(),
    regionIds: csvIdsSchema.optional(),
    siteId: siteIdFilterSchema.optional(),
    include: csvEnumSchema(EMF_INCLUDES).optional(),
    limit: z.coerce.number<number>().int().min(1).max(1000).default(50).describe(LIMIT_NOTE),
    ...pagingShape,
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type EmfInactiveSiteListQuery = z.infer<typeof emfInactiveSiteListQuerySchema>;

export const emfInactiveSiteListSchema = z.object({
  data: z.array(emfInactiveSiteSchema),
  paging: pagingSchema,
});
export type EmfInactiveSiteList = z.infer<typeof emfInactiveSiteListSchema>;

export const emfFilingListQuerySchema = z
  .object({
    operatorIds: csvIdsSchema.optional().describe(`${CSV_IDS_NOTE}. ${REGISTER_ORDER_NOTE}`),
    regionIds: csvIdsSchema.optional(),
    siteId: siteIdFilterSchema.optional(),
    include: csvEnumSchema(EMF_INCLUDES).optional(),
    limit: z.coerce.number<number>().int().min(1).max(EMF_REGISTER_PAGE_LIMIT).default(50).describe(LIMIT_NOTE),
    ...pagingShape,
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE)
  .refine((query) => filterCombinations(query.operatorIds, query.regionIds) <= EMF_FILTER_COMBINATION_LIMIT, {
    message: `operatorIds and regionIds may combine to at most ${EMF_FILTER_COMBINATION_LIMIT} requests to SI2PEM`,
  });
export type EmfFilingListQuery = z.infer<typeof emfFilingListQuerySchema>;

export const emfFilingListSchema = z.object({
  data: z.array(emfFilingSchema),
  paging: pagingSchema,
});
export type EmfFilingList = z.infer<typeof emfFilingListSchema>;
