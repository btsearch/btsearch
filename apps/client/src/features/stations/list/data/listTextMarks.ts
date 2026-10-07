import { foldText } from "@/lib/foldText";

type FoldedText = {
  folded: string;
  sourceIndexes: number[];
};

const SHORTEST_MARKED_TEXT = 2;
const WORD_SEPARATOR = " ";
const NO_MARK = "";

function foldWithSourceIndexes(text: string): FoldedText {
  const sourceIndexes: number[] = [];
  let folded = "";

  for (let index = 0; index < text.length; index++) {
    const foldedCharacter = foldText(text.charAt(index));
    for (let offset = 0; offset < foldedCharacter.length; offset++) sourceIndexes.push(index);
    folded += foldedCharacter;
  }
  return { folded, sourceIndexes };
}

function findEndOfCharacter(text: string, index: number): number {
  let end = index + 1;
  while (end < text.length && foldText(text.charAt(end)) === "") end++;
  return end;
}

export function listMarkedTexts(freeText: string): string[] {
  const words = freeText.split(WORD_SEPARATOR).sort((left, right) => right.length - left.length);
  return [freeText, ...words].filter((text) => text.length >= SHORTEST_MARKED_TEXT);
}

export function findTextMark(text: string | null | undefined, markedTexts: readonly string[]): string {
  if (text === null || text === undefined) return NO_MARK;

  const { folded, sourceIndexes } = foldWithSourceIndexes(text);
  for (const markedText of markedTexts) {
    const foldedMark = foldText(markedText);
    const foldedStart = foldedMark === "" ? -1 : folded.indexOf(foldedMark);
    const start = sourceIndexes[foldedStart];
    const last = sourceIndexes[foldedStart + foldedMark.length - 1];
    if (foldedStart === -1 || start === undefined || last === undefined) continue;

    return text.slice(start, findEndOfCharacter(text, last)).toLocaleLowerCase();
  }
  return NO_MARK;
}
