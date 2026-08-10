import type { FilterKeyword } from "./types";

function getLastWord(input: string): string {
  const words = input.split(/\s/);
  return words[words.length - 1] || "";
}

export function getAutocompleteMatches(input: string, keywords: FilterKeyword[]): FilterKeyword[] {
  if (input === "") return keywords;

  const lastWord = getLastWord(input);
  if (lastWord.length === 0 || lastWord.includes(":")) return [];

  return keywords.filter((keyword) => keyword.key.toLowerCase().startsWith(lastWord.toLowerCase()));
}

export function replaceLastSearchToken(input: string, replacement: string): string {
  const words = input.split(/\s/);
  words[words.length - 1] = replacement;
  return words.join(" ");
}
