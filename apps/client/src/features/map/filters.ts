import { FILTER_KEYWORDS, FILTER_REGEX } from "./constants";
import type { ParsedFilter } from "./types";

const VALID_FILTER_KEYS = new Set(FILTER_KEYWORDS.map((keyword) => keyword.key.replace(":", "")));
const SPACE_RUN_PATTERN = /\s+/g;

function collapseSpaces(text: string): string {
  return text.replace(SPACE_RUN_PATTERN, " ").trim();
}

export function parseFilters(query: string): {
  filters: ParsedFilter[];
  remainingText: string;
} {
  const filters: ParsedFilter[] = [];
  let remainingText = "";
  let position = 0;

  for (const match of query.matchAll(FILTER_REGEX)) {
    const [token = "", lead = "", raw = "", name = "", singleQuoted, doubleQuoted, bare = ""] = match;
    const key = name.toLowerCase();
    if (!VALID_FILTER_KEYS.has(key)) continue;

    const value = (singleQuoted ?? doubleQuoted ?? bare).trim();
    if (value === "") continue;

    const tokenEnd = match.index + token.length;
    const endsWithComma = token.length > lead.length + raw.length;
    const isListStillTyped = endsWithComma && bare !== "" && query.slice(tokenEnd).trim() === "";
    if (isListStillTyped) continue;

    filters.push({ key, value, raw });
    remainingText += query.slice(position, match.index + lead.length);
    position = tokenEnd;
  }

  return { filters, remainingText: collapseSpaces(remainingText + query.slice(position)) };
}
