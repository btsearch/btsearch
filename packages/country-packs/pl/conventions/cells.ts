import type { LteSectorRule, OperatorRef } from "../../core/conventions.ts";
import { PLAY_PLMN, PLUS_PLMN, isNetworksMember } from "../operators.ts";

const CONSECUTIVE_SECTOR_COUNT = 3;

function isPlaySequenceStart(ecid: number): boolean {
  const sectorDigit = Math.floor(ecid / 10) % 10;
  return sectorDigit === 1 || sectorDigit === 4 || sectorDigit === 7;
}

function isConsecutiveSequenceStart(ecid: number): boolean {
  const lastDigit = ecid % 10;
  return lastDigit % CONSECUTIVE_SECTOR_COUNT === 0;
}

const PLAY_SECTOR_RULE: LteSectorRule = {
  clidStep: 10,
  isSequenceStart: isPlaySequenceStart,
  supportsFourthSector: true,
};

const CONSECUTIVE_SECTOR_RULE: Omit<LteSectorRule, "supportsFourthSector"> = {
  clidStep: 1,
  isSequenceStart: isConsecutiveSequenceStart,
};

const PLUS_SECTOR_RULE: LteSectorRule = {
  ...CONSECUTIVE_SECTOR_RULE,
  supportsFourthSector: true,
};

const NETWORKS_SECTOR_RULE: LteSectorRule = {
  ...CONSECUTIVE_SECTOR_RULE,
  supportsFourthSector: false,
};

export function lteSectorRule(operator: OperatorRef): LteSectorRule | null {
  if (operator.primaryPlmn === PLAY_PLMN) return PLAY_SECTOR_RULE;
  if (operator.primaryPlmn === PLUS_PLMN) return PLUS_SECTOR_RULE;
  return isNetworksMember(operator) ? NETWORKS_SECTOR_RULE : null;
}

export const hoistedTac = true;
