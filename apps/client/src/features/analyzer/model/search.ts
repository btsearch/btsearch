import {
  ANALYZER_RATS,
  ANALYZER_SORTS,
  ANALYZER_VIEWS,
  ANY_DIFFERENCE,
  type AnalyzerFilters,
  DEFAULT_ANALYZER_FILTERS,
  DIFFERENCE_KIND_ORDER,
  ROW_STATUSES,
} from "./filters";
import type { DifferenceFilter } from "./types";
import { FIRST_LIST_PAGE, LAST_LIST_PAGE, LIST_PAGE_SIZE_LIMIT, SMALLEST_LIST_PAGE_SIZE } from "@/features/stations/list/data/listPaging";
import {
  type ListUrlSearch,
  joinUrlValues,
  orderWords,
  parseUrlEnum,
  parseUrlIds,
  parseUrlNumber,
  sortUniqueNumbers,
} from "@/features/stations/list/data/listUrlValues";

export type AnalyzerSearch = {
  results?: string;
  diffs?: string;
  rats?: string;
  operators?: string;
  bands?: string;
  confirmation?: string;
  view?: "stations";
  sort?: "station" | "result";
  page?: number;
  size?: number;
};

const UNCONFIRMED_WORD = "unconfirmed";
const CONFIRMATION_WORDS = [UNCONFIRMED_WORD] as const;
const DIFFERENCE_FILTER_ORDER: readonly DifferenceFilter[] = [ANY_DIFFERENCE, ...DIFFERENCE_KIND_ORDER];
const BAND_WORD_PATTERN = /^[a-z0-9]{1,16}$/;
const MOST_BAND_WORDS = 20;
const WORD_SEPARATOR = ",";

function listBandWords(value: unknown): string[] {
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(listBandWords);
  if (typeof value !== "string") return [];
  return value.split(WORD_SEPARATOR).map((word) => word.trim().toLowerCase());
}

function parseBandKeys(value: unknown): string[] {
  const words = new Set(listBandWords(value).filter((word) => BAND_WORD_PATTERN.test(word)));
  return [...words].sort().slice(0, MOST_BAND_WORDS);
}

function readFilters(search: ListUrlSearch): AnalyzerFilters {
  const [view = DEFAULT_ANALYZER_FILTERS.view] = parseUrlEnum(search.view, ANALYZER_VIEWS);
  const [sort = DEFAULT_ANALYZER_FILTERS.sort] = parseUrlEnum(search.sort, ANALYZER_SORTS);

  return {
    statuses: parseUrlEnum(search.results, ROW_STATUSES),
    kinds: parseUrlEnum(search.diffs, DIFFERENCE_FILTER_ORDER),
    rats: parseUrlEnum(search.rats, ANALYZER_RATS),
    operatorIds: parseUrlIds(search.operators),
    bandKeys: parseBandKeys(search.bands),
    isUnconfirmedOnly: parseUrlEnum(search.confirmation, CONFIRMATION_WORDS).length > 0,
    view,
    sort,
    page: parseUrlNumber(search.page, FIRST_LIST_PAGE, LAST_LIST_PAGE) ?? FIRST_LIST_PAGE,
    pageSize: parseUrlNumber(search.size, SMALLEST_LIST_PAGE_SIZE, LIST_PAGE_SIZE_LIMIT) ?? null,
  };
}

export function readAnalyzerFilters(search: AnalyzerSearch): AnalyzerFilters {
  return readFilters(search);
}

export function toAnalyzerSearch(filters: AnalyzerFilters): AnalyzerSearch {
  return {
    results: joinUrlValues(orderWords(ROW_STATUSES, filters.statuses)),
    diffs: joinUrlValues(orderWords(DIFFERENCE_FILTER_ORDER, filters.kinds)),
    rats: joinUrlValues(orderWords(ANALYZER_RATS, filters.rats)),
    operators: joinUrlValues(sortUniqueNumbers(filters.operatorIds)),
    bands: joinUrlValues(parseBandKeys(filters.bandKeys)),
    confirmation: filters.isUnconfirmedOnly ? UNCONFIRMED_WORD : undefined,
    view: filters.view === "stations" ? "stations" : undefined,
    sort: filters.sort === "file" ? undefined : filters.sort,
    page: filters.page > FIRST_LIST_PAGE ? filters.page : undefined,
    size: filters.pageSize ?? undefined,
  };
}

export function parseAnalyzerSearch(search: Record<string, unknown>): AnalyzerSearch {
  return toAnalyzerSearch(readFilters(search));
}
