import { z } from "zod/v4";

import { BAND_VARIANTS } from "./bands.ts";
import {
  CURSOR_OR_OFFSET_ISSUE,
  INCLUDE_NOTE,
  MAX_ID,
  booleanQuerySchema,
  countryCodeSchema,
  csvCountryCodesSchema,
  csvEnumSchema,
  csvIdsSchema,
  csvSchema,
  cursorSchema,
  daySchema,
  idParamSchema,
  instantSchema,
  limitSchema,
  offsetSchema,
  pagingSchema,
  searchTextSchema,
  usesCursorOrOffset,
} from "./common.ts";
import { MAX_LOCATION_LIST_LIMIT, OFFICIAL_PERMIT_STATUSES, OFFICIAL_RAT_FILTERS, OFFICIAL_SITE_INCLUDES } from "./constants.ts";
import { csvSourceKeysSchema } from "./officialSources.ts";
import { regionSchema } from "./regions.ts";
import { KEEP_OTHER_COUNTRIES_LEAD, LOCATION_SORTS, areaFilterShape } from "./stations.ts";

export const OFFICIAL_RATS = ["gsm", "umts", "lte", "nr", "cdma", "iot"] as const;
export type OfficialRat = (typeof OFFICIAL_RATS)[number];

export const OFFICIAL_PERMIT_KINDS = [
  "permit",
  "permitChange",
  "registration",
  "inventory",
  "environmentalPermit",
  "certificate",
  "assessment",
  "license",
] as const;
export type OfficialPermitKind = (typeof OFFICIAL_PERMIT_KINDS)[number];

export const OFFICIAL_STATUS_FILTERS = [...OFFICIAL_PERMIT_STATUSES, "unknown"] as const;
export type OfficialStatusFilter = (typeof OFFICIAL_STATUS_FILTERS)[number];

export const OFFICIAL_ANTENNA_TYPES = ["indoor", "outdoor"] as const;

export const OFFICIAL_LOCATION_INCLUDES = ["region", "sites", "sites.permits", "sites.permits.sectors"] as const;
export type OfficialLocationInclude = (typeof OFFICIAL_LOCATION_INCLUDES)[number];

export const OFFICIAL_PERMIT_INCLUDES = ["sectors", "officialSite", "officialSite.location"] as const;
export type OfficialPermitInclude = (typeof OFFICIAL_PERMIT_INCLUDES)[number];

export const OFFICIAL_SITE_SORTS = ["-id", "id", "createdAt", "-createdAt", "updatedAt", "-updatedAt", "relevance"] as const;
export type OfficialSiteSort = (typeof OFFICIAL_SITE_SORTS)[number];

export const OFFICIAL_PERMIT_SORTS = ["-id", "id", "updatedAt", "-updatedAt"] as const;
export type OfficialPermitSort = (typeof OFFICIAL_PERMIT_SORTS)[number];

export const MAX_OFFICIAL_SITE_LIST_LIMIT = 1000;

const SITE_ID_MAX_LENGTH = 16;
const DATASET_KEY_MAX_LENGTH = 64;
const LIST_ID_MAX_LENGTH = 64;

const PERMIT_KIND_NOTE =
  "What the record is. `permit`: a decision that grants a permit. `permitChange`: a decision that changes an earlier permit. " +
  "`registration`, `inventory`, `environmentalPermit`, `certificate`, `assessment` and `license` " +
  "are the records other registers publish instead of permits";
const SOURCE_KEY_NOTE = "The key of the source the record comes from, as in `GET /official/sources`";
const SOURCE_KEYS_FILTER_NOTE = "Matches records of these sources. Comma-separated source keys";
const LABEL_MHZ_NOTE = "The nominal frequency of the band in MHz, as the register names it";
const VARIANT_NOTE = "`railway` for a band set aside for railways, such as GSM-R, and `commercial` for every other band";
const LABEL_NAME_NOTE = "The label as people write it, for example `LTE 800` or `GSM-R 900`. `null` without a technology or a frequency";
const AZIMUTH_NOTE = "The antenna direction in degrees, as the register publishes it. A value of 360 is passed on as it is";
const SITE_ID_NOTE =
  "The operator's id for the site as the register lists it, or the register's own station number where the register lists no operator ids. " +
  "`null` when there is neither";
