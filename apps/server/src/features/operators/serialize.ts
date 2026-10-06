import { operatorLinks, operators, plmns } from "@openbts/drizzle";
import type { Operator, OperatorLinkKind, Plmn } from "@openbts/shared/contract";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

const operatorSelectSchema = createSelectSchema(operators);
const plmnSelectSchema = createSelectSchema(plmns);
const operatorLinkSelectSchema = createSelectSchema(operatorLinks);

export type OperatorRow = z.infer<typeof operatorSelectSchema>;
type PlmnRow = Pick<z.infer<typeof plmnSelectSchema>, "mcc" | "mnc" | "code" | "role">;
export type OperatorLinkRow = Pick<z.infer<typeof operatorLinkSelectSchema>, "kind" | "relatedOperatorId">;

export type OperatorDetails = { plmns: PlmnRow[]; links: OperatorLinkRow[] };

export const MCC_LENGTH = 3;
const SHORTEST_PLMN_LENGTH = 5;

const LINK_KINDS = { jv_member: "jvMember" } as const satisfies Record<OperatorLinkRow["kind"], OperatorLinkKind>;

function toPlmns(row: OperatorRow, plmnRows: readonly PlmnRow[]): Plmn[] {
  const operatorPlmns = plmnRows.map(({ mcc, mnc, code, role }): Plmn => ({ mcc, mnc, plmn: code, role }));
  if (row.mnc === null || operatorPlmns.some((plmn) => plmn.role === "primary")) return operatorPlmns;

  const primaryCode = String(row.mnc).padStart(SHORTEST_PLMN_LENGTH, "0");
  const primary: Plmn = { mcc: primaryCode.slice(0, MCC_LENGTH), mnc: primaryCode.slice(MCC_LENGTH), plmn: primaryCode, role: "primary" };
  return [primary, ...operatorPlmns.filter((plmn) => plmn.plmn !== primaryCode)];
}

export function toOperator(row: OperatorRow, details: OperatorDetails | undefined): Operator {
  const operatorPlmns = toPlmns(row, details?.plmns ?? []);

  return {
    id: row.id,
    countryCode: row.countryCode,
    brandId: row.brandId,
    name: row.name,
    legalName: row.full_name,
    shortCode: row.shortCode,
    sortPriority: row.sortPriority,
    primaryPlmn: operatorPlmns.find((plmn) => plmn.role === "primary")?.plmn ?? null,
    plmns: operatorPlmns,
    links: (details?.links ?? []).map((link) => ({ kind: LINK_KINDS[link.kind], operatorId: link.relatedOperatorId })),
  };
}
