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
