import type { StructureType } from "./contract/structures.ts";

export const STRUCTURE_NOTE_LANGUAGES = ["pl", "en"] as const;
export type StructureNoteLanguage = (typeof STRUCTURE_NOTE_LANGUAGES)[number];

type TypeRule = readonly [pattern: RegExp, type: StructureType];
type ContinuationRules = { words: RegExp; names: RegExp };

const COMBINING_MARKS = /\p{Mn}/gu;
const WHITESPACE = /\s+/g;
const FORMER_REMARK = /\((dawn|byl|d\. |formerly|previously)[^()]*\)/g;
const FORMER_PHRASE = /\b(dawn\w*|byl(a|e|y|ego|ej|ych|ym|ymi)?|former)\b[^,;()/-]*?(?=\s(na|przy|obok|kolo|on|at|near)\s|[,;()/-]|$)/g;
const PL_PREPOSITIONS = "przy|kolo|obok|blisko|niedaleko|naprzeciw(ko)?|na|nad|pod|przed|za|w|we|z|ze|u|od|do|wzdluz|wsrod|miedzy|poza";
const PL_ADJECTIVE =
  "(stalow|metalow|ceglan|murowan|zelbetow|betonow|strunobetonow|kratow|rurow|drewnian|kamienn|wolnostojac|tymczasow|nisk|wysok|widokow|obserwacyjn|radiow|telewizyjn)(ie|y|a|e|i)";

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

const CONTINUATION_RULES: Record<StructureNoteLanguage, ContinuationRules> = {
  pl: {
    words: new RegExp(`^((${PL_PREPOSITIONS}|dawniej)\\b|(${PL_ADJECTIVE} )*${PL_ADJECTIVE}($|[,;(/-]| [,;(/-]| (${PL_PREPOSITIONS})\\b))`),
    names: /^([(/]|\S*(ego|ej|ych|ich|ni|cy|cji|ji|ii|u)\b|\S*[yi] \S*(ego|ej|ych|ich)\b|\S*ow \S*(ych|ich)\b)/,
  },
  en: {
    words: /^(at|near|by|next to|behind|beside|opposite|of|in|inside|outside)\b/,
    names: /^[(/]/,
  },
};

function foldText(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().replaceAll("ł", "l").replace(WHITESPACE, " ").trim();
}

function foldNote(note: string): string {
  return foldText(note).replace(FORMER_REMARK, " ").replace(WHITESPACE, " ");
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

function noteNamesStructureType(note: string, type: StructureType): boolean {
  const folded = foldNote(note);
  return [folded.replace(FORMER_PHRASE, " "), folded].some((text) => matchStructureType(text, STRUCTURE_NOTE_LANGUAGES) === type);
}

function continueStructureType(typeName: string, note: string, language: StructureNoteLanguage): string | null {
  const folded = foldText(note);
  const rules = CONTINUATION_RULES[language];
  if (rules.words.test(folded)) return `${typeName} ${note.charAt(0).toLowerCase()}${note.slice(1)}`;
  if (rules.names.test(folded)) return `${typeName} ${note}`;
  return null;
}

export function getStructurePhrase(typeName: string, type: StructureType, note: string, language: StructureNoteLanguage): string | null {
  if (noteNamesStructureType(note, type)) return note;
  return continueStructureType(typeName, note, language);
}
