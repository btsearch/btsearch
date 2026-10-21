import { z } from "zod/v4";

import {
  CURSOR_OR_OFFSET_ISSUE,
  booleanQuerySchema,
  csvEnumSchema,
  cursorSchema,
  limitSchema,
  offsetSchema,
  pagingSchema,
  searchTextSchema,
  usesCursorOrOffset,
} from "./common.ts";
import { STATION_INCLUDES, areaFilterShape, listedStationFilterShape, queriedStationFilterShape, stationSchema } from "./stations.ts";

export const SEARCH_SORTS = ["relevance", "siteId", "-siteId", "createdAt", "-createdAt", "updatedAt", "-updatedAt"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export const SEARCH_MATCH_FIELDS = [
  "siteId",
  "networksId",
  "networksName",
  "operatorName",
  "cid",
  "longCid",
  "enbid",
  "eci",
  "gnbid",
  "nci",
  "city",
  "address",
] as const;
export type SearchMatchField = (typeof SEARCH_MATCH_FIELDS)[number];

export const SEARCH_MATCH_TYPES = ["exact", "prefix", "contains", "similar"] as const;
export type SearchMatchType = (typeof SEARCH_MATCH_TYPES)[number];

export const searchMatchSchema = z.object({
  field: z
    .enum(SEARCH_MATCH_FIELDS)
    .describe(
      "The field the free text was found in. `networksId`, `networksName` and `operatorName` are kinds of the station's `identifiers`, " +
        "`cid`, `longCid`, `enbid`, `eci`, `gnbid` and `nci` belong to one of its cells, and `city` and `address` to its location",
    ),
  value: z.string(),
  type: z
    .enum(SEARCH_MATCH_TYPES)
    .describe(
      "How the text matched: `exact` if it equals the value, `prefix` if a site id starts with it, `contains` if it is part of the value " +
        "(for a place, if every word of it is found in the city or the address), and `similar` if the value only resembles it, as with a typo",
    ),
});
export type SearchMatch = z.infer<typeof searchMatchSchema>;

export const searchResultSchema = stationSchema.extend({
  match: searchMatchSchema.nullable().describe("Where the free text in `q` matched best. `null` if `q` contains only keywords"),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchQuerySchema = z
  .object({
    q: searchTextSchema,
    ...queriedStationFilterShape,
    ...listedStationFilterShape,
    ...areaFilterShape,
    include: csvEnumSchema(STATION_INCLUDES).optional(),
    sort: z
      .enum(SEARCH_SORTS)
      .default("relevance")
      .describe("`relevance` returns the best matches first, or the newest stations if `q` contains only keywords"),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    offset: offsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional(),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchListSchema = z.object({
  data: z.array(searchResultSchema),
  paging: pagingSchema,
});
export type SearchList = z.infer<typeof searchListSchema>;
