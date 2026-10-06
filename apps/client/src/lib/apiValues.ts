export const FIRST_RECORD_ID = 1;
export const LAST_RECORD_ID = 2_147_483_647;
export const MOST_LIST_VALUES = 100;
export const SEARCH_TEXT_MAX_LENGTH = 500;

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const NULL_CHARACTER = "\u0000";

export function isRecordId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= FIRST_RECORD_ID && value <= LAST_RECORD_ID;
}

export function isCountryCode(value: unknown): value is string {
  return typeof value === "string" && COUNTRY_CODE_PATTERN.test(value);
}

export function normalizeSearchText(searchText: string): string {
  return searchText.replaceAll(NULL_CHARACTER, "").trim().slice(0, SEARCH_TEXT_MAX_LENGTH).trim();
}
