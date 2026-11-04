import type { StructureNoteLanguage } from "@openbts/shared/structureNotes";

import type { Brand, Operator, StructureOwnerRef, StructureType } from "../types";
import { findBrand, getOperatorBrand } from "./brands";

const STRUCTURE_TYPE_KEYS: Record<StructureType, string> = {
  latticeTower: "common:structure.types.latticeTower",
  tubularTower: "common:structure.types.tubularTower",
  concreteTower: "common:structure.types.concreteTower",
  tower: "common:structure.types.tower",
  mast: "common:structure.types.mast",
  rooftopMast: "common:structure.types.rooftopMast",
  rooftop: "common:structure.types.rooftop",
  buildingTower: "common:structure.types.buildingTower",
  facade: "common:structure.types.facade",
  chimney: "common:structure.types.chimney",
  church: "common:structure.types.church",
  waterTower: "common:structure.types.waterTower",
  floodlightTower: "common:structure.types.floodlightTower",
  silo: "common:structure.types.silo",
  pole: "common:structure.types.pole",
  advertisingPylon: "common:structure.types.advertisingPylon",
  relocatableMast: "common:structure.types.relocatableMast",
  mobileMast: "common:structure.types.mobileMast",
  tunnel: "common:structure.types.tunnel",
  indoor: "common:structure.types.indoor",
};

export function getStructureTypeKey(type: StructureType): string {
  return STRUCTURE_TYPE_KEYS[type];
}

export function getStructureNoteLanguage(locale: string): StructureNoteLanguage {
  return locale.startsWith("pl") ? "pl" : "en";
}

export function getStructureOwnerBrand(
  owner: Pick<StructureOwnerRef, "brandId" | "operatorId"> | null,
  brands: readonly Brand[] | undefined,
  operators: readonly Operator[] | undefined,
): Brand | null {
  if (owner === null) return null;
  if (owner.brandId !== null) return findBrand(brands, owner.brandId);
  if (owner.operatorId === null) return null;

  const operator = operators?.find((candidate) => candidate.id === owner.operatorId);
  return getOperatorBrand(operator, brands);
}
