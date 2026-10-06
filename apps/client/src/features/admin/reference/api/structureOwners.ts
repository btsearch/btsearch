import { queryOptions } from "@tanstack/react-query";

import type { StructureOwner, StructureOwnerCreate, StructureOwnerUpdate } from "../types";
import { REFERENCE_LIST_STALE_TIME, referenceKeys } from "./queryKeys";
import { deleteRecord, patchData, postData } from "./request";
import { fetchV2Data } from "@/lib/api";

export function createStructureOwner(body: StructureOwnerCreate): Promise<StructureOwner> {
  return postData<StructureOwner>("structure-owners", body);
}

export function updateStructureOwner(id: number, changes: StructureOwnerUpdate): Promise<StructureOwner> {
  return patchData<StructureOwner>(`structure-owners/${id}`, changes);
}

export function deleteStructureOwner(id: number): Promise<void> {
  return deleteRecord(`structure-owners/${id}`);
}

export function structureOwnersQueryOptions() {
  return queryOptions({
    queryKey: referenceKeys.structureOwners(),
    queryFn: ({ signal }) => fetchV2Data<StructureOwner[]>("structure-owners", { signal }),
    staleTime: REFERENCE_LIST_STALE_TIME,
  });
}
