import { capabilitiesFor } from "@openbts/country-packs";
import type { Operator } from "@openbts/shared/contract";

import type { Rat } from "./types";

export type NetworkOption = { code: string; operator: Operator };

export const EXTRA_PLMN_LIMITS: Readonly<Record<Rat, number>> = { gsm: 0, umts: 5, lte: 5, nr: 11 };
const NO_EXTRA_PLMNS: Readonly<Record<Rat, number>> = { gsm: 0, umts: 0, lte: 0, nr: 0 };

export function extraPlmnLimitsFor(countryCode: string | null): Readonly<Record<Rat, number>> {
  return countryCode === null || capabilitiesFor(countryCode).cellNetworks ? EXTRA_PLMN_LIMITS : NO_EXTRA_PLMNS;
}

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
