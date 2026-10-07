import { brands, operators, structureOwners } from "@openbts/drizzle";
import { db } from "@openbts/drizzle/db";
import { asc, inArray } from "drizzle-orm";

import { runAuditedOperation, systemAuditContext } from "../../features/audit/index.js";
import type { BrandRow } from "../../features/brands/serialize.js";
import type { OperatorRow } from "../../features/operators/serialize.js";
import type { StructureOwnerRow } from "../../features/structures/serialize.js";
import { validateStructureOwnerWrite } from "../../features/structures/write.js";
import type { CompanyOwner, NamedOwner, OperatorOwner } from "./address.js";
import { OPERATOR_MNCS } from "./ownTower.js";

type StoredOwner = { id: number; name: string };
type NewOwner = { id: null; name: string; brandId: number | null; operatorId: number | null; linkRemark: string };

export type OwnerEntry = StoredOwner | NewOwner;
type OwnerDirectory = {
  owners: StructureOwnerRow[];
  operators: Pick<OperatorRow, "id" | "name" | "full_name" | "brandId" | "mnc">[];
  brands: Pick<BrandRow, "id" | "slug" | "name">[];
};

export const COUNTRY_CODE = "PL";

const COMPANIES: Record<CompanyOwner, { name: string; brand: string }> = {
  on_tower: { name: "On Tower Poland", brand: "Cellnex" },
  towerlink: { name: "Towerlink Poland", brand: "Cellnex" },
  cellnex: { name: "Cellnex Poland", brand: "Cellnex" },
  emitel: { name: "Emitel", brand: "Emitel" },
  towernorth: { name: "TowerNorth", brand: "TowerNorth" },
  pkp: { name: "PKP", brand: "PKP" },
  enea: { name: "Enea", brand: "Enea" },
  energa: { name: "Energa", brand: "Energa" },
  tauron: { name: "Tauron", brand: "Tauron" },
  pge: { name: "PGE", brand: "PGE" },
  pse: { name: "PSE", brand: "PSE" },
};

function isOperatorOwner(owner: NamedOwner): owner is OperatorOwner {
  return owner in OPERATOR_MNCS;
}

function ownerNamed(ownerRows: readonly StructureOwnerRow[], name: string): StructureOwnerRow | undefined {
  const wanted = name.toLowerCase();
  return ownerRows.find((row) => row.name.toLowerCase() === wanted && (row.countryCode === COUNTRY_CODE || row.countryCode === null));
}

function companyEntry(owner: CompanyOwner, { owners: ownerRows, brands: brandRows }: OwnerDirectory): OwnerEntry {
  const { name, brand } = COMPANIES[owner];
  const stored = ownerNamed(ownerRows, name);
  if (stored) return { id: stored.id, name: stored.name };

  const wanted = brand.toLowerCase();
  const brandId = brandRows.find((candidate) => candidate.slug === wanted || candidate.name.toLowerCase() === wanted)?.id ?? null;
  const brandPhrase = brandId === null ? `without a brand, none has the slug or the name ${brand}` : `with the brand ${brand}`;
  return { id: null, name, brandId, operatorId: null, linkRemark: brandPhrase };
}

function operatorEntry(owner: OperatorOwner, { owners: ownerRows, operators: operatorRows }: OwnerDirectory): OwnerEntry {
  const mnc = OPERATOR_MNCS[owner];
  const operator = operatorRows.find((candidate) => candidate.mnc === mnc);
  if (!operator) throw new Error(`No operator has the network code ${mnc}, so no owner entry can be made for it`);

  const name = operator.full_name.trim() || operator.name;
  const stored = ownerRows.find((candidate) => candidate.operatorId === operator.id) ?? ownerNamed(ownerRows, name);
  if (stored) return { id: stored.id, name: stored.name };

  const brandPhrase = operator.brandId === null ? "without a brand, the operator has none" : "with the operator's brand";
  return {
    id: null,
    name,
    brandId: operator.brandId,
    operatorId: operator.id,
    linkRemark: `linked to the operator ${operator.name}, ${brandPhrase}`,
  };
}

export async function loadOwnerDirectory(): Promise<OwnerDirectory> {
  const [ownerRows, operatorRows, brandRows] = await Promise.all([
    db.select().from(structureOwners).orderBy(asc(structureOwners.id)),
    db
      .select({ id: operators.id, name: operators.name, full_name: operators.full_name, brandId: operators.brandId, mnc: operators.mnc })
      .from(operators)
      .where(inArray(operators.mnc, Object.values(OPERATOR_MNCS))),
    db.select({ id: brands.id, slug: brands.slug, name: brands.name }).from(brands),
  ]);
  return { owners: ownerRows, operators: operatorRows, brands: brandRows };
}

export function resolveOwnerEntries(owners: readonly NamedOwner[], directory: OwnerDirectory): Map<NamedOwner, OwnerEntry> {
  return new Map(owners.map((owner) => [owner, isOperatorOwner(owner) ? operatorEntry(owner, directory) : companyEntry(owner, directory)]));
}

export function findStoredOwnerId(owner: NamedOwner, directory: OwnerDirectory): number | null {
  return resolveOwnerEntries([owner], directory).get(owner)?.id ?? null;
}

export async function createMissingOwners(entries: ReadonlyMap<NamedOwner, OwnerEntry>): Promise<Map<NamedOwner, number>> {
  const ownerIds = new Map<NamedOwner, number>();
  const missing: [NamedOwner, NewOwner][] = [];
  for (const [owner, entry] of entries) {
    if (entry.id === null) missing.push([owner, entry]);
    else ownerIds.set(owner, entry.id);
  }
  if (missing.length === 0) return ownerIds;

  await runAuditedOperation(systemAuditContext(), { kind: "structure_owner.create" }, async (tx, audit) => {
    /* eslint-disable no-await-in-loop */
    for (const [owner, { name, brandId, operatorId }] of missing) {
      const values = { name, countryCode: COUNTRY_CODE, brandId, operatorId };
      await validateStructureOwnerWrite(tx, values);

      const [row] = await tx.insert(structureOwners).values(values).returning();
      if (!row) throw new Error(`The structure owner ${name} was not created`);

      await audit.log({ entity: "structure_owners", op: "create", recordId: row.id, new: row });
      ownerIds.set(owner, row.id);
    }
    /* eslint-enable no-await-in-loop */
  });
  return ownerIds;
}
