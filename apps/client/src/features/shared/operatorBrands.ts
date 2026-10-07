import type { Operator } from "@openbts/shared/contract";

export function findOperatorForPlmn(operators: readonly Operator[] | undefined, plmn: string | null | undefined): Operator | null {
  if (operators === undefined || plmn === null || plmn === undefined) return null;
  let match: Operator | null = null;
  for (const operator of operators) {
    if (!operator.plmns.some((entry) => entry.plmn === plmn)) continue;
    if (match !== null && match.id !== operator.id) return null;
    match ??= operator;
  }
  return match;
}
