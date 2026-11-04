import type { StructureType } from "./contract/structures.ts";

export const STRUCTURE_NOTE_LANGUAGES = ["pl", "en"] as const;
export type StructureNoteLanguage = (typeof STRUCTURE_NOTE_LANGUAGES)[number];

type TypeRule = readonly [pattern: RegExp, type: StructureType];

const COMBINING_MARKS = /\p{Mn}/gu;
const WHITESPACE = /\s+/g;
const FORMER_REMARK = /\((dawn|byl|d\. |formerly|previously)[^()]*\)/g;
const FORMER_PHRASE = /\b(dawn\w*|byl(a|e|y|ego|ej|ych|ym|ymi)?|former)\b[^,;()/-]*?(?=\s(na|przy|obok|kolo|on|at|near)\s|[,;()/-]|$)/g;

const TYPE_RULES: Record<StructureNoteLanguage, readonly TypeRule[]> = {
  pl: [
    [/\bwiez[ay] cisnien|\bzbiornik\w* wiezow/, "waterTower"],
    [/\boswietleniow/, "floodlightTower"],
    [/\bmaszt[^,;()]*\b(na|z) (dach|budyn|blok|kamienic|biurowc|hal|zabudow)|\bdach\w* .*\bmaszt/, "rooftopMast"],
    [/\bwiez\w*[^,;()]*\bna dach/, "rooftop"],
    [/\bprzestawn/, "relocatableMast"],
    [/\bmobiln/, "mobileMast"],
    [/\bkomin(?!iar)/, "chimney"],
    [/\bstrunobet/, "concreteTower"],
    [/\bmaszt/, "mast"],
    [/\bkratow/, "latticeTower"],
    [/\brurow/, "tubularTower"],
    [/\bwiez\w* (\w+ )?(zelbet|betonow)/, "concreteTower"],
    [/\bkosciol|\bkoscieln|\bkaplic|\bklasztor|\bdzwonnic|katedr|\bbazylik|\bcerk(iew|wi)\b|\bsobor\b|\bsanktuar|\bkolegiat|\bsynagog/, "church"],
    [/\bwiez[ay] (budynku|ratusz|zamk|zegarow|remizy|urzedu|dworca|bramy|szkoly|kamienicy|biblioteki)|\bwiezyczk/, "buildingTower"],
    [/\belewacj/, "facade"],
    [/\bsilos|\belewator/, "silo"],
    [/\bpylon|\breklam/, "advertisingPylon"],
    [/\blatarni\w* morsk/, "tower"],
    [/\bslup(a|ie|y)?\b|\blatarni/, "pole"],
    [/\btunel|\bmetro\b|\bstacj\w* metra|\blinia m\d\b/, "tunnel"],
    [/\bwewnatrz/, "indoor"],
    [/\bwiez[aey]\b/, "tower"],
    [/\bdach(u|em|y)?\b/, "rooftop"],
  ],
  en: [
    [/\bwater tower/, "waterTower"],
    [/\bfloodlight/, "floodlightTower"],
    [/\brooftop mast/, "rooftopMast"],
    [/\brelocatable|\bballast/, "relocatableMast"],
    [/\bmobile mast|\bcell on wheels/, "mobileMast"],
    [/\bchimney/, "chimney"],
    [/\blattice/, "latticeTower"],
    [/\bmonopole|\btubular/, "tubularTower"],
    [/\bconcrete/, "concreteTower"],
    [/\bchurch|\bchapel|\bcathedral|\bbasilica|\babbey|\bminster\b|\bbelfry|\bsynagogue|\bmosque/, "church"],
    [/\bclock tower|\btown hall tower|\bcastle tower/, "buildingTower"],
    [/\bfacade/, "facade"],
    [/\bsilo/, "silo"],
    [/\btunnel/, "tunnel"],
    [/\bbillboard|\badvertising/, "advertisingPylon"],
    [/\bpole\b|\blamp ?post|\bstreet ?light|\bpylon/, "pole"],
    [/\bindoor/, "indoor"],
    [/\btower\b/, "tower"],
    [/\bmast\b/, "mast"],
    [/\broof/, "rooftop"],
  ],
};

function foldNote(note: string): string {
  return note.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().replaceAll("ł", "l").replace(FORMER_REMARK, " ").replace(WHITESPACE, " ");
}

function matchStructureType(folded: string, languages: readonly StructureNoteLanguage[]): StructureType | null {
  for (const language of languages) {
    const rule = TYPE_RULES[language].find(([pattern]) => pattern.test(folded));
    if (rule !== undefined) return rule[1];
  }
  return null;
}

export function findStructureTypeInNote(note: string, language?: StructureNoteLanguage): StructureType | null {
  const languages = language === undefined ? STRUCTURE_NOTE_LANGUAGES : [language];
  return matchStructureType(foldNote(note).replace(FORMER_PHRASE, " "), languages);
}

export function noteNamesStructureType(note: string, type: StructureType, language: StructureNoteLanguage): boolean {
  const folded = foldNote(note);
  return matchStructureType(folded.replace(FORMER_PHRASE, " "), [language]) === type || matchStructureType(folded, [language]) === type;
}
