import type { Brand, Operator } from "@openbts/shared/contract";

import type { Series } from "./chartData";
import type { BrandLook } from "@/components/cellular/brandMark";
import { getBrandColor, getOperatorBrand } from "@/features/station-details/station/utils/brands";

export type StatisticsOperator = Pick<Operator, "id" | "name" | "sortPriority"> & { color: string; brand: BrandLook | null };
export type OperatorLookup = ReadonlyMap<number, StatisticsOperator>;

const UNRANKED_OPERATOR = Number.MAX_SAFE_INTEGER;

export function toStatisticsOperators(operators: readonly Operator[], brands: readonly Brand[]): Map<number, StatisticsOperator> {
  return new Map(
    operators.map((operator) => {
      const brand = getOperatorBrand(operator, brands);
      return [operator.id, { id: operator.id, name: operator.name, sortPriority: operator.sortPriority, color: getBrandColor(brand), brand }];
    }),
  );
}

export function compareOperators(left: StatisticsOperator, right: StatisticsOperator): number {
  return (
    (left.sortPriority ?? UNRANKED_OPERATOR) - (right.sortPriority ?? UNRANKED_OPERATOR) || left.name.localeCompare(right.name) || left.id - right.id
  );
}

export function listOperators(operators: Iterable<StatisticsOperator>): StatisticsOperator[] {
  const unique = new Map<number, StatisticsOperator>();
  for (const operator of operators) unique.set(operator.id, operator);
  return [...unique.values()].sort(compareOperators);
}

export function operatorDataKey(operator: Pick<StatisticsOperator, "id">): string {
  return `operator-${operator.id}`;
}

export function operatorSeries(operators: Iterable<StatisticsOperator>): Series[] {
  return listOperators(operators).map((operator) => ({ key: operatorDataKey(operator), label: operator.name, color: operator.color }));
}
