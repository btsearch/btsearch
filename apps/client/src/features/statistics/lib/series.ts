import type { Brand, Operator } from "@openbts/shared/contract";

import type { Series } from "../components/statChart";
import { getBrandColor, getOperatorBrand } from "@/features/station-details/station/utils/brands";

export type StatisticsOperator = Pick<Operator, "id" | "name" | "sortPriority"> & { color: string };
export type OperatorLookup = ReadonlyMap<number, StatisticsOperator>;
export type OperatorValue = { group: string; operator: StatisticsOperator; value: number };
type StackedBars = { data: Record<string, string | number>[]; series: Series[] };

const UNRANKED_OPERATOR = Number.MAX_SAFE_INTEGER;

export function toStatisticsOperators(operators: readonly Operator[], brands: readonly Brand[]): Map<number, StatisticsOperator> {
  return new Map(
    operators.map((operator) => [
      operator.id,
      { id: operator.id, name: operator.name, sortPriority: operator.sortPriority, color: getBrandColor(getOperatorBrand(operator, brands)) },
    ]),
  );
}

export function compareOperators(left: StatisticsOperator, right: StatisticsOperator): number {
  return (
    (left.sortPriority ?? UNRANKED_OPERATOR) - (right.sortPriority ?? UNRANKED_OPERATOR) || left.name.localeCompare(right.name) || left.id - right.id
  );
}

export function operatorDataKey(operator: Pick<StatisticsOperator, "id">): string {
  return `operator-${operator.id}`;
}

export function operatorSeries(operators: Iterable<StatisticsOperator>): Series[] {
  const unique = new Map<number, StatisticsOperator>();
  for (const operator of operators) unique.set(operator.id, operator);

  return [...unique.values()]
    .sort(compareOperators)
    .map((operator) => ({ key: operatorDataKey(operator), label: operator.name, color: operator.color }));
}

export function toStackedBars(values: readonly OperatorValue[], groupField: string): StackedBars {
  const groups = new Map<string, Record<string, string | number>>();
  for (const { group, operator, value } of values) {
    const row = groups.get(group) ?? { [groupField]: group };
    const key = operatorDataKey(operator);
    const current = row[key];
    row[key] = (typeof current === "number" ? current : 0) + value;
    groups.set(group, row);
  }

  return { data: [...groups.values()], series: operatorSeries(values.map((value) => value.operator)) };
}
