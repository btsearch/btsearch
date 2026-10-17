const POLISH_LETTERS = "A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż";
const OWN_WORD_PATTERN = new RegExp(`(^|[^${POLISH_LETTERS}])własn(?:ego|emu|ymi|ych|ym|ej|ą|a|e|y)(?=$|[^${POLISH_LETTERS}])`, "iu");
const OWN_WORD_REFUSAL = "Address must not contain variants of własny";

export function validateAddress(address: string): string | null {
  return OWN_WORD_PATTERN.test(address) ? OWN_WORD_REFUSAL : null;
}
