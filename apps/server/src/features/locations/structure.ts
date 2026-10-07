import { regions, structureOwners } from "@openbts/drizzle";
import type { Structure, StructureInput } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";

import type { Database } from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import { DATABASE_STRUCTURE_TYPES, type StructureOwnerRow, toStructureOwnerRef, toStructureType } from "../structures/serialize.js";
import type { LocationRow } from "./write.js";

export const STRUCTURE_COLUMNS = { structure_type: true, structure_owner_id: true, structure_note: true } as const;
export const HIDDEN_STRUCTURE_COLUMNS = { structure_type: false, structure_owner_id: false, structure_note: false } as const;

export const OWNER_OF_ANOTHER_COUNTRY_MESSAGE = "The structure owner belongs to another country than the location";

export type StructureValues = Pick<LocationRow, keyof typeof STRUCTURE_COLUMNS>;
export type StructureChange = Partial<StructureValues>;
export type OwnerMisfit = "missing" | "otherCountry";

export function toStructureChange(structure: StructureInput | undefined): StructureChange {
  const change: StructureChange = {};
  if (structure === undefined) return change;

  if (structure.type !== undefined) change.structure_type = structure.type === null ? null : DATABASE_STRUCTURE_TYPES[structure.type];
  if (structure.ownerId !== undefined) change.structure_owner_id = structure.ownerId;
  if (structure.note !== undefined) change.structure_note = structure.note || null;
  return change;
}

export function toStructure(row: StructureValues, owner: StructureOwnerRow | null): Structure {
  return {
    type: row.structure_type === null ? null : toStructureType(row.structure_type),
    owner: owner === null ? null : toStructureOwnerRef(owner),
    note: row.structure_note,
  };
}

export async function findOwnerMisfit(handle: Database | DbTx, ownerId: number, regionId: number | null): Promise<OwnerMisfit | null> {
  const [[owner], [region]] = await Promise.all([
    handle.select({ countryCode: structureOwners.countryCode }).from(structureOwners).where(eq(structureOwners.id, ownerId)).limit(1),
    regionId === null ? [] : handle.select({ countryCode: regions.countryCode }).from(regions).where(eq(regions.id, regionId)).limit(1),
  ]);
  if (!owner) return "missing";
  return owner.countryCode !== null && region && owner.countryCode !== region.countryCode ? "otherCountry" : null;
}

export async function assertOwnerFitsRegion(handle: Database | DbTx, ownerId: number, regionId: number | null): Promise<void> {
  const misfit = await findOwnerMisfit(handle, ownerId, regionId);
  if (misfit === "missing") throw new ErrorResponse("BAD_REQUEST", { message: `Structure owner ${ownerId} does not exist` });
  if (misfit === "otherCountry") throw new ErrorResponse("BAD_REQUEST", { message: OWNER_OF_ANOTHER_COUNTRY_MESSAGE });
}

export async function assertOwnerFitsAfterWrite(
  handle: Database | DbTx,
  current: Pick<LocationRow, "region_id" | "structure_owner_id"> | null,
  next: { region_id: number; structure_owner_id?: number | null },
): Promise<void> {
  const currentOwnerId = current?.structure_owner_id ?? null;
  const nextOwnerId = next.structure_owner_id === undefined ? currentOwnerId : next.structure_owner_id;
  if (nextOwnerId === null) return;
  if (current !== null && nextOwnerId === currentOwnerId && next.region_id === current.region_id) return;

  await assertOwnerFitsRegion(handle, nextOwnerId, next.region_id);
}
