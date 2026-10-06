import type { Structure, StructureType } from "@openbts/shared/contract";

import { getStructureTypeKey } from "@/features/station-details/station/utils/structure";

export type ListRowStructure = {
  type: StructureType | null;
  typeKey: string | null;
  ownerName: string | null;
  note: string | null;
  secondLine: string | null;
  textWithoutType: string | null;
  tooltipDetails: string[];
};

const STRUCTURE_TYPE_WORDS: Record<StructureType, StructureType> = {
  latticeTower: "latticeTower",
  tubularTower: "tubularTower",
  concreteTower: "concreteTower",
  tower: "tower",
  mast: "mast",
  rooftopMast: "rooftopMast",
  rooftop: "rooftop",
  chimney: "chimney",
  church: "church",
  waterTower: "waterTower",
  silo: "silo",
  pole: "pole",
  mobileMast: "mobileMast",
  tunnel: "tunnel",
  indoor: "indoor",
  other: "other",
};

export const LIST_STRUCTURE_TYPES: readonly StructureType[] = Object.values(STRUCTURE_TYPE_WORDS);
export const COMMON_STRUCTURE_TYPES: readonly StructureType[] = ["latticeTower", "tower", "rooftop", "church", "chimney"];
export const UNKNOWN_STRUCTURE_TYPE_WORD = "unknown";

const NO_STRUCTURE: ListRowStructure = {
  type: null,
  typeKey: null,
  ownerName: null,
  note: null,
  secondLine: null,
  textWithoutType: null,
  tooltipDetails: [],
};

export function toShownText(text: string | null | undefined): string | null {
  const shownText = text?.trim() ?? "";
  return shownText === "" ? null : shownText;
}

export function toListRowStructure(structure: Structure | null | undefined): ListRowStructure {
  if (structure === null || structure === undefined) return NO_STRUCTURE;

  const ownerName = toShownText(structure.owner?.name);
  const note = toShownText(structure.note);
  const tooltipDetails = [ownerName, note].flatMap((detail) => (detail === null ? [] : [detail]));

  return {
    type: structure.type,
    typeKey: structure.type === null ? null : getStructureTypeKey(structure.type),
    ownerName,
    note,
    secondLine: structure.type === null ? null : (ownerName ?? note),
    textWithoutType: structure.type === null ? note : null,
    tooltipDetails,
  };
}
