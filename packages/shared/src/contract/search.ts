import { z } from "zod/v4";

import {
  CURSOR_OR_OFFSET_ISSUE,
  INCLUDE_TOTAL_NOTE,
  MAX_LATITUDE,
  MAX_LONGITUDE,
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

export const SEARCH_KEYWORDS = [
  "bts_id",
  "mnc",
  "plmn",
  "country",
  "status",
  "created_after",
  "created_before",
  "updated_after",
  "updated_before",
  "has_photo",
  "has_azimuth",
  "uplink",
  "band",
  "duplex",
  "rat",
  "is_confirmed",
  "cell_notes",
  "cell_type",
  "lac",
  "cid",
  "rnc",
  "umts_cid",
  "cid_long",
  "umts_lac",
  "uarfcn",
  "enbid",
  "ecid",
  "lte_clid",
  "tac",
  "lte_pci",
  "earfcn",
  "supports_iot",
  "gnbid",
  "nci",
  "nr_clid",
  "nrtac",
  "nr_pci",
  "arfcn",
  "supports_nr_redcap",
  "gps",
  "region",
  "city",
  "address",
  "networks_id",
  "networks_name",
  "mno_name",
] as const;
export type SearchKeyword = (typeof SEARCH_KEYWORDS)[number];
export type SearchKeywordValues = Partial<Record<SearchKeyword, string>>;

export const SINGLE_VALUE_SEARCH_KEYWORDS: readonly SearchKeyword[] = [
  "created_after",
  "created_before",
  "updated_after",
  "updated_before",
  "has_photo",
  "has_azimuth",
  "is_confirmed",
  "supports_iot",
  "supports_nr_redcap",
  "gps",
];

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
  value: z.string().describe("The value of that field"),
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
      .describe(
        "The field to sort by, with a leading `-` for descending order. " +
          "`relevance` returns the best matches first, or the newest stations if `q` contains only keywords",
      ),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    offset: offsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional().describe(INCLUDE_TOTAL_NOTE),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchListSchema = z.object({
  data: z.array(searchResultSchema),
  paging: pagingSchema,
});
export type SearchList = z.infer<typeof searchListSchema>;

export type UnknownSearchKeyword = { keyword: string; suggestion: SearchKeyword };

export type ParsedSearchQuery = {
  keywords: SearchKeywordValues;
  unknownKeywords: UnknownSearchKeyword[];
  text: string;
};

const KEYWORD_PATTERN =
  /(^|[\s,])([a-z][a-z0-9_]*):\s*(?:'([^']*)'|"([^"]*)"|([^\s,'"][^\s,]*(?:,\s*(?![a-z][a-z0-9_]*:)[^\s,'"][^\s,]*)*))(?:,(?=\s|$))?/gi;
const COORDINATES_PATTERN = /(^|[\s([])(?:geo:)?([+-]?\d{1,3}\.\d+)[,\s]+([+-]?\d{1,3}\.\d+)(?=[\s)\],.;]|$)/i;
const LIST_PUNCTUATION_PATTERN = /[,;]/g;
const STRAY_PUNCTUATION_PATTERN = /(^|\s)[.()[\]]+(?=\s|$)/g;
const MOST_TYPOS = 2;
const LETTERS_PER_TYPO = 3;

const knownKeywords: ReadonlySet<string> = new Set(SEARCH_KEYWORDS);
const singleValueKeywords: ReadonlySet<string> = new Set(SINGLE_VALUE_SEARCH_KEYWORDS);

function isSearchKeyword(value: string): value is SearchKeyword {
  return knownKeywords.has(value);
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function tidyText(value: string): string {
  return collapseSpaces(value.replace(LIST_PUNCTUATION_PATTERN, " ").replace(STRAY_PUNCTUATION_PATTERN, "$1"));
}

function countTypos(typed: string, keyword: string): number {
  let twoRowsUp: number[] = [];
  let rowAbove = Array.from({ length: keyword.length + 1 }, (_, index) => index);

  for (let row = 1; row <= typed.length; row++) {
    const current = [row];
    for (let column = 1; column <= keyword.length; column++) {
      const isSameLetter = typed[row - 1] === keyword[column - 1];
      const isSwappedPair = row > 1 && column > 1 && typed[row - 1] === keyword[column - 2] && typed[row - 2] === keyword[column - 1];
      const replaced = (rowAbove[column - 1] ?? 0) + (isSameLetter ? 0 : 1);
      const swapped = isSwappedPair ? (twoRowsUp[column - 2] ?? 0) + 1 : replaced;
      current.push(Math.min(replaced, swapped, (rowAbove[column] ?? 0) + 1, (current[column - 1] ?? 0) + 1));
    }
    twoRowsUp = rowAbove;
    rowAbove = current;
  }
  return rowAbove[keyword.length] ?? 0;
}

function closestKeyword(typed: string): SearchKeyword | null {
  let closest: SearchKeyword | null = null;
  let fewestTypos = Math.min(MOST_TYPOS, Math.floor(typed.length / LETTERS_PER_TYPO)) + 1;

  for (const keyword of SEARCH_KEYWORDS) {
    const typos = countTypos(typed, keyword);
    if (typos >= fewestTypos) continue;

    closest = keyword;
    fewestTypos = typos;
  }
  return closest;
}

export function parseSearchQuery(query: string): ParsedSearchQuery {
  const keywords: SearchKeywordValues = {};
  const unknownKeywords: UnknownSearchKeyword[] = [];
  let rest = "";
  let position = 0;

  for (const match of query.matchAll(KEYWORD_PATTERN)) {
    const [token = "", lead = "", name = "", singleQuoted, doubleQuoted, bare = ""] = match;
    const keyword = name.toLowerCase();

    if (isSearchKeyword(keyword)) {
      const value = singleQuoted ?? doubleQuoted ?? bare;
      const earlier = keywords[keyword];
      keywords[keyword] = earlier === undefined || singleValueKeywords.has(keyword) ? value : `${earlier},${value}`;
    } else {
      const suggestion = closestKeyword(keyword);
      if (suggestion === null) continue;
      unknownKeywords.push({ keyword, suggestion });
    }

    rest += query.slice(position, match.index + lead.length);
    position = match.index + token.length;
  }

  const text = collapseSpaces(rest + query.slice(position));
  const coordinates = keywords.gps === undefined ? COORDINATES_PATTERN.exec(text) : null;
  const [token = "", lead = "", latitude = "", longitude = ""] = coordinates ?? [];
  if (!coordinates || Math.abs(Number(latitude)) > MAX_LATITUDE || Math.abs(Number(longitude)) > MAX_LONGITUDE) {
    return { keywords, unknownKeywords, text: tidyText(text) };
  }

  const before = text.slice(0, coordinates.index + lead.length);
  const after = text.slice(coordinates.index + token.length);
  return { keywords: { ...keywords, gps: `${latitude},${longitude}` }, unknownKeywords, text: tidyText(`${before} ${after}`) };
}
