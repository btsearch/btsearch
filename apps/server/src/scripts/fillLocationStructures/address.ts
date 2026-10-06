import type { StoredStructureType } from "../../features/structures/serialize.js";

export type OperatorOwner = "orange" | "t_mobile" | "play" | "plus";
export type CompanyOwner = "on_tower" | "towerlink" | "cellnex" | "emitel" | "towernorth" | "pkp" | "enea" | "energa" | "tauron" | "pge" | "pse";
export type NamedOwner = CompanyOwner | OperatorOwner;
export type ParsedOwner = NamedOwner | "station_operator";

export type ParsedAddress = {
  street: string | null;
  description: string | null;
  placeHint: string | null;
  type: StoredStructureType | null;
  owner: ParsedOwner | null;
  note: string | null;
};

type Rule<Value> = readonly [pattern: RegExp, value: Value];

const TYPE_RULES: readonly Rule<StoredStructureType>[] = [
  [/wie[żz][ay] ci[śs]nie/, "water_tower"],
  [/maszt\S*( \S+)? (na|z) dach|dach\S* .*maszt/, "rooftop_mast"],
  [/przestawn|mobiln|tymczasow/, "mobile_mast"],
  [/kratow/, "lattice_tower"],
  [/rurow/, "tubular_tower"],
  [/strunobet|[żz]elbet|betonow/, "concrete_tower"],
  [/komin/, "chimney"],
  [/ko[śs]ci[óo][łl]|ko[śs]cio[łl]a|kaplic|klasztor|dzwonnic|katedr|bazylik|cerk(iew|wi)|parafi/, "church"],
  [/silos|elewator/, "silo"],
  [/tunel|metr[oa]\b|podziemn/, "tunnel"],
  [/wie[żz][ay]/, "tower"],
  [/maszt/, "mast"],
  [/s[łl]up|latarni|pylon/, "pole"],
  [/dach|budyn|blok|kamienic|biurow|wie[żz]owiec|szko[łl]|hotel|szpital|urz[ąa]d|akademik|ratusz|remiz|\bdom\b|apartament/, "rooftop"],
];

const KINDS_COVERED_BY: Partial<Record<StoredStructureType, readonly StoredStructureType[]>> = {
  rooftop_mast: ["mast", "rooftop"],
  lattice_tower: ["tower", "mast"],
  tubular_tower: ["tower", "mast"],
  concrete_tower: ["tower", "mast"],
};

const OWNER_RULES: readonly Rule<ParsedOwner>[] = [
  [/(?:cellnex\s*\/?\s*)?on ?tower/, "on_tower"],
  [/(?:cellnex\s*\/?\s*)?towerlink/, "towerlink"],
  [/cellnex\s*\/\s*play/, "on_tower"],
  [/cellnex\s*\/\s*plus/, "towerlink"],
  [/cellnex/, "cellnex"],
  [/towernorth/, "towernorth"],
  [/emitel/, "emitel"],
  [/w[łl]asn/, "station_operator"],
  [/orange/, "orange"],
  [/t-?mobile/, "t_mobile"],
  [/\bplay\b/, "play"],
  [/\bplus[ a]?\b|polkomtel/, "plus"],
  [/\bpkp\b/, "pkp"],
  [/\benea\b/, "enea"],
  [/\benerg[ai]\b/, "energa"],
  [/\btauron/, "tauron"],
  [/\bpge\b/, "pge"],
  [/\bpse\b/, "pse"],
];

const LONG_DASHES = /[\u2012-\u2015]/g;
const WHITESPACE = /\s+/g;
const LEADING_ADJECTIVES = /(?:(?:w[łl]asn|nisk|wysok|now|star|dawn|by[łl]|okr[ąa]g[łl]|stalow|metalow|tymczasow)\S* )*/;
const STRUCTURE_NOUN = /(?:wie[żz][ay]|maszt|dach|komin|s[łl]up|pylon|tunel|silos|ko[śs]ci[óo][łl])(?![a-ząćęłńóśźż])/;
const STRUCTURE_STEM = /(?:kratow|rurow|strunobetonow|kratownic)/;
const STRUCTURE_START = `${LEADING_ADJECTIVES.source}(?:${STRUCTURE_NOUN.source}|${STRUCTURE_STEM.source})`;
const RADIO_STATION_START = /(?:slr|stacja linii radiowych)(?![a-ząćęłńóśźż0-9_])/;
const STARTS_WITH_STRUCTURE = new RegExp(`^${STRUCTURE_START}`, "i");
const STARTS_WITH_RADIO_STATION = new RegExp(`^${RADIO_STATION_START.source}`, "i");
const SEPARATOR_BEFORE_DESCRIPTION = new RegExp(`\\s*[-,]\\s*(?=${STRUCTURE_START}|${RADIO_STATION_START.source})`, "i");
const DASH_OUTSIDE_BRACKETS = / - (?![^()]*\))/;
const TRAILING_BRACKETS = /\s*\(([^()]+)\)$/;

