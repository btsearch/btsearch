import type { Operator, Plmn, PlmnInput } from "../../types";
import { isMcc, isMnc, toPlmn } from "../../utils/plmn";

export type PlmnProblem = "incomplete" | "mccFormat" | "mncFormat";

type PlmnEntry = {
  plmn: string | null;
  problem: PlmnProblem | null;
};

const NON_DIGITS = /\D/g;
const EMPTY_PLMN_ENTRY: PlmnEntry = { plmn: null, problem: null };

export function keepDigits(text: string): string {
  return text.replace(NON_DIGITS, "");
}

export function readPlmnEntry(mcc: string, mnc: string): PlmnEntry {
  if (mcc === "" && mnc === "") return EMPTY_PLMN_ENTRY;
  if (mcc === "" || mnc === "") return { plmn: null, problem: "incomplete" };
  if (!isMcc(mcc)) return { plmn: null, problem: "mccFormat" };
  if (!isMnc(mnc)) return { plmn: null, problem: "mncFormat" };
  return { plmn: toPlmn(mcc, mnc), problem: null };
}

export function findPlmnOwner(operators: readonly Operator[] | undefined, plmn: string | null, exceptOperatorId: number | null): Operator | null {
  if (plmn === null) return null;
  return operators?.find((operator) => operator.id !== exceptOperatorId && operator.plmns.some((entry) => entry.plmn === plmn)) ?? null;
}

export function listPlmnsWithSaved(plmns: readonly Plmn[], replacedPlmn: string | null, saved: PlmnInput): PlmnInput[] {
  const otherPlmns = plmns
    .filter((entry) => entry.plmn !== replacedPlmn && entry.plmn !== saved.plmn)
    .map((entry): PlmnInput => ({ plmn: entry.plmn, role: saved.role === "primary" ? "secondary" : entry.role }));
  return [...otherPlmns, saved];
}

export function listPlmnsWithout(plmns: readonly Plmn[], removedPlmn: string): PlmnInput[] {
  return plmns.filter((entry) => entry.plmn !== removedPlmn).map((entry): PlmnInput => ({ plmn: entry.plmn, role: entry.role }));
}
