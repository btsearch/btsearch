import { PLMN_TO_SI2PEM_NAME, SI2PEM_NAME_TO_PLMN } from "@openbts/country-packs";
import { operators } from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { inArray } from "drizzle-orm";

export function si2pemNameToMnc(name: string | null | undefined): number | undefined {
  const plmn = SI2PEM_NAME_TO_PLMN[name ?? ""];
  return plmn === undefined ? undefined : Number(plmn);
}

export function mncToSi2pemName(mnc: number): string | undefined {
  return PLMN_TO_SI2PEM_NAME[String(mnc)];
}

export async function fetchOperatorsMap(mncs: (number | null | undefined)[]) {
  const uniqueMncs = [...new Set(mncs.filter((mnc): mnc is number => Boolean(mnc)))];
  const rows = uniqueMncs.length ? await db.select().from(operators).where(inArray(operators.mnc, uniqueMncs)) : [];
  return new Map(rows.map((op) => [op.mnc, op]));
}