const SOURCE_REF_NOTE = "The register's own id for the record, or `null` when it has none";
const PRECISION_NOTE = "How far the published position can be from the real one. `null` when the register does not say";
const STATION_ID_NOTE = "The station in this database linked to the site";
const SITE_STATUS_NOTE =
  "`inService` if any of the site's permits is in service, otherwise `approved` if any is approved. `null` if the register does not say";
const SITE_UPDATED_NOTE =
  "When the site last changed. An import dates a change by the file it read, so a site imported for the first time " +
  "from an older file can have an `updatedAt` earlier than its `createdAt`";
const LOCATION_SITES_NOTE = "Only returned with `include=sites` or a `sites.*` value. Lists only the sites that match the site filters you sent";
const SITE_PERMITS_NOTE =
  "Only returned when requested with `include`. When the request filters by `rats` or `bandLabels`, only the permits that match are listed";
const RATS_FILTER_NOTE =
  "Matches sites with a permit for one of these technologies. `gsm` matches GSM on commercial bands and `gsmR` GSM on railway bands. " +
  "With `bandLabels`, a single permit must match both. " +
  `Comma-separated list. Possible values: \`${OFFICIAL_RAT_FILTERS.join("`, `")}\``;
const CHANGED_AFTER_NOTE =
  "Matches sites first imported or last changed at or after this time. Unlike `createdAfter` and `updatedAfter` together, either one is enough";
const STATUSES_FILTER_VALUES = `\`unknown\` matches a \`null\` status. Comma-separated list. Possible values: \`${OFFICIAL_STATUS_FILTERS.join("`, `")}\``;
const KINDS_FILTER_NOTE = `Matches permits of these kinds. Comma-separated list. Possible values: \`${OFFICIAL_PERMIT_KINDS.join("`, `")}\``;
const BAND_LABELS_FILTER_NOTE =
  "Matches sites with a permit for one of these bands, given as the nominal frequency in MHz (`labelMhz`), for example `800,1800`. " +
  "Comma-separated";
const OPERATORS_FILTER_NOTE = "Matches sites of these operators. For a shared network, the sites of its members match too. Comma-separated ids";
const LIST_FILTER_NOTE =
  "Matches only the official sites on this list. The list must be public or your own, unless you have the `read_all:user_lists` permission";
const KEEP_OTHER_COUNTRIES_NOTE = `${KEEP_OTHER_COUNTRIES_LEAD}. Sites in any other country match whatever their operator is. Has no effect without \`operatorIds\``;
const SITE_SORT_NOTE =
  "`relevance` returns the best matches for `q` first: an exact site id, then a site id that contains the text, " +
  "then a permit number, then the place. Defaults to `relevance` when you send `q`, and to `-id` otherwise";

const csvSiteIdsSchema = csvSchema
  .pipe(z.array(z.string().min(1).max(SITE_ID_MAX_LENGTH)).min(1).max(100))
  .describe("Matches sites whose `siteId` is one of these. Comma-separated");
const csvBandLabelsSchema = csvSchema
  .pipe(z.array(z.coerce.number<string>().int().positive().max(MAX_ID)).min(1).max(100))
  .describe(BAND_LABELS_FILTER_NOTE);

export const officialPermitKindSchema = z.enum(OFFICIAL_PERMIT_KINDS).describe(PERMIT_KIND_NOTE);

export const officialPermitLabelSchema = z.object({
  rat: z.enum(OFFICIAL_RATS).nullable(),
  labelMhz: z.number().int().nullable().describe(LABEL_MHZ_NOTE),
  variant: z.enum(BAND_VARIANTS).nullable().describe(VARIANT_NOTE),
  name: z.string().nullable().describe(LABEL_NAME_NOTE),
});
export type OfficialPermitLabel = z.infer<typeof officialPermitLabelSchema>;

