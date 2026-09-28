import { TOP4_MNCS, getOperatorSortIndex } from "@openbts/shared/operatorUtils";

import type { Operator } from "@/types/station";

export {
  getOperatorColor,
  getOperatorColorByName,
  resolveOperatorMnc,
  normalizeOperatorName,
  getMnoBrand,
  getOperatorSortIndex,
  normalizeCityForMNOName,
  TOP4_MNCS,
  EXTRA_IDENTIFICATORS_MNCS,
  MNO_NAME_ONLY_MNCS,
  MNO_BRAND,
} from "@openbts/shared/operatorUtils";

export function getOperatorTintGradient(color: string): string {
  return `linear-gradient(115deg, ${color}18 0%, ${color}08 38%, transparent 72%)`;
}

export function getOperatorHeaderTintGradient(color: string): string {
  return `linear-gradient(115deg, ${color}24 0%, ${color}0f 34%, transparent 70%)`;
}

export function partitionOperators(operators: Operator[]): { top: Operator[]; other: Operator[] } {
  const top: Operator[] = [];
  const other: Operator[] = [];

  for (const operator of operators) {
    if (TOP4_MNCS.includes(operator.mnc)) top.push(operator);
    else other.push(operator);
  }

  top.sort((left, right) => getOperatorSortIndex(left.mnc) - getOperatorSortIndex(right.mnc));

  return { top, other };
}
