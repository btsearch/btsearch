import { queryOptions } from "@tanstack/react-query";

import type { Operator, OperatorCreate, OperatorUpdate } from "../types";
import { referenceKeys } from "./queryKeys";
import { deleteRecord, fetchDataOrNull, patchData, postData } from "./request";
import { isRecordId } from "@/lib/apiValues";

export async function fetchOperator(id: number, signal?: AbortSignal): Promise<Operator | null> {
  if (!isRecordId(id)) return null;
  return fetchDataOrNull<Operator>(`operators/${id}`, signal);
}

export function createOperator(body: OperatorCreate): Promise<Operator> {
  return postData<Operator>("operators", body);
}

export function updateOperator(id: number, changes: OperatorUpdate): Promise<Operator> {
  return patchData<Operator>(`operators/${id}`, changes);
}

export function deleteOperator(id: number): Promise<void> {
  return deleteRecord(`operators/${id}`);
}

export function operatorQueryOptions(id: number) {
  return queryOptions({
    queryKey: referenceKeys.operator(id),
    queryFn: ({ signal }) => fetchOperator(id, signal),
    staleTime: 0,
  });
}