export const officialBandLabelSchema = z.object({
  countryCode: countryCodeSchema.describe("The country of the locations whose permits carry the label"),
  sourceKey: z.string().describe(SOURCE_KEY_NOTE),
  ...officialPermitLabelSchema.shape,
});
export type OfficialBandLabel = z.infer<typeof officialBandLabelSchema>;

export const officialPermitSectorSchema = z.object({
  id: z.number().int(),
  azimuth: z.number().int().nullable().describe(AZIMUTH_NOTE),
  antennaHeightMeters: z.number().nullable(),
  antennaType: z.enum(OFFICIAL_ANTENNA_TYPES).nullable(),
});
export type OfficialPermitSector = z.infer<typeof officialPermitSectorSchema>;

const officialPermitShape = {
  id: z.number().int(),
  officialSiteId: z.number().int(),
  sourceKey: z.string().describe(SOURCE_KEY_NOTE),
  number: z.string().nullable().describe("The permit's number, as the register writes it"),
  kind: officialPermitKindSchema.nullable(),
  expiresOn: daySchema.nullable().describe("The last day the permit is valid. `null` if it does not expire, or if the register does not say"),
  status: z
    .enum(OFFICIAL_PERMIT_STATUSES)
    .nullable()
    .describe("`approved` while the antennas are not yet in service, `inService` once they are. `null` if the register does not say"),
  label: officialPermitLabelSchema.describe("The band the permit is for, as the register names it"),
  datasets: z.array(z.string()).describe("The keys of the source's datasets that list the permit"),
  createdAt: z.iso.datetime().describe("When the permit was first imported"),
  updatedAt: z.iso.datetime(),
  sectors: z.array(officialPermitSectorSchema).optional().describe(INCLUDE_NOTE),
};

export const officialSitePermitSchema = z.object(officialPermitShape);
export type OfficialSitePermit = z.infer<typeof officialSitePermitSchema>;

const officialLocationShape = {
  id: z.number().int(),
  sourceKey: z.string().describe(SOURCE_KEY_NOTE),
  countryCode: countryCodeSchema,
  regionId: z.number().int().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  precisionMeters: z.number().int().nullable().describe(PRECISION_NOTE),
  sourceRef: z.string().nullable().describe(SOURCE_REF_NOTE),
  createdAt: z.iso.datetime().describe("When the location was first imported"),
  updatedAt: z.iso.datetime(),
  region: regionSchema.nullable().optional().describe(INCLUDE_NOTE),
};

export const officialSiteLocationSchema = z.object(officialLocationShape);
export type OfficialSiteLocation = z.infer<typeof officialSiteLocationSchema>;

export const officialSiteSchema = z.object({
  id: z.number().int(),
  sourceKey: z.string().describe(SOURCE_KEY_NOTE),
  siteId: z.string().nullable().describe(SITE_ID_NOTE),
  sourceRef: z.string().nullable().describe(SOURCE_REF_NOTE),
  operatorId: z.number().int().nullable(),
  locationId: z.number().int(),
  stationId: z.number().int().nullable().describe(STATION_ID_NOTE),
  status: z.enum(OFFICIAL_PERMIT_STATUSES).nullable().describe(SITE_STATUS_NOTE),
  createdAt: z.iso.datetime().describe("When the site was first imported"),
  updatedAt: z.iso.datetime().describe(SITE_UPDATED_NOTE),
  location: officialSiteLocationSchema.optional().describe(INCLUDE_NOTE),
  permits: z.array(officialSitePermitSchema).optional().describe(SITE_PERMITS_NOTE),
});
export type OfficialSite = z.infer<typeof officialSiteSchema>;

export const officialLocationSiteSchema = officialSiteSchema.omit({ location: true });
export type OfficialLocationSite = z.infer<typeof officialLocationSiteSchema>;

export const officialPermitSiteSchema = officialSiteSchema.omit({ permits: true });
export type OfficialPermitSite = z.infer<typeof officialPermitSiteSchema>;

export const officialLocationSchema = z.object({
  ...officialLocationShape,
  sites: z.array(officialLocationSiteSchema).optional().describe(LOCATION_SITES_NOTE),
});
export type OfficialLocation = z.infer<typeof officialLocationSchema>;

