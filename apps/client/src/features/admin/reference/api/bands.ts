import type { Band, BandCreate, BandUpdate } from "../types";
import { deleteRecord, patchData, postData } from "./request";
import type { AuditOperationHandle } from "@/lib/api";

export function createBand(body: BandCreate, auditOperation?: AuditOperationHandle): Promise<Band> {
  return postData<Band>("bands", body, auditOperation);
}

export function updateBand(id: number, changes: BandUpdate): Promise<Band> {
  return patchData<Band>(`bands/${id}`, changes);
}

export function deleteBand(id: number): Promise<void> {
  return deleteRecord(`bands/${id}`);
}
