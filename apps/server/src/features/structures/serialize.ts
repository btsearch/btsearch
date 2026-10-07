import { structureOwners } from "@openbts/drizzle";
import type { StructureOwner, StructureOwnerRef, StructureType } from "@openbts/shared/contract";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import type { LocationRow } from "../locations/write.js";

const structureOwnerSelectSchema = createSelectSchema(structureOwners);

export type StructureOwnerRow = z.infer<typeof structureOwnerSelectSchema>;
export type StoredStructureType = NonNullable<LocationRow["structure_type"]>;

const CONTRACT_STRUCTURE_TYPES = {
  lattice_tower: "latticeTower",
  tubular_tower: "tubularTower",
  concrete_tower: "concreteTower",
  tower: "tower",
  mast: "mast",
  rooftop_mast: "rooftopMast",
  rooftop: "rooftop",
  chimney: "chimney",
  church: "church",
  water_tower: "waterTower",
  silo: "silo",
  pole: "pole",
  mobile_mast: "mobileMast",
  tunnel: "tunnel",
  indoor: "indoor",
  other: "other",
} as const satisfies Record<StoredStructureType, StructureType>;

export const DATABASE_STRUCTURE_TYPES: Record<StructureType, StoredStructureType> = {
  latticeTower: "lattice_tower",
  tubularTower: "tubular_tower",
  concreteTower: "concrete_tower",
  tower: "tower",
  mast: "mast",
  rooftopMast: "rooftop_mast",
  rooftop: "rooftop",
  chimney: "chimney",
  church: "church",
  waterTower: "water_tower",
  silo: "silo",
  pole: "pole",
  mobileMast: "mobile_mast",
  tunnel: "tunnel",
  indoor: "indoor",
  other: "other",
};

const STORED_STRUCTURE_TYPES: ReadonlySet<string> = new Set(Object.values(DATABASE_STRUCTURE_TYPES));

export function isStoredStructureType(value: unknown): value is StoredStructureType {
  return typeof value === "string" && STORED_STRUCTURE_TYPES.has(value);
}

export function toStructureType(type: StoredStructureType): StructureType {
  return CONTRACT_STRUCTURE_TYPES[type];
}

export function toStructureOwner(row: StructureOwnerRow): StructureOwner {
  return { id: row.id, name: row.name, countryCode: row.countryCode, brandId: row.brandId, operatorId: row.operatorId };
}

export function toStructureOwnerRef(row: StructureOwnerRow): StructureOwnerRef {
  return { id: row.id, name: row.name, brandId: row.brandId, operatorId: row.operatorId };
}