const FORMER_REMARK = /\s*\(((?:dawn|by[łl])[^()]*)\)/gi;
const STARTS_AS_FORMER = /^(?:dawn|by[łl])\S* /i;
const FORMER_STRUCTURE_ADJECTIVE = /(?:^|\s)(?:dawn|by[łl])\S* /i;

const PLACE_HINT = /(?:^|(?<=\s))(?:przy|ko[łl]o|obok|niedaleko|blisko|w pobli[żz]u|naprzeciw(?:ko)?)\s/i;
const TRAILING_SEPARATORS = /[\s,;-]+$/;
const STREET_OR_NUMBER = /\d|(?:^|[\s,(])(?:ul|al|pl|os|dz)\.?\s/i;

const WORD_END = "(?![a-ząćęłńóśźż0-9_])";
const STRUCTURE_PREFIX_WORDS = [
  /wie[żz][ay]|maszt(?:u|em|y|ów|ach)?|dach(?:u|em|y|ów|ach)?|komin(?:u|em|y|ów|ach)?/,
  /budyn(?:ek|ku|ki|ków|kach)|blok(?:u|iem|i|ów|ach)?|kamienic(?:a|y|ę|e|ą|ach|ami)/,
  /kratow[a-ząćęłńóśźż]*|rurow[a-ząćęłńóśźż]*|strunobetonow[a-ząćęłńóśźż]*|[żz]elbet[a-ząćęłńóśźż]*|betonow[a-ząćęłńóśźż]*/,
]
  .map((pattern) => pattern.source)
  .join("|");
const STRUCTURE_PREFIX = new RegExp(`^(?:${STRUCTURE_PREFIX_WORDS})${WORD_END}`, "i");
const STRUCTURE_MODIFIER = new RegExp(
  `^(?:mieszkaln(?:y|a|e|ego|ej|ym|ych|ymi)|ci[śs]nienia|w[łl]asn[a-ząćęłńóśźż]*|stalow[a-ząćęłńóśźż]*|metalow[a-ząćęłńóśźż]*)${WORD_END}`,
  "i",
);
const OWNER_PREFIX_WORDS = [
  /cellnex|on ?tower|towerlink|towernorth|emitela?|orange|t-?mobile|play|plusa?|polkomtel/,
  /pkp|enea|energ[ai]|tauron|pge|pse/,
]
  .map((pattern) => pattern.source)
  .join("|");
const OWNER_PREFIX = new RegExp(`^(?:${OWNER_PREFIX_WORDS})${WORD_END}`, "i");
const STRUCTURE_CONNECTOR = new RegExp(`^(?:na|z)\\s+(?=${STRUCTURE_PREFIX_WORDS})`, "i");
const PREFIX_ADJECTIVES = new RegExp(`^${LEADING_ADJECTIVES.source}`, "i");
const NOTE_SEPARATORS = /^[\s,;:/-]+/;
const PUNCTUATION = /[\s.,()-]+/g;

function firstMatch<Value>(rules: readonly Rule<Value>[], text: string): Value | null {
  for (const [pattern, value] of rules) {
    if (pattern.test(text)) return value;
  }
  return null;
}

function namesAnotherKind(text: string, type: StoredStructureType | null): boolean {
  const covered: readonly StoredStructureType[] = type === null ? [] : (KINDS_COVERED_BY[type] ?? []);
  return TYPE_RULES.some(([pattern, kind]) => kind !== type && !covered.includes(kind) && pattern.test(text));
}

function namesAnotherOwner(text: string): boolean {
  const named = OWNER_RULES.find(([pattern]) => pattern.test(text));
  if (named === undefined) return false;

  const rest = text.replace(new RegExp(named[0].source, "g"), " ");
  return OWNER_RULES.some(([pattern]) => pattern.test(rest));
}

function withoutStructure(street: string | null, placeHint: string | null): ParsedAddress {
  return { street, description: null, placeHint, type: null, owner: null, note: null };
}

function splitAddress(address: string): { street: string | null; description: string | null } {
  const text = address.replace(LONG_DASHES, "-").replace(WHITESPACE, " ").trim();
  if (STARTS_WITH_STRUCTURE.test(text) || STARTS_WITH_RADIO_STATION.test(text)) return { street: null, description: text };

  const separator = SEPARATOR_BEFORE_DESCRIPTION.exec(text);
  if (separator) return { street: text.slice(0, separator.index).trim(), description: text.slice(separator.index + separator[0].length).trim() };

  const parts = text.split(DASH_OUTSIDE_BRACKETS);
  if (parts.length > 1) return { street: parts.slice(0, -1).join(" - ").trim(), description: parts.at(-1)?.trim() ?? null };

  const bracketed = TRAILING_BRACKETS.exec(text);
  if (bracketed) return { street: text.slice(0, bracketed.index).trim(), description: bracketed[1]!.trim() };

  return { street: text, description: null };
}

function splitPlaceHint(text: string): { description: string; placeHint: string | null } {
  const hintStart = text.search(PLACE_HINT);
  if (hintStart === -1) return { description: text, placeHint: null };

  return { description: text.slice(0, hintStart).replace(TRAILING_SEPARATORS, ""), placeHint: text.slice(hintStart).trim() };
}

export function withoutFormerRemarks(description: string): string {
  return description.replace(FORMER_REMARK, "").trim();
}

function formerRemarks(description: string): string | null {
  const remarks = [...description.matchAll(FORMER_REMARK)].map((match) => (match[1] ?? "").trim());
  return remarks.length === 0 ? null : remarks.join(", ");
}

function extraNote(description: string, type: StoredStructureType | null, owner: ParsedOwner | null): string | null {
  const currentDescription = withoutFormerRemarks(description);
  const normalized = currentDescription.toLowerCase();
  if (FORMER_STRUCTURE_ADJECTIVE.test(normalized) || namesAnotherKind(normalized, type) || namesAnotherOwner(normalized)) return description;

  let remaining = description;
  if (STARTS_WITH_STRUCTURE.test(remaining)) remaining = remaining.slice(PREFIX_ADJECTIVES.exec(remaining)?.[0].length ?? 0);
  let hasStructure = false;
  while (remaining !== "") {
    const structure = STRUCTURE_PREFIX.exec(remaining);
    const modifier = hasStructure ? STRUCTURE_MODIFIER.exec(remaining) : null;
    const connector = hasStructure ? STRUCTURE_CONNECTOR.exec(remaining) : null;
    const namedOwner = owner === null ? null : OWNER_PREFIX.exec(remaining);
    const word = structure ?? modifier ?? connector ?? namedOwner;
    if (word === null) break;

    if (structure !== null) hasStructure = true;
    const rest = remaining.slice(word[0].length);
    const separators = NOTE_SEPARATORS.exec(rest)?.[0] ?? "";
    remaining = rest.slice(separators.length);
    if (separators.includes("-")) break;
  }

  const remarks = formerRemarks(description);
  if (withoutFormerRemarks(remaining).replace(PUNCTUATION, "") === "") return remarks;
  return remaining;
}

export function namesStreetOrNumber(text: string): boolean {
  return STREET_OR_NUMBER.test(text);
}

export function addressWithoutDescription({ street, placeHint }: Pick<ParsedAddress, "street" | "placeHint">): string | null {
  const keptParts = [street?.replace(TRAILING_SEPARATORS, "") ?? "", placeHint ?? ""].filter((part) => part !== "");
  return keptParts.length === 0 ? null : keptParts.join(", ");
}

export function cutAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const lastSpace = text.lastIndexOf(" ", maxLength);
  return text.slice(0, lastSpace > 0 ? lastSpace : maxLength).replace(TRAILING_SEPARATORS, "");
}

export function parseAddress(address: string | null): ParsedAddress {
  if (address === null || address.trim() === "") return withoutStructure(null, null);

  const { street, description: fullDescription } = splitAddress(address);
  if (fullDescription === null) return withoutStructure(street, null);

  const { description, placeHint } = splitPlaceHint(fullDescription);
  if (description === "") return withoutStructure(street, placeHint);

  const asItIsToday = withoutFormerRemarks(description).toLowerCase();
  const type = firstMatch(TYPE_RULES, asItIsToday);
  const owner = STARTS_AS_FORMER.test(asItIsToday) ? null : firstMatch(OWNER_RULES, asItIsToday);
  return {
    street,
    description,
    placeHint,
    type,
    owner,
    note: extraNote(description, type, owner),
  };
}
