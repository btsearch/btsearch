import { cells, extraIdentificators, gsmCells, locations, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import type { SearchMatch, SearchMatchField, SearchMatchType } from "@openbts/shared/contract";
import { type SQL, sql } from "drizzle-orm";

import { containsPattern, escapeLike, foldText } from "./text.js";

const TIERS_BEST_FIRST = [
  "siteIdExact",
  "identifierExact",
  "cellIdExact",
  "siteIdPrefix",
  "identifierContains",
  "cityExact",
  "placeContains",
  "cellIdContains",
  "siteIdSimilar",
  "placeSimilar",
] as const;
type Tier = (typeof TIERS_BEST_FIRST)[number];

const TIER_MATCH_TYPES: Record<Tier, SearchMatchType> = {
  siteIdExact: "exact",
  identifierExact: "exact",
  cellIdExact: "exact",
  siteIdPrefix: "prefix",
  identifierContains: "contains",
  cityExact: "exact",
  placeContains: "contains",
  cellIdContains: "contains",
  siteIdSimilar: "similar",
  placeSimilar: "similar",
};

const CELL_ID_COLUMNS = [
  { table: gsmCells, column: gsmCells.cid, isKnownBy: gsmCells.cid, field: "cid" },
  { table: umtsCells, column: umtsCells.cid, isKnownBy: umtsCells.cid, field: "cid" },
  { table: umtsCells, column: umtsCells.cid_long, isKnownBy: umtsCells.rnc, field: "longCid" },
  { table: lteCells, column: lteCells.enbid, isKnownBy: lteCells.enbid, field: "enbid" },
  { table: lteCells, column: lteCells.ecid, isKnownBy: lteCells.enbid, field: "eci" },
  { table: nrCells, column: nrCells.gnbid, isKnownBy: nrCells.gnbid, field: "gnbid" },
  { table: nrCells, column: nrCells.nci, isKnownBy: nrCells.gnbid, field: "nci" },
] as const;

const SHORTEST_PARTIAL_TEXT = 3;
const MOST_WORDS_MATCHED_ONE_BY_ONE = 8;

type FreeTextMatch = { rank: number; field: SearchMatchField; value: string };

function tierRank(tier: Tier): SQL {
  return sql.raw(String(TIERS_BEST_FIRST.indexOf(tier)));
}

function fieldName(field: SearchMatchField): SQL {
  return sql.raw(`'${field}'::text`);
}

function siteIdHits(text: string, matchesPartially: boolean): SQL {
  const siteId = stations.station_id;
  const exact = text.toUpperCase();
  const contains = containsPattern(text);

  return sql`
    SELECT ${stations.id} AS station_id,
      CASE
        WHEN ${siteId} = ${exact} THEN ${tierRank("siteIdExact")}
        WHEN ${siteId} ILIKE ${`${escapeLike(text)}%`} THEN ${tierRank("siteIdPrefix")}
        WHEN ${siteId} ILIKE ${contains} THEN ${tierRank("identifierContains")}
        ELSE ${tierRank("siteIdSimilar")}
      END AS match_rank,
      ${fieldName("siteId")} AS match_field,
      ${siteId}::text AS match_value,
      similarity(${siteId}, ${text}) AS match_score
    FROM ${stations}
    WHERE ${matchesPartially ? sql`${siteId} ILIKE ${contains} OR ${siteId} % ${text}` : sql`${siteId} = ${exact}`}`;
}

function identifierHits(text: string, matchesPartially: boolean): SQL[] {
  const exact = escapeLike(text);
  const identifiers = [
    { field: "networksId", value: sql`(${extraIdentificators.networks_id})::text` },
    { field: "networksName", value: sql`(${extraIdentificators.networks_name})::text` },
    { field: "operatorName", value: sql`(${extraIdentificators.mno_name})::text` },
  ] as const;

  return identifiers.map(
    ({ field, value }) => sql`
      SELECT ${extraIdentificators.station_id} AS station_id,
        CASE WHEN ${value} ILIKE ${exact} THEN ${tierRank("identifierExact")} ELSE ${tierRank("identifierContains")} END AS match_rank,
        ${fieldName(field)} AS match_field,
        ${value} AS match_value,
        0::real AS match_score
      FROM ${extraIdentificators}
      WHERE ${value} ILIKE ${matchesPartially ? containsPattern(text) : exact}`,
  );
}

function cellIdHits(digits: string, matchesPartially: boolean): SQL[] {
  const exact = digits.replace(/^0+(?=\d)/, "");

  return CELL_ID_COLUMNS.map(({ table, column, isKnownBy, field }) => {
    const value = sql`(${column})::text`;
    const matches = matchesPartially ? sql`(${value} LIKE ${`%${digits}%`} OR ${value} = ${exact})` : sql`${value} = ${exact}`;

    return sql`
      SELECT ${cells.station_id} AS station_id,
        CASE WHEN ${value} = ${exact} THEN ${tierRank("cellIdExact")} ELSE ${tierRank("cellIdContains")} END AS match_rank,
        ${fieldName(field)} AS match_field,
        ${value} AS match_value,
        0::real AS match_score
      FROM ${table}
      INNER JOIN ${cells} ON ${table.cell_id} = ${cells.id}
      WHERE ${isKnownBy} <> 0 AND ${matches}`;
  });
}

function everyWord(text: string, matches: (pattern: SQL) => SQL): SQL {
  const words = text.split(" ");
  if (words.length > MOST_WORDS_MATCHED_ONE_BY_ONE) return sql`false`;

  return sql`(${sql.join(
    words.map((word) => matches(foldText(containsPattern(word)))),
    sql` AND `,
  )})`;
}

function placeCandidates(text: string): SQL {
  const query = foldText(text);
  const city = foldText(locations.city);
  const address = foldText(locations.address);
  const everyWordInPlace = everyWord(text, (pattern) => sql`(${city} LIKE ${pattern} OR ${address} LIKE ${pattern})`);

  return sql`${everyWordInPlace} OR ${query} <% ${city} OR ${query} <% ${address}`;
}

function shortTextPlaces(text: string): SQL {
  const contains = containsPattern(text);
  return sql`${locations.city} ILIKE ${contains} OR ${locations.address} ILIKE ${contains}`;
}

function placeHits(text: string, matchesPartially: boolean): SQL {
  const query = foldText(text);
  const none = sql`false`;
  const everyWordInCity = matchesPartially ? everyWord(text, (pattern) => sql`place.city_folded LIKE ${pattern}`) : none;
  const everyWordInPlace = matchesPartially
    ? everyWord(text, (pattern) => sql`(place.city_folded LIKE ${pattern} OR place.address_folded LIKE ${pattern})`)
    : none;
  const citySimilarity = sql`COALESCE(word_similarity(${query}, place.city_folded), 0)`;
  const addressSimilarity = sql`COALESCE(word_similarity(${query}, place.address_folded), 0)`;
  const isCityMatch = sql`COALESCE(
    place.city_folded = ${query}
    OR ${everyWordInCity}
    OR (NOT COALESCE(${everyWordInPlace}, false) AND ${citySimilarity} >= ${addressSimilarity}),
    false
  )`;
  const candidates = matchesPartially ? placeCandidates(text) : sql`${foldText(locations.city)} = ${query}`;

  return sql`
    SELECT ${stations.id} AS station_id,
      CASE
        WHEN place.city_folded = ${query} THEN ${tierRank("cityExact")}
        WHEN ${everyWordInPlace} THEN ${tierRank("placeContains")}
        ELSE ${tierRank("placeSimilar")}
      END AS match_rank,
      CASE WHEN ${isCityMatch} THEN ${fieldName("city")} ELSE ${fieldName("address")} END AS match_field,
      COALESCE(CASE WHEN ${isCityMatch} THEN place.city ELSE place.address END, place.city, place.address, '')::text AS match_value,
      GREATEST(${citySimilarity}, ${addressSimilarity})::real AS match_score
    FROM (
      SELECT ${locations.id} AS id, ${locations.city} AS city, ${locations.address} AS address,
        ${foldText(locations.city)} AS city_folded, ${foldText(locations.address)} AS address_folded
      FROM ${locations}
      WHERE ${candidates}
      OFFSET 0
    ) AS place
    INNER JOIN ${stations} ON ${stations.location_id} = place.id`;
}

function isNumber(text: string): boolean {
  return /^\d+$/.test(text);
}

function searchHits(text: string): SQL[] {
  const matchesPartially = text.length >= SHORTEST_PARTIAL_TEXT;
  const hits = [siteIdHits(text, matchesPartially), ...identifierHits(text, matchesPartially)];

  if (isNumber(text)) return [...hits, ...cellIdHits(text, matchesPartially)];
  return [...hits, placeHits(text, matchesPartially)];
}

export function freeTextHits(text: string): SQL {
  return sql`(
    SELECT DISTINCT ON (hits.station_id) hits.station_id, hits.match_rank, hits.match_field, hits.match_value, hits.match_score
    FROM (${sql.join(searchHits(text), sql` UNION ALL `)}) AS hits
    ORDER BY hits.station_id, hits.match_rank, hits.match_score DESC
  ) AS best`;
}

export function matchesFreeText(text: string): SQL {
  const isShort = text.length < SHORTEST_PARTIAL_TEXT;
  const hits = isNumber(text) && !isShort ? [...searchHits(text), placeHits(text, true)] : searchHits(text);
  const isFound = sql`${stations.id} IN (SELECT hits.station_id FROM (${sql.join(hits, sql` UNION ALL `)}) AS hits)`;
  if (!isShort) return isFound;

  return sql`(${isFound} OR ${stations.station_id} ILIKE ${containsPattern(text)} OR ${shortTextPlaces(text)})`;
}

export function matchesPlace(text: string): SQL {
  const candidates = text.length < SHORTEST_PARTIAL_TEXT ? shortTextPlaces(text) : placeCandidates(text);
  return sql`${locations.id} IN (SELECT ${locations.id} FROM ${locations} WHERE ${candidates})`;
}

export function toSearchMatch({ rank, field, value }: FreeTextMatch): SearchMatch {
  const tier = TIERS_BEST_FIRST[rank];
  return { field, value, type: tier ? TIER_MATCH_TYPES[tier] : "similar" };
}
