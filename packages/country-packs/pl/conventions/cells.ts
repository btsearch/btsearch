import type { CountryConventions, LteSectorRule, OperatorRef } from "../../core/conventions.ts";
import { PLAY_PLMN, PLUS_PLMN, isNetworksMember } from "../operators.ts";

const PLAY_SECTOR_RULE: LteSectorRule = {
  clidStep: 10,
  sequenceStart: { eciDigit: "tens", values: [1, 4, 7] },
  maxSectors: 4,
};

const CONSECUTIVE_SECTOR_RULE: Omit<LteSectorRule, "maxSectors"> = {
  clidStep: 1,
  sequenceStart: { eciDigit: "ones", values: [0, 3, 6, 9] },
};

const PLUS_SECTOR_RULE: LteSectorRule = {
  ...CONSECUTIVE_SECTOR_RULE,
  maxSectors: 4,
};

const NETWORKS_SECTOR_RULE: LteSectorRule = {
  ...CONSECUTIVE_SECTOR_RULE,
  maxSectors: 3,
};

export function lteSectorRule(operator: OperatorRef): LteSectorRule | null {
  if (operator.primaryPlmn === PLAY_PLMN) return PLAY_SECTOR_RULE;
  if (operator.primaryPlmn === PLUS_PLMN) return PLUS_SECTOR_RULE;
  return isNetworksMember(operator) ? NETWORKS_SECTOR_RULE : null;
}

export const sharedAreaCode: CountryConventions["sharedAreaCode"] = { umts: true, lte: true, nr: true };
