import { STATION_STATUSES, parseSearchQuery } from "@openbts/shared/contract";
import { type SQL, and } from "drizzle-orm";

import { ErrorResponse } from "../../errors.js";
import { type CountrySource, type StationFilterQuery, sectorFilterCondition, stationFilterConditions } from "../stations/read.js";
import { buildRatAndBandKeywordMatch } from "./filters.js";
import { matchesFreeText } from "./freeText.js";
import { keywordConditions } from "./keywords.js";

type QueriedStations = {
  text: string;
  stationConditions: SQL[];
  locationConditions: SQL[];
  sectorCondition: SQL | undefined;
  narrowsStations: boolean;
};

const NARROWING_FILTERS = ["operatorIds", "bandIds", "rats", "supportsIot", "backhaulMediums", "createdAfter", "updatedAfter", "listId"] as const;

export function queriedStations(
  query: StationFilterQuery & { q?: string },
  stationIds: readonly number[] | null,
  countryFrom?: CountrySource,
): QueriedStations {
  const hasNarrowingFilter = NARROWING_FILTERS.some((name) => query[name] !== undefined);
  if (query.q === undefined) {
    return {
      text: "",
      stationConditions: stationFilterConditions(query, stationIds, countryFrom),
      locationConditions: [],
      sectorCondition: sectorFilterCondition(query, undefined),
      narrowsStations: hasNarrowingFilter,
    };
  }

  const { keywords, unknownKeywords, text } = parseSearchQuery(query.q);
  const [unknown] = unknownKeywords;
  if (unknown) {
    throw new ErrorResponse("INVALID_QUERY", { message: `Unknown search keyword "${unknown.keyword}". Did you mean "${unknown.suggestion}"?` });
  }

  const statuses = query.statuses ?? (keywords.status === undefined ? undefined : [...STATION_STATUSES]);
  const conditions = keywordConditions(keywords);

  return {
    text,
    stationConditions: [...stationFilterConditions({ ...query, statuses }, stationIds, countryFrom), ...conditions.stations],
    locationConditions: conditions.locations,
    sectorCondition: sectorFilterCondition(query, buildRatAndBandKeywordMatch(keywords.rat, keywords.band)),
    narrowsStations: hasNarrowingFilter || conditions.stations.length > 0,
  };
}

export function matchingStations({ text, stationConditions }: QueriedStations): SQL | undefined {
  return and(...stationConditions, text === "" ? undefined : matchesFreeText(text));
}
