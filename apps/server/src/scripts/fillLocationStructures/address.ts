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
const BUILDING_WORD_END = "(?![a-ząćęłńóśźż0-9_-])";
const BUILDING_NOUN = /budyn(?:ek|ku|ki|ków|kach)|blok(?:u|iem|i|ów|ach)?|kamienic(?:a|y|ę|e|ą|ach|ami)/i;
const STRUCTURE_MATERIAL = /kratow[a-ząćęłńóśźż]*|rurow[a-ząćęłńóśźż]*|strunobetonow[a-ząćęłńóśźż]*|[żz]elbet[a-ząćęłńóśźż]*|betonow[a-ząćęłńóśźż]*/;
const STRUCTURE_PREFIX_WORDS = [
  /wie[żz][ay]|maszt(?:u|em|y|ów|ach)?|dach(?:u|em|y|ów|ach)?|komin(?:u|em|y|ów|ach)?/,
  BUILDING_NOUN,
  STRUCTURE_MATERIAL,
]
  .map((pattern) => pattern.source)
  .join("|");
const STRUCTURE_PREFIX = new RegExp(`^(?:${STRUCTURE_PREFIX_WORDS})${WORD_END}`, "i");
const BUILDING_USE = /mieszkaln|us[łl]ugow|handlow|biurow|magazynow/;
const BUILDING_COMPONENT = /mieszkalno|us[łl]ugowo|handlowo|biurowo|magazynowo/;
const ADJECTIVE_ENDING = "(?:y|a|e|ego|ej|ym|ych|ymi)";
const BUILDING_MODIFIER = new RegExp(
  `(?:(?:(?:${BUILDING_COMPONENT.source})-){1,2}(?:${BUILDING_USE.source})` +
    `|(?:${BUILDING_USE.source}|przemys[łl]ow))${ADJECTIVE_ENDING}${BUILDING_WORD_END}`,
  "i",
);
const BUILDING_MODIFIER_PREFIX = new RegExp(`^${BUILDING_MODIFIER.source}`, "i");
const RESIDENTIAL_MODIFIER = new RegExp(`^mieszkaln${ADJECTIVE_ENDING}${BUILDING_WORD_END}`, "i");
const OFFICE_BUILDING_NOUN = /biurow(?:iec|ca|cu|cem|ce|ców|cach|cami)/;
const OFFICE_NOUN_PREFIX = new RegExp(`^${OFFICE_BUILDING_NOUN.source}${BUILDING_WORD_END}`, "i");
const OFFICE_BUILDING_ADJECTIVE = new RegExp(`^biurow${ADJECTIVE_ENDING}$`, "i");
const OFFICE_USE_IN_PLACEMENT = new RegExp(
  `${OFFICE_BUILDING_NOUN.source}${WORD_END}|(?:budynku|bloku|kamienicy)\\s+biurow${ADJECTIVE_ENDING}${BUILDING_WORD_END}`,
  "i",
);
const STRUCTURE_MODIFIER = new RegExp(`^(?:ci[śs]nienia|w[łl]asn[a-ząćęłńóśźż]*|stalow[a-ząćęłńóśźż]*|metalow[a-ząćęłńóśźż]*)${WORD_END}`, "i");
const PLACEMENT_BUILDING = `(?:budynku|bloku|kamienicy|${OFFICE_BUILDING_NOUN.source})${WORD_END}(?:\\s+${BUILDING_MODIFIER.source})?`;
const ROOFTOP_PLACEMENT = new RegExp(
  `^na\\s+(?:dachu${WORD_END}(?:\\s+${PLACEMENT_BUILDING})?|budynku${WORD_END}(?:\\s+${BUILDING_MODIFIER.source})?)`,
  "i",
);
const ROOFTOP_PLACEMENT_TYPES = new Set<StoredStructureType>([
  "tower",
  "mast",
  "lattice_tower",
  "tubular_tower",
  "concrete_tower",
  "rooftop_mast",
  "mobile_mast",
]);
const MAST_MATERIAL_PREFIX = new RegExp(
  `^${LEADING_ADJECTIVES.source}(?:maszt${WORD_END}\\s+(?:${STRUCTURE_MATERIAL.source})${WORD_END}` +
    `|(?:${STRUCTURE_MATERIAL.source})${WORD_END}\\s+maszt${WORD_END})`,
  "i",
);
const BUILDING_OBJECT_CONTEXT = new RegExp(`(?:^|\\s)budynku(?:\\s+${BUILDING_MODIFIER.source})?$`, "i");
const NOTE_SEPARATOR_PUNCTUATION = ",;:/";
const BUILDING_OBJECT_BOUNDARY = new RegExp(
  `(?:[${NOTE_SEPARATOR_PUNCTUATION}]|\\s+-\\s+|\\s+(?:i|oraz|albo|lub)\\s+)(?=(?:[^"]*"[^"]*")*[^"]*$)`,
  "i",
);
const ALTERNATIVE_START = /^(?:i|oraz|albo|lub)(?![a-ząćęłńóśźż0-9_])/i;
const TECHNICAL_DETAIL_START = new RegExp(
  "^(?:slr|rtcn|rton|tsr|bts|stacja linii radiowych|id\\s|nr\\s|na wysoko[śs]ci|h\\s*=|\\d|[a-z]{1,4}[-_]?\\d)",
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
const NOTE_SEPARATORS = new RegExp(`^[\\s${NOTE_SEPARATOR_PUNCTUATION}-]+`);
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

function attachedBuildingObject(tail: string): { text: string; length: number } | null {
  if (!/^\s+/.test(tail)) return null;

  const object = tail.trimStart();
  if (object === "" || NOTE_SEPARATORS.test(object) || ALTERNATIVE_START.test(object) || TECHNICAL_DETAIL_START.test(object)) return null;
  if (object.startsWith("(")) return null;
  if (BUILDING_MODIFIER_PREFIX.test(object) || OFFICE_NOUN_PREFIX.test(object) || STRUCTURE_MODIFIER.test(object)) return null;

  const boundary = BUILDING_OBJECT_BOUNDARY.exec(object);
  const length = boundary?.index ?? object.length;
  return { text: object, length: tail.length - object.length + length };
}

function kindTextWithoutPlacement(
  description: string,
  type: StoredStructureType | null,
  placementSpan: { start: number; end: number } | null,
): string {
  if (placementSpan === null) return description;

  const prefix = description.slice(0, placementSpan.start);
  const kindPrefix = type === "rooftop_mast" ? prefix.replace(MAST_MATERIAL_PREFIX, "maszt") : prefix;
  const suffix = description.slice(placementSpan.end);
  return kindPrefix + suffix;
}

function extraNote(description: string, type: StoredStructureType | null, owner: ParsedOwner | null): string | null {
  const currentDescription = withoutFormerRemarks(description);
  const normalized = currentDescription.toLowerCase();
  if (FORMER_STRUCTURE_ADJECTIVE.test(normalized) || namesAnotherOwner(normalized)) return description;

  let remaining = description;
  if (STARTS_WITH_STRUCTURE.test(remaining)) remaining = remaining.slice(PREFIX_ADJECTIVES.exec(remaining)?.[0].length ?? 0);
  let hasStructure = false;
  let hasBuilding = false;
  let hasBuildingObjectContext = false;
  let officeBuilding = false;
  let buildingObjectNote: string | null = null;
  let placementSpan: { start: number; end: number } | null = null;
  while (remaining !== "") {
    const structure = STRUCTURE_PREFIX.exec(remaining);
    const modifier = hasStructure ? STRUCTURE_MODIFIER.exec(remaining) : null;
    const buildingModifierPattern = hasBuilding ? BUILDING_MODIFIER_PREFIX : RESIDENTIAL_MODIFIER;
    const buildingModifier = hasStructure ? buildingModifierPattern.exec(remaining) : null;
    const officeNounContext = hasStructure && (hasBuilding || type === "rooftop" || placementSpan !== null);
    const officeNoun = officeNounContext ? OFFICE_NOUN_PREFIX.exec(remaining) : null;
    const rooftop = hasStructure && type !== null && ROOFTOP_PLACEMENT_TYPES.has(type) ? ROOFTOP_PLACEMENT.exec(remaining) : null;
    const connector = hasStructure ? STRUCTURE_CONNECTOR.exec(remaining) : null;
    const namedOwner = owner === null ? null : OWNER_PREFIX.exec(remaining);
    const word = structure ?? modifier ?? buildingModifier ?? officeNoun ?? rooftop ?? connector ?? namedOwner;
    if (word === null) break;

    const officeModifier = hasBuilding && buildingModifier !== null && OFFICE_BUILDING_ADJECTIVE.test(buildingModifier[0]);
    const officePlacement = rooftop !== null && OFFICE_USE_IN_PLACEMENT.test(rooftop[0]);
    if (officeNoun !== null || officeModifier || officePlacement) officeBuilding = true;
    if (rooftop !== null && placementSpan === null) {
      const start = description.length - remaining.length;
      placementSpan = { start, end: start + rooftop[0].length };
    }
    if (structure !== null) {
      hasStructure = true;
      hasBuilding = BUILDING_NOUN.test(structure[0]);
      hasBuildingObjectContext = /^budynku$/i.test(structure[0]);
    }
    if (rooftop !== null) hasBuildingObjectContext = BUILDING_OBJECT_CONTEXT.test(rooftop[0]);
    if (officeNoun !== null) hasBuilding = true;
    const rest = remaining.slice(word[0].length);
    const buildingObjectContext = hasBuildingObjectContext || officeBuilding;
    if (buildingObjectContext && /^\s+/.test(rest) && STARTS_WITH_STRUCTURE.test(rest.trimStart())) return description;
    const buildingObject = buildingObjectContext ? attachedBuildingObject(rest) : null;
    if (buildingObject !== null) {
      const start = placementSpan?.start ?? description.length - rest.length;
      placementSpan = { start, end: description.length - rest.length + buildingObject.length };
      buildingObjectNote = officeBuilding ? `biurowiec - ${buildingObject.text}` : `budynek ${buildingObject.text}`;
      break;
    }
    const separators = NOTE_SEPARATORS.exec(rest)?.[0] ?? "";
    if (/\S/.test(separators)) hasBuildingObjectContext = false;
    remaining = rest.slice(separators.length);
    if (officeBuilding && /\S/.test(separators)) break;
    if (separators.includes("-")) break;
  }

  const kindDescription = kindTextWithoutPlacement(description, type, placementSpan);
  if (namesAnotherKind(withoutFormerRemarks(kindDescription).toLowerCase(), type)) return description;
  if (buildingObjectNote !== null) return buildingObjectNote;

  const remarks = formerRemarks(description);
  const note = withoutFormerRemarks(remaining).replace(PUNCTUATION, "") === "" ? remarks : remaining;
  if (!officeBuilding) return note;
  return note === null ? "biurowiec" : `biurowiec - ${note}`;
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
