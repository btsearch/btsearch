import { isNetworksPartnerMnc } from "@openbts/shared/operatorUtils";

import { unique } from "../../lib/collections.js";

function firstDigitPlace(enbid: number): number {
  return 10 ** (String(enbid).length - 1);
}

function stripFirstDigit(enbid: number): number | null {
  if (enbid <= 9) return null;
  return enbid % firstDigitPlace(enbid);
}

export function lteEnbidKey(mnc: number, enbid: number): string {
  const stripped = isNetworksPartnerMnc(mnc) ? stripFirstDigit(enbid) : null;
  if (stripped === null) return `${mnc}:${enbid}`;
  return `${mnc}:${firstDigitPlace(enbid)}:${stripped}`;
}

export function candidateEnbids(enbid: number): number[] {
  const stripped = stripFirstDigit(enbid);
  if (stripped === null) return [enbid];
  const place = firstDigitPlace(enbid);
  return Array.from({ length: 9 }, (_, i) => stripped + (i + 1) * place);
}

export function candidateLTEEnbids(mnc: number, enbid: number): number[] {
  if (!isNetworksPartnerMnc(mnc)) return [enbid];
  return candidateEnbids(enbid);
}

export const UKE_MATCH_MNCS: ReadonlySet<number> = new Set([26001, 26002, 26003]);

export function ukeFragmentCandidates(mnc: number, enbid: number): string[] {
  const stripped = stripFirstDigit(enbid);
  const ordered = mnc === 26001 ? [enbid, stripped] : [stripped, enbid];
  return unique(ordered).map(String);
}
