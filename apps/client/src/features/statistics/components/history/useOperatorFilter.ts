import { startTransition, useState } from "react";

import type { OperatorPoint } from "../../lib/chartData";
import { type StatisticsOperator, listOperators, operatorDataKey } from "../../lib/operators";
import { toggleValue } from "@/lib/utils";

type OperatorFilter = {
  menuOperators: StatisticsOperator[];
  selectedIds: number[];
  legendOperators: StatisticsOperator[];
  isolatedId: number | null;
  isolatedKey: string | null;
  toggleOperator: (operatorId: number) => void;
  isolateOperator: (operatorId: number | null) => void;
  isolateSeries: (key: string | null) => void;
};

export function useOperatorFilter(points: readonly OperatorPoint[] | undefined): OperatorFilter {
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<number[]>([]);
  const [isolatedId, setIsolatedId] = useState<number | null>(null);
  const menuOperators = listOperators((points ?? []).map((point) => point.operator));
  const selectedIds =
    points === undefined
      ? selectedOperatorIds
      : selectedOperatorIds.filter((operatorId) => menuOperators.some((operator) => operator.id === operatorId));
  const legendOperators = selectedIds.length === 0 ? menuOperators : menuOperators.filter((operator) => selectedIds.includes(operator.id));
  const isolatedOperator = legendOperators.find((operator) => operator.id === isolatedId);

  function toggleOperator(operatorId: number) {
    const nextIds = toggleValue(selectedIds, operatorId);
    if (isolatedId !== null && nextIds.length > 0 && !nextIds.includes(isolatedId)) setIsolatedId(null);
    startTransition(() => setSelectedOperatorIds(nextIds));
  }

  function isolateSeries(key: string | null) {
    setIsolatedId(legendOperators.find((operator) => operatorDataKey(operator) === key)?.id ?? null);
  }

  return {
    menuOperators,
    selectedIds,
    legendOperators,
    isolatedId: isolatedOperator?.id ?? null,
    isolatedKey: isolatedOperator === undefined ? null : operatorDataKey(isolatedOperator),
    toggleOperator,
    isolateOperator: setIsolatedId,
    isolateSeries,
  };
}
