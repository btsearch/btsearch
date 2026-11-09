const COMBINING_MARKS = /\p{Mn}/gu;

type FoldedMatch = {
  start: number;
  end: number;
};

type FoldedText = {
  folded: string;
  sourceIndexes: number[];
};

export function foldText(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().replaceAll("ł", "l");
}

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

export function findFoldedMatch(text: string, query: string): FoldedMatch | null {
  const foldedQuery = foldText(query);
  if (foldedQuery === "") return null;

  const { folded, sourceIndexes } = foldWithSourceIndexes(text);
  const foldedStart = folded.indexOf(foldedQuery);
  if (foldedStart === -1) return null;

  const last = sourceIndexes[foldedStart + foldedQuery.length - 1];
  return { start: sourceIndexes[foldedStart], end: findEndOfCharacter(text, last) };
}
