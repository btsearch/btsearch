import { z } from "zod/v4";

import { hasGenericAddressMarker } from "../addressValidation.ts";
import { csvBandIdsSchema } from "./bands.ts";
import { CELL_RATS, cellSchema } from "./cells.ts";
import {
  AT_LEAST_ONE_FIELD_ISSUE,
  CURSOR_OR_OFFSET_ISSUE,
  INCLUDE_NOTE,
  INCLUDE_TOTAL_NOTE,
  LIMIT_NOTE,
  bboxSchema,
  booleanQuerySchema,
  countryCodeSchema,
  csvCountryCodesSchema,
  csvEnumSchema,
  csvIdsSchema,
  cursorSchema,
  hasAnyField,
  idParamSchema,
  idSchema,
  instantSchema,
  limitSchema,
  offsetSchema,
  pagingSchema,
  searchTextSchema,
  usesCursorOrOffset,
} from "./common.ts";
import { operatorSchema } from "./operators.ts";
import { regionSchema } from "./regions.ts";
import {
  STRUCTURE_INPUT_NOTE,
  STRUCTURE_TYPE_FILTER_VALUES,
  UNKNOWN_STRUCTURE_TYPE,
  csvStructureTypesSchema,
  structureInputSchema,
  structureSchema,
} from "./structures.ts";

export { type Bbox, bboxSchema } from "./common.ts";

export const STATION_STATUSES = ["active", "awaitingCells", "inactive"] as const;
export type StationStatus = (typeof STATION_STATUSES)[number];

export const DEFAULT_STATION_STATUSES: readonly StationStatus[] = ["active", "awaitingCells"];

export const BACKHAUL_MEDIUMS = ["fiber", "microwave", "satellite"] as const;
export type BackhaulMedium = (typeof BACKHAUL_MEDIUMS)[number];

export const STATION_INCLUDES = ["operator", "location", "location.region", "cells", "cells.band", "sectors", "backhaul"] as const;
export type StationInclude = (typeof STATION_INCLUDES)[number];

export const STATION_SORTS = ["-id", "id", "siteId", "-siteId", "createdAt", "-createdAt", "updatedAt", "-updatedAt"] as const;
export type StationSort = (typeof STATION_SORTS)[number];

export const LOCATION_SORTS = ["-id", "id", "createdAt", "-createdAt", "updatedAt", "-updatedAt"] as const;
export type LocationSort = (typeof LOCATION_SORTS)[number];

export const LOCATION_INCLUDES = [
  "region",
  "stations",
  "stations.operator",
  "stations.cells",
  "stations.cells.band",
  "stations.sectors",
  "stations.backhaul",
] as const;
export type LocationInclude = (typeof LOCATION_INCLUDES)[number];

export const SECTOR_AZIMUTH_NOTE = "The antenna direction in degrees, 0 to 359. `null` for an omnidirectional sector";

export const sectorSchema = z.object({
  id: z.number().int(),
  azimuth: z.number().int().nullable().describe(SECTOR_AZIMUTH_NOTE),
});
export type Sector = z.infer<typeof sectorSchema>;

export const backhaulSchema = z.object({
  medium: z.enum(BACKHAUL_MEDIUMS).describe("How the station is connected to the operator's network"),
  speedMbps: z.number().int().nullable(),
  model: z.string().nullable().describe("The model of the microwave link. `null` if unknown, and always `null` for other mediums"),
  updatedAt: z.iso.datetime(),
});
export type Backhaul = z.infer<typeof backhaulSchema>;

export const STATION_IDENTIFIER_KIND_NOTE =
  "The kind of identifier. `networksId` and `networksName` are the station's id and name in a shared network, " +
  "and `operatorName` is the operator's own name for the station";

export const stationIdentifierSchema = z.object({
  kind: z.string().describe(STATION_IDENTIFIER_KIND_NOTE),
  value: z.string(),
});
export type StationIdentifier = z.infer<typeof stationIdentifierSchema>;

