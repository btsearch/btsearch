import { SINGLE_VALUE_SEARCH_KEYWORDS, parseSearchQuery } from "@openbts/shared/contract/searchQuery";

import { parseFilters } from "./filters";
import type { FilterKeyword, ParsedFilter } from "./types";

export type SearchContext =
  | { kind: "empty" }
  | { kind: "word"; word: string }
  | { kind: "value"; keyword: FilterKeyword; tokenStart: number; committed: string[]; typed: string }
  | { kind: "text" };

export type QueryProblem = { kind: "unknownKeyword"; typed: string; suggestion: string } | { kind: "invalidValue"; key: string; value: string };

const VALUE_TOKEN_PATTERN = /(^|\s)([a-z][a-z0-9_]*):\s*((?:[^\s,'"]+,\s*)*)([^\s,'"]*)$/i;
const NEEDS_QUOTES_PATTERN = /[\s'"]/;
const DOUBLE_QUOTE_PATTERN = /"/g;
const DIACRITICS_PATTERN = /\p{Diacritic}/gu;
const REGEX_SPECIALS_PATTERN = /[.*+?^${}()|[\]\\]/g;
const SINGLE_VALUE_KEYS: ReadonlySet<string> = new Set(SINGLE_VALUE_SEARCH_KEYWORDS.map((keyword) => `${keyword}:`));
const BOOLEAN_VALUES: ReadonlySet<string> = new Set(["true", "false", "1", "0", "yes", "no", "on", "off", "y", "n", "enabled", "disabled"]);

function getLastWord(input: string): string {
  const words = input.split(/\s/);
  return words[words.length - 1] || "";
}

export function foldSearchText(text: string): string {
  return text.normalize("NFD").replace(DIACRITICS_PATTERN, "").toLocaleLowerCase();
}

export function findFilterKeyword(key: string, keywords: readonly FilterKeyword[]): FilterKeyword | undefined {
  const wanted = `${key.toLowerCase()}:`;
  return keywords.find((keyword) => keyword.key === wanted);
}

export function isSingleValueKeyword(keyword: FilterKeyword): boolean {
  return SINGLE_VALUE_KEYS.has(keyword.key);
}

export function splitFilterValues(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

export function buildFilter(keyword: FilterKeyword, values: readonly string[]): ParsedFilter {
  const key = keyword.key.slice(0, -1);
  const value = values.join(",");
  const raw = NEEDS_QUOTES_PATTERN.test(value) ? `${key}:"${value.replace(DOUBLE_QUOTE_PATTERN, "")}"` : `${key}:${value}`;
  return { key, value, raw };
}

export function getSearchContext(input: string, keywords: readonly FilterKeyword[]): SearchContext {
  if (input.trim() === "") return { kind: "empty" };

  const valueToken = VALUE_TOKEN_PATTERN.exec(input);
  if (valueToken) {
    const [, lead = "", name = "", committedPart = "", typed = ""] = valueToken;
    const keyword = findFilterKeyword(name, keywords);
    if (keyword) return { kind: "value", keyword, tokenStart: valueToken.index + lead.length, committed: splitFilterValues(committedPart), typed };
  }

  const lastWord = getLastWord(input);
  if (lastWord === "" || lastWord.includes(":")) return { kind: "text" };
  return { kind: "word", word: lastWord };
}

export function matchFilterKeywords(word: string, keywords: readonly FilterKeyword[], describe: (keyword: FilterKeyword) => string): FilterKeyword[] {
  const wanted = foldSearchText(word);
  if (wanted === "") return [...keywords];

  const byKeyPrefix: FilterKeyword[] = [];
  const byKeyPart: FilterKeyword[] = [];
  const byDescription: FilterKeyword[] = [];
  for (const keyword of keywords) {
    if (keyword.key.startsWith(wanted)) byKeyPrefix.push(keyword);
    else if (keyword.key.includes(wanted)) byKeyPart.push(keyword);
    else if (foldSearchText(describe(keyword)).includes(wanted)) byDescription.push(keyword);
  }
  return [...byKeyPrefix, ...byKeyPart, ...byDescription];
}

export function replaceLastSearchToken(input: string, replacement: string): string {
  const words = input.split(/\s/);
  words[words.length - 1] = replacement;
  return words.join(" ");
}

export function isKnownFilterValue(keyword: FilterKeyword, value: string): boolean {
  const folded = value.toLowerCase();
  if (keyword.valueKind === "boolean") return BOOLEAN_VALUES.has(folded);
  if (keyword.valueKind !== "choice" || keyword.choices === undefined) return true;
  return keyword.choices.some((choice) => choice.value.toLowerCase() === folded || choice.aliases?.includes(folded));
}

export function findInvalidFilterValue(filter: ParsedFilter, keywords: readonly FilterKeyword[]): string | null {
  const keyword = findFilterKeyword(filter.key, keywords);
  if (keyword === undefined) return null;
  return splitFilterValues(filter.value).find((value) => !isKnownFilterValue(keyword, value)) ?? null;
}

export function findQueryProblem(query: string, keywords: readonly FilterKeyword[]): QueryProblem | null {
  const unknownKeyword = parseSearchQuery(query).unknownKeywords.find(({ suggestion }) => findFilterKeyword(suggestion, keywords) !== undefined);
  if (unknownKeyword) return { kind: "unknownKeyword", typed: unknownKeyword.keyword, suggestion: unknownKeyword.suggestion };

  for (const filter of parseFilters(query).filters) {
    const value = findInvalidFilterValue(filter, keywords);
    if (value !== null) return { kind: "invalidValue", key: filter.key, value };
  }
  return null;
}

export function replaceSearchKeyword(query: string, typed: string, suggestion: string): string {
  const pattern = new RegExp(`(^|[\\s,])${typed.replace(REGEX_SPECIALS_PATTERN, "\\$&")}:`, "i");
  return query.replace(pattern, `$1${suggestion}:`);
}
