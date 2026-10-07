import type { QueryClient } from "@tanstack/react-query";

import { operatorQueryOptions } from "../../api/operators";
import { invalidateOperators, removeOperatorQueries } from "../../api/queryKeys";
import type { Operator } from "../../types";
import { operatorsQueryOptions } from "@/features/shared/lookups";

export function storeUpdatedOperator(queryClient: QueryClient, operator: Operator): void {
  queryClient.setQueryData(operatorQueryOptions(operator.id).queryKey, operator);
  queryClient.setQueryData(operatorsQueryOptions().queryKey, (operators) =>
    operators?.map((listedOperator) => (listedOperator.id === operator.id ? operator : listedOperator)),
  );
  void invalidateOperators(queryClient);
}

export function discardDeletedOperator(queryClient: QueryClient, operatorId: number): void {
  removeOperatorQueries(queryClient, operatorId);
  queryClient.setQueryData(operatorsQueryOptions().queryKey, (operators) => operators?.filter((listedOperator) => listedOperator.id !== operatorId));
  void invalidateOperators(queryClient);
}
