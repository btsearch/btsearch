import type { Operator } from "@openbts/shared/contract";

import type { Rat } from "./types";

export type NetworkOption = { code: string; operator: Operator };

export const EXTRA_PLMN_LIMITS: Record<Rat, number> = { gsm: 0, umts: 5, lte: 5, nr: 11 };

export function isSameCodes(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((code) => right.includes(code));
}

export function toPlmnList(ownerPlmn: string | null, extras: readonly string[]): string[] {
  const others = extras.filter((code) => code !== ownerPlmn);
  return ownerPlmn === null ? others : [ownerPlmn, ...others];
}

export function listNetworkOptions(operators: readonly Operator[]): NetworkOption[] {
  return operators.flatMap((operator) => operator.plmns.map((plmn) => ({ code: plmn.plmn, operator })));
}
