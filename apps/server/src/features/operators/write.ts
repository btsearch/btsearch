import { brands, operatorLinks, operators, plmns } from "@openbts/drizzle";
import type { OperatorLinkInput, OperatorLinkKind, PlmnInput } from "@openbts/shared/contract";
import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";

import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import { MCC_LENGTH, type OperatorLinkRow } from "./serialize.js";

type OperatorWrite = {
  id?: number;
  countryCode: string;
  name?: string;
  plmns?: readonly PlmnInput[];
  links?: readonly OperatorLinkInput[];
  brandId?: number | null;
};

const DATABASE_LINK_KINDS = { jvMember: "jv_member" } as const satisfies Record<OperatorLinkKind, OperatorLinkRow["kind"]>;

export function primaryPlmnNumber(entries: readonly PlmnInput[] | undefined): number | null | undefined {
  if (entries === undefined) return undefined;

  const primary = entries.find((entry) => entry.role === "primary");
  return primary ? Number(primary.plmn) : null;
}

export async function assertPlmnsFree(tx: DbTx, entries: readonly PlmnInput[], id?: number): Promise<void> {
  if (entries.length === 0) return;

  const codes = entries.map((entry) => entry.plmn);
  const [[sameCode], [sameLegacyNumber]] = await Promise.all([
    tx
      .select({ id: plmns.id })
      .from(plmns)
      .where(and(inArray(plmns.code, codes), id === undefined ? undefined : ne(plmns.operatorId, id)))
      .limit(1),
    tx
      .select({ id: operators.id })
      .from(operators)
      .where(and(inArray(operators.mnc, codes.map(Number)), id === undefined ? undefined : ne(operators.id, id)))
      .limit(1),
  ]);
  if (sameCode || sameLegacyNumber) throw new ErrorResponse("CONFLICT", { message: "One of these PLMNs already belongs to another operator" });
}

async function assertLinksAreValid(tx: DbTx, links: readonly OperatorLinkInput[], countryCode: string, id?: number): Promise<void> {
  const relatedIds = [...new Set(links.map((link) => link.operatorId))];
  if (relatedIds.length === 0) return;
  if (id !== undefined && relatedIds.includes(id)) throw new ErrorResponse("BAD_REQUEST", { message: "An operator cannot be linked to itself" });

  const rows = await tx.select({ id: operators.id, countryCode: operators.countryCode }).from(operators).where(inArray(operators.id, relatedIds));
  if (rows.length !== relatedIds.length) throw new ErrorResponse("BAD_REQUEST", { message: "A linked operator was not found" });
  if (rows.some((row) => row.countryCode !== countryCode)) {
    throw new ErrorResponse("BAD_REQUEST", { message: "A linked operator belongs to another country" });
  }
  if (id === undefined) return;

  const [memberOfThisOperator] = await tx
    .select({ id: operatorLinks.operatorId })
    .from(operatorLinks)
    .where(and(inArray(operatorLinks.operatorId, relatedIds), eq(operatorLinks.relatedOperatorId, id)))
    .limit(1);
  if (memberOfThisOperator) throw new ErrorResponse("BAD_REQUEST", { message: "A linked operator is already a member of this operator" });
}

export async function validateOperatorWrite(tx: DbTx, operator: OperatorWrite): Promise<void> {
  const { id, countryCode, name, brandId } = operator;

  if (name !== undefined) {
    const [sameName] = await tx
      .select({ id: operators.id })
      .from(operators)
      .where(and(eq(operators.countryCode, countryCode), eq(operators.name, name), id === undefined ? undefined : ne(operators.id, id)))
      .limit(1);
    if (sameName) throw new ErrorResponse("CONFLICT", { message: "This country already has an operator with this name" });
  }

  await assertPlmnsFree(tx, operator.plmns ?? [], id);
  await assertLinksAreValid(tx, operator.links ?? [], countryCode, id);

  if (brandId !== undefined && brandId !== null) {
    const [brand] = await tx.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId)).limit(1);
    if (!brand) throw new ErrorResponse("BAD_REQUEST", { message: "Brand not found" });
  }
}

export async function replacePlmns(tx: DbTx, operatorId: number, entries: readonly PlmnInput[]): Promise<void> {
  const codes = entries.map((entry) => entry.plmn);
  const primaryCode = entries.find((entry) => entry.role === "primary")?.plmn;

  await tx.delete(plmns).where(and(eq(plmns.operatorId, operatorId), codes.length > 0 ? notInArray(plmns.code, codes) : undefined));
  await tx
    .update(plmns)
    .set({ role: "secondary" })
    .where(and(eq(plmns.operatorId, operatorId), eq(plmns.role, "primary"), primaryCode === undefined ? undefined : ne(plmns.code, primaryCode)));
  if (entries.length === 0) return;

  await tx
    .insert(plmns)
    .values(entries.map(({ plmn, role }) => ({ mcc: plmn.slice(0, MCC_LENGTH), mnc: plmn.slice(MCC_LENGTH), operatorId, role })))
    .onConflictDoUpdate({
      target: plmns.code,
      set: { role: sql`excluded.role`, updatedAt: sql`now()` },
      setWhere: sql`${plmns.operatorId} = excluded.operator_id`,
    });
}

export async function replaceLinks(tx: DbTx, operatorId: number, links: readonly OperatorLinkInput[]): Promise<void> {
  await tx.delete(operatorLinks).where(eq(operatorLinks.operatorId, operatorId));
  if (links.length === 0) return;

  await tx
    .insert(operatorLinks)
    .values(links.map((link) => ({ operatorId, relatedOperatorId: link.operatorId, kind: DATABASE_LINK_KINDS[link.kind] })));
}
