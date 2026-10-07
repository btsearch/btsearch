import { isCountryCode } from "@/lib/apiValues";
import { joinSearchValues, parseSearchQuery, parseSearchValues } from "@/lib/urlSearch";

export type OperatorListSort = "default" | "name" | "-stations" | "stations";

type OperatorListSearch = {
  q?: string;
  countries?: string;
  sort?: Exclude<OperatorListSort, "default">;
};

export type OperatorListCriteria = {
  query: string;
  countryCodes: readonly string[];
  sort: OperatorListSort;
};

export const OPERATOR_SEARCH_MAX_LENGTH = 100;

const SORTS_IN_SEARCH = ["name", "-stations", "stations"] as const satisfies readonly OperatorListSort[];

function listCountryCodes(value: unknown): string[] {
  return parseSearchValues(value, (code) => (isCountryCode(code) ? code : null));
}

function parseSort(value: unknown): OperatorListSearch["sort"] {
  return SORTS_IN_SEARCH.find((sort) => sort === value);
}

export function parseOperatorListSearch(search: Record<string, unknown>): OperatorListSearch {
  return {
    q: parseSearchQuery(search.q),
    countries: joinSearchValues(listCountryCodes(search.countries)),
    sort: parseSort(search.sort),
  };
}

export function readOperatorListCriteria(search: OperatorListSearch): OperatorListCriteria {
  return {
    query: (search.q ?? "").slice(0, OPERATOR_SEARCH_MAX_LENGTH),
    countryCodes: listCountryCodes(search.countries),
    sort: search.sort ?? "default",
  };
}

export function toOperatorListSearch(criteria: OperatorListCriteria): OperatorListSearch {
  return {
    q: criteria.query === "" ? undefined : criteria.query,
    countries: joinSearchValues([...criteria.countryCodes].sort()),
    sort: criteria.sort === "default" ? undefined : criteria.sort,
  };
}
