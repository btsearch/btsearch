import { FIRST_RECORD_ID, LAST_RECORD_ID, MOST_LIST_VALUES, SEARCH_TEXT_MAX_LENGTH, isCountryCode } from "@/lib/apiValues";
import { joinSearchValues, parseSearchQuery } from "@/lib/urlSearch";

export type ListUrlSearch = Readonly<Record<string, unknown>>;

const LIST_SEPARATOR = ",";
const DIGITS_PATTERN = /^\d+$/;

function listUrlWords(value: unknown): string[] {
  if (typeof value === "string") return value.split(LIST_SEPARATOR).map((word) => word.trim());
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(listUrlWords);
  return [];
}

function listUrlIntegers(value: unknown): number[] {
  return listUrlWords(value).flatMap((word) => (DIGITS_PATTERN.test(word) ? [Number(word)] : []));
}

export function sortUniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right).slice(0, MOST_LIST_VALUES);
}

export function sortUniqueCountryCodes(countryCodes: readonly string[]): string[] {
  return [...new Set(countryCodes)].sort().slice(0, MOST_LIST_VALUES);
}

export function orderWords<Word>(wordsInOrder: readonly Word[], chosen: readonly Word[]): Word[] {
  return wordsInOrder.filter((word) => chosen.includes(word));
}

export function parseUrlNumbers(value: unknown, smallest: number, largest: number): number[] {
  return sortUniqueNumbers(listUrlIntegers(value).filter((entry) => entry >= smallest && entry <= largest));
}

export function parseUrlIds(value: unknown): number[] {
  return parseUrlNumbers(value, FIRST_RECORD_ID, LAST_RECORD_ID);
}

export function parseUrlNumber(value: unknown, smallest: number, largest: number): number | undefined {
  const entries = Array.isArray(value) ? [] : listUrlIntegers(value);
  const [entry] = entries;
  if (entry === undefined || entries.length !== 1) return undefined;
  return entry >= smallest && entry <= largest ? entry : undefined;
}

export function parseUrlCountryCodes(value: unknown): string[] {
  return sortUniqueCountryCodes(
    listUrlWords(value)
      .map((word) => word.toUpperCase())
      .filter(isCountryCode),
  );
}

export function parseUrlEnum<Word extends string>(value: unknown, wordsInOrder: readonly Word[]): Word[] {
  const givenWords = new Set(listUrlWords(value).map((word) => word.toLowerCase()));
  return wordsInOrder.filter((word) => givenWords.has(word.toLowerCase()));
}

function isReadBackAsWritten(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);
    return (typeof parsed === "number" || typeof parsed === "boolean") && String(parsed) === text;
  } catch {
    return true;
  }
}

export function encodeUrlText(text: string): string | undefined {
  if (text === "") return undefined;
  return isReadBackAsWritten(text) ? text : JSON.stringify(text);
}

export function decodeUrlText(value: unknown): string {
  if (typeof value !== "string") return parseSearchQuery(value) ?? "";

  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}

export function toWrittenListSearch(search: ListUrlSearch): ListUrlSearch {
  const searchText = (parseSearchQuery(search.q) ?? "").slice(0, SEARCH_TEXT_MAX_LENGTH).trim();
  return { ...search, q: encodeUrlText(searchText) };
}

export function joinUrlValues(values: readonly (string | number)[]): string | undefined {
  return joinSearchValues(values.map(String));
}

export function getUrlSearchKey(search: ListUrlSearch): string {
  const entries = Object.entries(search).filter(([, value]) => value !== undefined);
  return JSON.stringify(entries.sort(([left], [right]) => left.localeCompare(right)));
}

export function hasSameMembers(left: readonly (string | number)[], right: readonly (string | number)[]): boolean {
  return left.length === right.length && left.every((entry) => right.includes(entry));
}
