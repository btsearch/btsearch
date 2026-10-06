import type { Region, RegionCreate, RegionUpdate } from "../types";
import { deleteRecord, patchData, postData } from "./request";

export function createRegion(body: RegionCreate): Promise<Region> {
  return postData<Region>("regions", body);
}

export function updateRegion(id: number, changes: RegionUpdate): Promise<Region> {
  return patchData<Region>(`regions/${id}`, changes);
}

export function deleteRegion(id: number): Promise<void> {
  return deleteRecord(`regions/${id}`);
}