const locationShape = {
  id: z.number().int(),
  countryCode: countryCodeSchema,
  regionId: z.number().int(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  structure: structureSchema.describe("The structure the antennas are mounted on and who owns it. Each field is `null` if unknown"),
  latitude: z.number(),
  longitude: z.number(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  region: regionSchema.optional().describe(INCLUDE_NOTE),
};

export const stationLocationSchema = z.object(locationShape);
export type StationLocation = z.infer<typeof stationLocationSchema>;

export const STATION_SITE_ID_NOTE = "The id the operator uses for the station, unique among the operator's stations";
const HOST_STATION_NOTE =
  "The station that hosts this one in a shared network: another member's station at the same location, " +
  "which holds the official permits while this station has none. `null` if there is none";
const STATION_STATUS_NOTE =
  "`awaitingCells`: the station has no cells yet. " +
  "`inactive`: the station was deactivated, and it is deleted permanently after six months without changes";

const stationOwnShape = {
  id: z.number().int(),
  siteId: z.string().describe(STATION_SITE_ID_NOTE),
  operatorId: z.number().int().nullable(),
  locationId: z.number().int().nullable().describe("`null` for a station without a location"),
  hostStationId: z.number().int().nullable().describe(HOST_STATION_NOTE),
  status: z.enum(STATION_STATUSES).describe(STATION_STATUS_NOTE),
  isConfirmed: z.boolean().describe("Whether the station is marked as confirmed. Only editors can change it"),
  notes: z.string().nullable(),
  identifiers: z.array(stationIdentifierSchema).describe("Other ids and names of the station. Only the kinds that are set are listed"),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  statusChangedAt: z.iso.datetime(),
};

export const stationBaseSchema = z.object(stationOwnShape);
export type StationBase = z.infer<typeof stationBaseSchema>;

export const stationSchema = z.object({
  ...stationOwnShape,
  operator: operatorSchema.nullable().optional().describe(INCLUDE_NOTE),
  location: stationLocationSchema.nullable().optional().describe(INCLUDE_NOTE),
  cells: z.array(cellSchema).optional().describe(INCLUDE_NOTE),
  sectors: z.array(sectorSchema).optional().describe(INCLUDE_NOTE),
  backhaul: backhaulSchema.nullable().optional().describe(INCLUDE_NOTE),
});
export type Station = z.infer<typeof stationSchema>;

export const locationStationSchema = stationSchema.omit({ location: true });
export type LocationStation = z.infer<typeof locationStationSchema>;

const LOCATION_STATIONS_NOTE =
  "Only returned with `include=stations` or any `stations.*` value. " +
  "When the request filters by technology or band (`rats`, `bandIds`, `supportsIot=true`, " +
  "or `rat:` and `band:` in `q`), each station's `sectors` contain only the sectors that have a matching cell and the sectors that have no cells";

export const locationSchema = z.object({
  ...locationShape,
  stations: z.array(locationStationSchema).optional().describe(LOCATION_STATIONS_NOTE),
});
export type Location = z.infer<typeof locationSchema>;

export const stationParamsSchema = z.object({ id: idParamSchema });
export const locationParamsSchema = z.object({ id: idParamSchema });

const locationWriteShape = {
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  regionId: idSchema.optional().describe("If omitted, the region is derived from the coordinates"),
  city: z.string().trim().max(100).nullable().optional(),
  address: z.string().trim().nullable().optional(),
  structure: structureInputSchema.optional().describe(STRUCTURE_INPUT_NOTE),
};
const GENERIC_ADDRESS_ISSUE = { path: ["address"], message: "Address must not contain variants of własny" };

export const locationCreateSchema = z
  .object(locationWriteShape)
  .strict()
  .refine((location) => !hasGenericAddressMarker(location.address), GENERIC_ADDRESS_ISSUE);
export type LocationCreate = z.infer<typeof locationCreateSchema>;

export const locationUpdateSchema = z
  .object(locationWriteShape)
  .partial()
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE)
  .refine((patch) => (patch.latitude === undefined) === (patch.longitude === undefined), {
    path: ["longitude"],
    message: "latitude and longitude must be sent together",
  })
  .refine((patch) => !hasGenericAddressMarker(patch.address), GENERIC_ADDRESS_ISSUE);
export type LocationUpdate = z.infer<typeof locationUpdateSchema>;

const STATUSES_DEFAULT_NOTE = "Matches stations with one of these statuses. If omitted, `active` and `awaitingCells` stations are matched";
const STATUSES_VALUES_NOTE = `Comma-separated list. Possible values: \`${STATION_STATUSES.join("`, `")}\``;
const STATUSES_FILTER_NOTE = `${STATUSES_DEFAULT_NOTE}. ${STATUSES_VALUES_NOTE}`;
const QUERIED_STATUSES_FILTER_NOTE =
  `${STATUSES_DEFAULT_NOTE}, or stations of any status when \`q\` contains a \`status:\` keyword. ` + STATUSES_VALUES_NOTE;
const OPERATORS_FILTER_NOTE = "Matches stations of these operators. For a shared network, the stations of its members match too. Comma-separated ids";
const RATS_FILTER_NOTE =
  "Matches stations that have a cell of one of these technologies. With `bandIds`, a single cell must match both. " +
  `Comma-separated list. Possible values: \`${CELL_RATS.join("`, `")}\``;
const SUPPORTS_IOT_FILTER_NOTE =
  "`true` matches stations with an LTE cell that supports IoT or an NR cell that supports RedCap. `false` matches stations with neither";
const LIST_FILTER_NOTE =
  "Matches only the stations on this list. The list must be public or your own, unless you have the `read_all:user_lists` permission";

export const stationFilterShape = {
  statuses: csvEnumSchema(STATION_STATUSES).optional().describe(STATUSES_FILTER_NOTE),
  operatorIds: csvIdsSchema.optional().describe(OPERATORS_FILTER_NOTE),
  bandIds: csvBandIdsSchema.optional(),
  rats: csvEnumSchema(CELL_RATS).optional().describe(RATS_FILTER_NOTE),
  supportsIot: booleanQuerySchema.optional().describe(SUPPORTS_IOT_FILTER_NOTE),
  backhaulMediums: csvEnumSchema(BACKHAUL_MEDIUMS).optional(),
  createdAfter: instantSchema.optional().describe("Matches stations created at or after this time"),
  updatedAfter: instantSchema.optional().describe("Matches stations last changed at or after this time"),
  listId: z.string().min(1).max(64).optional().describe(LIST_FILTER_NOTE),
};

export const queriedStationFilterShape = {
  ...stationFilterShape,
  statuses: stationFilterShape.statuses.describe(QUERIED_STATUSES_FILTER_NOTE),
};

export const areaFilterShape = {
  bbox: bboxSchema.optional(),
  countryCodes: csvCountryCodesSchema.optional(),
  regionIds: csvIdsSchema.optional(),
};

export const KEEP_OTHER_COUNTRIES_LEAD =
  "If `true`, `operatorIds` only filters the countries its operators belong to. For a shared network, the countries of its members count too";
const KEEP_OTHER_COUNTRIES_NOTE =
  `${KEEP_OTHER_COUNTRIES_LEAD}. Stations at locations in any other country match whatever their operator is. ` +
  "Has no effect without `operatorIds`";
const LISTED_KEEP_OTHER_COUNTRIES_NOTE =
  `${KEEP_OTHER_COUNTRIES_LEAD}. Stations in any other country match whatever their operator is, ` +
  "and a station without a location counts as being in its operator's country. Has no effect without `operatorIds`";
const HAS_PHOTOS_FILTER_NOTE = "`true` matches stations that show at least one photo, `false` matches stations that show none";
const HAS_SECTORS_FILTER_NOTE =
  "`true` matches stations with at least one sector, `false` matches stations with none. An omnidirectional sector counts too";
const IS_CONFIRMED_FILTER_NOTE =
  "`true` matches stations that are marked as confirmed, `false` matches stations that are not. " +
  "It checks the station's own `isConfirmed`, not that of its cells";
const STATION_STRUCTURE_TYPES_NOTE =
  "Matches stations at a location with one of these structure types. " +
  `Use \`${UNKNOWN_STRUCTURE_TYPE}\` to match locations whose structure type is not known. A station without a location never matches. ` +
  `Comma-separated list. Possible values: \`${STRUCTURE_TYPE_FILTER_VALUES.join("`, `")}\``;
const EDITABLE_ONLY_REACH_NOTE =
  "If your grants cover all of one country and only some regions of another, a single request returns exactly those, " +
  "which `countryCodes` and `regionIds` cannot express together";
const EDITABLE_STATIONS_NOTE =
  "If `true`, only the stations you can edit are returned. " +
  "Administrators get every station, and editors only get stations in a country or region their grant covers. " +
  "A station without a location counts for editors whose grant covers the operator's whole country. " +
  `${EDITABLE_ONLY_REACH_NOTE}. Requires the \`update:stations\` permission`;

export const listedStationFilterShape = {
  keepOtherCountries: booleanQuerySchema.optional().describe(LISTED_KEEP_OTHER_COUNTRIES_NOTE),
  hasPhotos: booleanQuerySchema.optional().describe(HAS_PHOTOS_FILTER_NOTE),
  hasSectors: booleanQuerySchema.optional().describe(HAS_SECTORS_FILTER_NOTE),
  isConfirmed: booleanQuerySchema.optional().describe(IS_CONFIRMED_FILTER_NOTE),
  structureTypes: csvStructureTypesSchema.optional().describe(STATION_STRUCTURE_TYPES_NOTE),
  editableOnly: booleanQuerySchema.optional().describe(EDITABLE_STATIONS_NOTE),
};

export const stationQuerySchema = z.object({ include: csvEnumSchema(STATION_INCLUDES).optional() }).strict();
export type StationQuery = z.infer<typeof stationQuerySchema>;

const SORT_NOTE = "The field to sort by, with a leading `-` for descending order. A `cursor` only works with the `sort` it was returned for";

export const stationListQuerySchema = z
  .object({
    ...stationFilterShape,
    ...listedStationFilterShape,
    ...areaFilterShape,
    include: csvEnumSchema(STATION_INCLUDES).optional(),
    sort: z.enum(STATION_SORTS).default("-id").describe(SORT_NOTE),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    offset: offsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional().describe(INCLUDE_TOTAL_NOTE),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type StationListQuery = z.infer<typeof stationListQuerySchema>;

export const stationListSchema = z.object({
  data: z.array(stationSchema),
  paging: pagingSchema,
});
export type StationList = z.infer<typeof stationListSchema>;

export const locationQuerySchema = z
  .object({
    q: searchTextSchema.optional(),
    ...queriedStationFilterShape,
    keepOtherCountries: booleanQuerySchema.optional().describe(KEEP_OTHER_COUNTRIES_NOTE),
    include: csvEnumSchema(LOCATION_INCLUDES).optional(),
  })
  .strict();
export type LocationQuery = z.infer<typeof locationQuerySchema>;

const INCLUDE_EMPTY_NOTE =
  "If `true`, locations without a matching station are returned too. Requires the `update:locations` permission. " +
  "Has no effect together with a station filter other than `statuses`, or with a station or cell keyword in `q`";
const HAS_STATIONS_NOTE =
  "`true` matches locations that have at least one station, `false` matches locations that have none. " +
  "A station of any status counts, whichever station filters you send. " +
  "`false` requires the `update:locations` permission, does not need `includeEmpty`, " +
  "and returns nothing together with a station filter other than `statuses` or a station or cell keyword in `q`";
const EDITABLE_LOCATIONS_NOTE =
  "If `true`, only the locations you can edit are returned. " +
  "Administrators get every location, and editors only get locations in a country or region their grant covers. " +
  `${EDITABLE_ONLY_REACH_NOTE}. Requires the \`update:locations\` permission`;

export const locationListQuerySchema = z
  .object({
    q: searchTextSchema.optional(),
    ...queriedStationFilterShape,
    keepOtherCountries: booleanQuerySchema.optional().describe(KEEP_OTHER_COUNTRIES_NOTE),
    ...areaFilterShape,
    structureTypes: csvStructureTypesSchema.optional(),
    structureOwnerIds: csvIdsSchema.optional(),
    editableOnly: booleanQuerySchema.optional().describe(EDITABLE_LOCATIONS_NOTE),
    include: csvEnumSchema(LOCATION_INCLUDES).optional(),
    sort: z.enum(LOCATION_SORTS).default("-id").describe(SORT_NOTE),
    includeEmpty: booleanQuerySchema.optional().describe(INCLUDE_EMPTY_NOTE),
    hasStations: booleanQuerySchema.optional().describe(HAS_STATIONS_NOTE),
    limit: z.coerce.number<number>().int().min(1).max(1000).default(50).describe(LIMIT_NOTE),
    cursor: cursorSchema.optional(),
    offset: offsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional().describe(INCLUDE_TOTAL_NOTE),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type LocationListQuery = z.infer<typeof locationListQuerySchema>;

export const locationListSchema = z.object({
  data: z.array(locationSchema),
  paging: pagingSchema,
});
export type LocationList = z.infer<typeof locationListSchema>;
