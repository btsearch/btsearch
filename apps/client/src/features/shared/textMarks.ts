import { findFoldedMatch } from "@/lib/foldText";

const SHORTEST_MARKED_TEXT = 2;
const WORD_SEPARATOR = " ";
const NO_MARK = "";

export function listMarkedTexts(freeText: string): string[] {
  const words = freeText.split(WORD_SEPARATOR).sort((left, right) => right.length - left.length);
  return [freeText, ...words].filter((text) => text.length >= SHORTEST_MARKED_TEXT);
}

export function findTextMark(text: string | null | undefined, markedTexts: readonly string[]): string {
  if (text === null || text === undefined) return NO_MARK;

  for (const markedText of markedTexts) {
    const match = findFoldedMatch(text, markedText);
    if (match !== null) return text.slice(match.start, match.end);
  }
  return NO_MARK;
}