export const officialPermitSchema = z.object({
  ...officialPermitShape,
  officialSite: officialPermitSiteSchema.optional().describe(INCLUDE_NOTE),
});
export type OfficialPermit = z.infer<typeof officialPermitSchema>;

export const officialLocationParamsSchema = z.object({ id: idParamSchema });
export const officialSiteParamsSchema = z.object({ id: idParamSchema });
export const officialPermitParamsSchema = z.object({ id: idParamSchema });

export const officialSiteWatchSchema = z.object({
  isWatched: z.boolean().describe("Whether you watch the official site directly. Following it through a list with notifications does not count"),
});
export type OfficialSiteWatch = z.infer<typeof officialSiteWatchSchema>;

export const officialBandLabelQuerySchema = z
  .object({
    countryCodes: csvCountryCodesSchema.optional().describe("Matches labels used in these countries. Comma-separated two-letter country codes"),
    sourceKeys: csvSourceKeysSchema.optional().describe(SOURCE_KEYS_FILTER_NOTE),
  })
  .strict();
export type OfficialBandLabelQuery = z.infer<typeof officialBandLabelQuerySchema>;

export const officialSiteFilterShape = {
  operatorIds: csvIdsSchema.optional().describe(OPERATORS_FILTER_NOTE),
  rats: csvEnumSchema(OFFICIAL_RAT_FILTERS).optional().describe(RATS_FILTER_NOTE),
  bandLabels: csvBandLabelsSchema.optional(),
  statuses: csvEnumSchema(OFFICIAL_STATUS_FILTERS).optional().describe(`Matches sites with one of these statuses. ${STATUSES_FILTER_VALUES}`),
  createdAfter: instantSchema.optional().describe("Matches sites first imported at or after this time"),
  updatedAfter: instantSchema.optional().describe("Matches sites last changed at or after this time"),
  changedAfter: instantSchema.optional().describe(CHANGED_AFTER_NOTE),
  listId: z.string().min(1).max(LIST_ID_MAX_LENGTH).optional().describe(LIST_FILTER_NOTE),
};

const officialAreaFilterShape = {
  ...areaFilterShape,
  sourceKeys: csvSourceKeysSchema.optional().describe(SOURCE_KEYS_FILTER_NOTE),
};

export const officialLocationQuerySchema = z
  .object({
    ...officialSiteFilterShape,
    keepOtherCountries: booleanQuerySchema.optional().describe(KEEP_OTHER_COUNTRIES_NOTE),
    include: csvEnumSchema(OFFICIAL_LOCATION_INCLUDES).optional(),
  })
  .strict();
export type OfficialLocationQuery = z.infer<typeof officialLocationQuerySchema>;

