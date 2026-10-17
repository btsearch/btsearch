import type { CountryConventions, OperatorRef } from "../../core/conventions.ts";
import { isNetworksMember } from "../operators.ts";

const FIRST_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function splitFirstDigit(enbid: number): { firstDigitPlace: number; withoutFirstDigit: number } {
  const firstDigitPlace = 10 ** (String(enbid).length - 1);
  return { firstDigitPlace, withoutFirstDigit: enbid % firstDigitPlace };
}

export function equivalentEnbids(operator: OperatorRef, enbid: number): number[] {
  if (!isNetworksMember(operator) || enbid <= 9) return [enbid];

  const { firstDigitPlace, withoutFirstDigit } = splitFirstDigit(enbid);
  return FIRST_DIGITS.map((firstDigit) => withoutFirstDigit + firstDigit * firstDigitPlace);
}

export const sharedSite: CountryConventions["sharedSite"] = { copies: ["backhaul", "sectors", "photos"] };
