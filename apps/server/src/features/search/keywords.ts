import { cells, extraIdentificators, gsmCells, locations, lteCells, nrCells, regions, stations, umtsCells } from "@openbts/drizzle";
import { MAX_ID, SEARCH_KEYWORDS, countryCodeSchema } from "@openbts/shared/contract";
import type { SearchKeyword, SearchKeywordValues } from "@openbts/shared/contract";
import { type SQL, type SQLWrapper, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { ErrorResponse } from "../../errors.js";
import { hasPlmn } from "../operators/sharing.js";
import { stationCountryCode, stationPlacementMatches } from "../stations/country.js";
import {
  FILTER_DEFINITIONS,
  type FilterTable,
  type FilterValue,
  createEmptyGroupedFilters,
  defaultFilterRefs,
  parseCoordinates,
  parseNumbers,
  splitList,
} from "./filters.js";
import { containsPattern, escapeLike, foldText } from "./text.js";

type KeywordCondition = { table: FilterTable; condition: SQL };

const RAT_TABLES = [
  { key: "gsmCells", table: gsmCells },
  { key: "umtsCells", table: umtsCells },
  { key: "lteCells", table: lteCells },
  { key: "nrCells", table: nrCells },
] as const;
const BOOLEAN_KEYWORDS: ReadonlySet<SearchKeyword> = new Set(["has_photo", "has_azimuth", "is_confirmed", "supports_iot", "supports_nr_redcap"]);
const DATE_KEYWORDS: ReadonlySet<SearchKeyword> = new Set(["created_after", "created_before", "updated_after", "updated_before"]);
const PATTERN_KEYWORDS: ReadonlySet<SearchKeyword> = new Set(["bts_id", "cell_notes", "networks_id", "networks_name", "mno_name"]);
const INTEGER_KEYWORDS: ReadonlySet<SearchKeyword> = new Set([
  "mnc",
  "band",
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
  "gnbid",
  "nr_clid",
  "nrtac",
  "nr_pci",
  "arfcn",
]);
const STATUS_ALIASES: Record<string, string> = { active: "published", awaitingcells: "pending" };
const EARLIEST_YEAR = 1900;
const LATEST_YEAR = 2200;
const GPS_RADIUS_METERS = 1000;
const GPS_BOX_DEGREES = 0.1;
const REGION_ISO_CODE_PATTERN = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

const booleanSchema = z.stringbool();
const countryCodesSchema = z.array(countryCodeSchema).min(1);
const plmnsSchema = z.array(z.string().regex(/^\d{5,6}$/)).min(1);
const regionCodesSchema = z.array(z.union([z.string().max(3), z.string().regex(REGION_ISO_CODE_PATTERN)])).min(1);
const termsSchema = z.array(z.string()).min(1);

function readableDate(value: string): string {
  const year = new Date(value).getUTCFullYear();
  if (!(year >= EARLIEST_YEAR && year <= LATEST_YEAR)) throw new Error("The date cannot be read");
  return value;
}

function numbersWithin(value: string, largest: number): string {
  if (parseNumbers(value).some((number) => Math.abs(number) > largest)) throw new Error("The number is out of range");
  return value;
}

function legacyCondition(keyword: string, value: FilterValue): KeywordCondition {
  const definition = FILTER_DEFINITIONS[keyword];
  if (!definition) throw new Error(`Search keyword "${keyword}" has no condition`);
  return { table: definition.table, condition: definition.buildCondition(value, defaultFilterRefs) };
}

function legacyValue(keyword: SearchKeyword, value: string): FilterValue {
  if (BOOLEAN_KEYWORDS.has(keyword)) return booleanSchema.parse(value);
  if (DATE_KEYWORDS.has(keyword)) return readableDate(value);
  if (PATTERN_KEYWORDS.has(keyword)) return escapeLike(value);
  if (INTEGER_KEYWORDS.has(keyword)) return numbersWithin(value, MAX_ID);
  if (keyword === "nci") return numbersWithin(value, Number.MAX_SAFE_INTEGER);
  if (keyword !== "status") return value;

  return splitList(value.toLowerCase())
    .map((status) => STATUS_ALIASES[status] ?? status)
    .join(",");
}

function placeCondition(column: typeof locations.city | typeof locations.address, value: string): KeywordCondition {
  const place = foldText(column);
  const matches = termsSchema
    .parse(splitList(value))
    .map((term) => sql`(${place} LIKE ${foldText(containsPattern(term))} OR ${foldText(term)} <% ${place})`);

  return { table: "locations", condition: sql`(${sql.join(matches, sql` OR `)})` };
}

function nearbyCondition(value: string): KeywordCondition {
  const [latitude, longitude] = parseCoordinates(value);
  const point = sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`;

  return {
    table: "locations",
    condition: sql`(
      ${locations.point} && ST_Expand(${point}, ${GPS_BOX_DEGREES})
      AND ST_DWithin(${locations.point}::geography, ${point}::geography, ${GPS_RADIUS_METERS})
    )`,
  };
}

function regionCondition(value: string): KeywordCondition {
  const codes = regionCodesSchema.parse(splitList(value.toUpperCase()));
  const isoCodes = codes.filter((code) => REGION_ISO_CODE_PATTERN.test(code));
  const localCodes = codes.filter((code) => !REGION_ISO_CODE_PATTERN.test(code));
  const matches: SQL[] = [];
  if (localCodes.length > 0) matches.push(inArray(sql`upper(${regions.code})`, localCodes));
  if (isoCodes.length > 0) matches.push(inArray(regions.isoCode, isoCodes));

  return { table: "locations", condition: sql`(${sql.join(matches, sql` OR `)})` };
}

function keywordCondition(keyword: SearchKeyword, value: string): KeywordCondition {
  switch (keyword) {
    case "country": {
      const countryCodes = countryCodesSchema.parse(splitList(value.toUpperCase()));
      return { table: "stations", condition: stationPlacementMatches(inArray(stationCountryCode, countryCodes)) };
    }
    case "plmn":
      return { table: "stations", condition: hasPlmn(stations.operator_id, plmnsSchema.parse(splitList(value))) };
    case "region":
      return regionCondition(value);
    case "city":
      return placeCondition(locations.city, value);
    case "address":
      return placeCondition(locations.address, value);
    case "gps":
      return nearbyCondition(value);
    default:
      return legacyCondition(keyword, legacyValue(keyword, value));
  }
}

function existsForStation(from: SQL, stationId: SQLWrapper, conditions: SQL[]): SQL {
  const matches = [sql`${stationId} = ${stations.id}`, ...conditions];
  return sql`EXISTS (SELECT 1 FROM ${from} WHERE ${sql.join(matches, sql` AND `)})`;
}

export function keywordConditions(keywords: SearchKeywordValues): { stations: SQL[]; locations: SQL[] } {
  const byTable = createEmptyGroupedFilters();

  for (const keyword of SEARCH_KEYWORDS) {
    const value = keywords[keyword];
    if (value === undefined) continue;

    try {
      const { table, condition } = keywordCondition(keyword, value);
      byTable[table].push(condition);
    } catch (error) {
      throw new ErrorResponse("INVALID_QUERY", { message: `Invalid value for the search keyword "${keyword}"`, cause: error });
    }
  }

  const stationConditions = [...byTable.stations];
  if (byTable.cells.length > 0) stationConditions.push(existsForStation(sql`${cells}`, cells.station_id, byTable.cells));
  if (byTable.extraIdentificators.length > 0) {
    stationConditions.push(existsForStation(sql`${extraIdentificators}`, extraIdentificators.station_id, byTable.extraIdentificators));
  }

  const ratMatches = RAT_TABLES.filter(({ key }) => byTable[key].length > 0).map(({ key, table }) =>
    existsForStation(sql`${table} INNER JOIN ${cells} ON ${table.cell_id} = ${cells.id}`, cells.station_id, byTable[key]),
  );
  if (ratMatches.length > 0) stationConditions.push(sql`(${sql.join(ratMatches, sql` OR `)})`);

  return { stations: stationConditions, locations: byTable.locations };
}
