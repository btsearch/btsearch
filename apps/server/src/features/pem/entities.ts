import { operators } from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { inArray } from "drizzle-orm";

export const MNC_TO_ENTITY: Record<number, string> = {
  26001: "Towerlink Poland Sp. z o.o.",
  26002: "T-Mobile Polska S.A.",
  26003: "Orange Polska S.A.",
  26006: "P4 Sp. z o.o.",
};
export const ENTITY_TO_MNC: Record<string, number> = {
  "Towerlink Poland Sp. z o.o.": 26001,
  "Polkomtel Sp. z o.o.": 26001,
  "T-Mobile Polska S.A.": 26002,
  "Orange Polska S.A.": 26003,
  "P4 Sp. z o.o.": 26006,
};

export async function fetchOperatorsMap(mncs: (number | null | undefined)[]) {
  const uniqueMncs = [...new Set(mncs.filter((mnc): mnc is number => Boolean(mnc)))];
  const rows = uniqueMncs.length ? await db.select().from(operators).where(inArray(operators.mnc, uniqueMncs)) : [];
  return new Map(rows.map((op) => [op.mnc, op]));
}
