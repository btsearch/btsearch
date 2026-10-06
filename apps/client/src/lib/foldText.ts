const COMBINING_MARKS = /\p{Mn}/gu;

export function foldText(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().replaceAll("ł", "l");
}
