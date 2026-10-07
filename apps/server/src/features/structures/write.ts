import { brands, countries, locations, operators, regions, structureOwners } from "@openbts/drizzle";
import { type SQL, and, eq, isNull, ne, or, sql } from "drizzle-orm";

import type { Database } from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import type { StructureOwnerRow } from "./serialize.js";

type StructureOwnerValues = Pick<StructureOwnerRow, "name" | "countryCode" | "brandId" | "operatorId">;
type NamedOwner = { owner: StructureOwnerRow; isNew: boolean };

function isNamed(name: string): SQL {
  return sql`lower(${structureOwners.name}) = lower(${name})`;
}

async function assertCountryExists(tx: DbTx, countryCode: string): Promise<void> {
  const [country] = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, countryCode)).limit(1);
  if (!country) throw new ErrorResponse("BAD_REQUEST", { message: "Country not found" });
}

async function assertBrandExists(tx: DbTx, brandId: number): Promise<void> {
  const [brand] = await tx.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new ErrorResponse("BAD_REQUEST", { message: "Brand not found" });
}

async function assertOperatorFits(tx: DbTx, operatorId: number, countryCode: string | null): Promise<void> {
  const [operator] = await tx.select({ countryCode: operators.countryCode }).from(operators).where(eq(operators.id, operatorId)).limit(1);
  if (!operator) throw new ErrorResponse("BAD_REQUEST", { message: "Operator not found" });
  if (countryCode !== null && operator.countryCode !== countryCode) {
    throw new ErrorResponse("BAD_REQUEST", { message: "The operator belongs to another country than the structure owner" });
  }
}

async function assertNameFree(tx: DbTx, name: string, countryCode: string | null, id?: number): Promise<void> {
  const withSameCountry = countryCode === null ? isNull(structureOwners.countryCode) : eq(structureOwners.countryCode, countryCode);
  const [sameName] = await tx
    .select({ id: structureOwners.id })
    .from(structureOwners)
    .where(and(isNamed(name), withSameCountry, id === undefined ? undefined : ne(structureOwners.id, id)))
    .limit(1);
  if (!sameName) return;

  if (countryCode === null) throw new ErrorResponse("CONFLICT", { message: "A structure owner with this name and no country already exists" });
  throw new ErrorResponse("CONFLICT", { message: "This country already has a structure owner with this name" });
}

async function assertOperatorFree(tx: DbTx, operatorId: number, id?: number): Promise<void> {
  const [sameOperator] = await tx
    .select({ id: structureOwners.id })
    .from(structureOwners)
    .where(and(eq(structureOwners.operatorId, operatorId), id === undefined ? undefined : ne(structureOwners.id, id)))
    .limit(1);
  if (sameOperator) throw new ErrorResponse("CONFLICT", { message: "This operator already has a structure owner entry" });
}

async function assertLocationsInCountry(tx: DbTx, ownerId: number, countryCode: string): Promise<void> {
  const [elsewhere] = await tx
    .select({ id: locations.id })
    .from(locations)
    .innerJoin(regions, eq(regions.id, locations.region_id))
    .where(and(eq(locations.structure_owner_id, ownerId), ne(regions.countryCode, countryCode)))
    .limit(1);
  if (elsewhere) {
    throw new ErrorResponse("CONFLICT", { message: "Cannot set a country on a structure owner that locations in other countries still use" });
  }
}

export async function validateStructureOwnerWrite(tx: DbTx, next: StructureOwnerValues, current?: StructureOwnerRow): Promise<void> {
  const { name, countryCode, brandId, operatorId } = next;
  const changesCountry = countryCode !== current?.countryCode;
  const changesOperator = operatorId !== current?.operatorId;

  if (countryCode !== null && changesCountry) await assertCountryExists(tx, countryCode);
  if (current !== undefined && countryCode !== null && changesCountry) await assertLocationsInCountry(tx, current.id, countryCode);
  if (brandId !== null && brandId !== current?.brandId) await assertBrandExists(tx, brandId);
  if (operatorId !== null && (changesOperator || changesCountry)) await assertOperatorFits(tx, operatorId, countryCode);
  if (name !== current?.name || changesCountry) await assertNameFree(tx, name, countryCode, current?.id);
  if (operatorId !== null && changesOperator) await assertOperatorFree(tx, operatorId, current?.id);
}

async function findRegionCountryCode(handle: Database | DbTx, regionId: number | null): Promise<string | null> {
  if (regionId === null) return null;

  const [region] = await handle.select({ countryCode: regions.countryCode }).from(regions).where(eq(regions.id, regionId)).limit(1);
  return region?.countryCode ?? null;
}

async function findOwnerByName(handle: Database | DbTx, name: string, countryCode: string | null): Promise<StructureOwnerRow | undefined> {
  const withoutCountry = isNull(structureOwners.countryCode);
  const [owner] = await handle
    .select()
    .from(structureOwners)
    .where(and(isNamed(name), countryCode === null ? withoutCountry : or(eq(structureOwners.countryCode, countryCode), withoutCountry)))
    .orderBy(sql`${structureOwners.countryCode} IS NULL`)
    .limit(1);
  return owner;
}

export async function findNamedOwner(handle: Database | DbTx, name: string, regionId: number | null): Promise<StructureOwnerRow | undefined> {
  return findOwnerByName(handle, name, await findRegionCountryCode(handle, regionId));
}

export async function findOrCreateNamedOwner(tx: DbTx, name: string, regionId: number): Promise<NamedOwner> {
  const countryCode = await findRegionCountryCode(tx, regionId);
  if (countryCode === null) throw new ErrorResponse("BAD_REQUEST", { message: `Region ${regionId} does not exist` });

  const existing = await findOwnerByName(tx, name, countryCode);
  if (existing) return { owner: existing, isNew: false };

  const [created] = await tx.insert(structureOwners).values({ name, countryCode }).returning();
  if (!created) throw new ErrorResponse("FAILED_TO_CREATE", { message: "Failed to create structure owner" });
  return { owner: created, isNew: true };
}