export const officialLocationListQuerySchema = z
  .object({
    ...officialSiteFilterShape,
    keepOtherCountries: booleanQuerySchema.optional().describe(KEEP_OTHER_COUNTRIES_NOTE),
    ...officialAreaFilterShape,
    include: csvEnumSchema(OFFICIAL_LOCATION_INCLUDES).optional(),
    sort: z.enum(LOCATION_SORTS).default("-id"),
    limit: z.coerce.number<number>().int().min(1).max(MAX_LOCATION_LIST_LIMIT).default(50),
    cursor: cursorSchema.optional(),
    offset: offsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional(),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type OfficialLocationListQuery = z.infer<typeof officialLocationListQuerySchema>;

export const officialLocationListSchema = z.object({
  data: z.array(officialLocationSchema),
  paging: pagingSchema,
});
export type OfficialLocationList = z.infer<typeof officialLocationListSchema>;

export const officialSiteQuerySchema = z.object({ include: csvEnumSchema(OFFICIAL_SITE_INCLUDES).optional() }).strict();
export type OfficialSiteQuery = z.infer<typeof officialSiteQuerySchema>;

export const officialSiteListQuerySchema = z
  .object({
    q: searchTextSchema
      .optional()
      .describe(
        "Matches sites whose id or permit number contains this text, or whose city or address does. " +
          "Letter case is ignored, and so are accents in the city and the address",
      ),
    siteIds: csvSiteIdsSchema.optional(),
    stationIds: csvIdsSchema
      .optional()
      .describe("Matches the sites linked to these stations. A station in a country you cannot access matches nothing. Comma-separated ids"),
    ...officialSiteFilterShape,
    ...officialAreaFilterShape,
    include: csvEnumSchema(OFFICIAL_SITE_INCLUDES).optional(),
    sort: z.enum(OFFICIAL_SITE_SORTS).optional().describe(SITE_SORT_NOTE),
    limit: z.coerce.number<number>().int().min(1).max(MAX_OFFICIAL_SITE_LIST_LIMIT).default(50),
    cursor: cursorSchema.optional(),
    offset: offsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional(),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type OfficialSiteListQuery = z.infer<typeof officialSiteListQuerySchema>;

export const officialSiteListSchema = z.object({
  data: z.array(officialSiteSchema),
  paging: pagingSchema,
});
export type OfficialSiteList = z.infer<typeof officialSiteListSchema>;

export const officialPermitQuerySchema = z.object({ include: csvEnumSchema(OFFICIAL_PERMIT_INCLUDES).optional() }).strict();
export type OfficialPermitQuery = z.infer<typeof officialPermitQuerySchema>;

export const officialPermitListQuerySchema = z
  .object({
    q: searchTextSchema.optional().describe("Matches permits whose number contains this text or closely resembles it. Letter case is ignored"),
    officialSiteIds: csvIdsSchema.optional().describe("Matches permits of these official sites. Comma-separated ids"),
    stationIds: csvIdsSchema
      .optional()
      .describe(
        "Matches the permits of the sites linked to these stations. A station in a country you cannot access matches nothing. Comma-separated ids",
      ),
    siteIds: csvSiteIdsSchema.optional().describe("Matches permits of sites whose `siteId` is one of these. Comma-separated"),
    operatorIds: csvIdsSchema
      .optional()
      .describe("Matches permits of sites of these operators. For a shared network, the sites of its members match too. Comma-separated ids"),
    isLinked: booleanQuerySchema
      .optional()
      .describe(
        "`true` matches permits whose site is linked to a station, `false` permits whose site is not. " +
          "`false` requires the `read_unassigned:official_permits` permission",
      ),
    rats: csvEnumSchema(OFFICIAL_RAT_FILTERS)
      .optional()
      .describe(
        "Matches permits for one of these technologies. `gsm` matches GSM on commercial bands and `gsmR` GSM on railway bands. " +
          `Comma-separated list. Possible values: \`${OFFICIAL_RAT_FILTERS.join("`, `")}\``,
      ),
    bandLabels: csvBandLabelsSchema
      .optional()
      .describe("Matches permits for one of these bands, given as the nominal frequency in MHz (`labelMhz`), for example `800,1800`"),
    statuses: csvEnumSchema(OFFICIAL_STATUS_FILTERS).optional().describe(`Matches permits with one of these statuses. ${STATUSES_FILTER_VALUES}`),
    kinds: csvEnumSchema(OFFICIAL_PERMIT_KINDS).optional().describe(KINDS_FILTER_NOTE),
    datasetKeys: csvSchema
      .pipe(z.array(z.string().min(1).max(DATASET_KEY_MAX_LENGTH)).min(1).max(100))
      .optional()
      .describe("Matches permits listed by a dataset with one of these keys. Comma-separated"),
    ...officialAreaFilterShape,
    include: csvEnumSchema(OFFICIAL_PERMIT_INCLUDES).optional(),
    sort: z.enum(OFFICIAL_PERMIT_SORTS).default("-id"),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    offset: offsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional(),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type OfficialPermitListQuery = z.infer<typeof officialPermitListQuerySchema>;

export const officialPermitListSchema = z.object({
  data: z.array(officialPermitSchema),
  paging: pagingSchema,
});
export type OfficialPermitList = z.infer<typeof officialPermitListSchema>;
