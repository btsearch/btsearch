import type { SpectrumHolding, SpectrumHoldingCreate, SpectrumHoldingUpdate } from "../types";
import { deleteRecord, patchData, postData } from "./request";

export function createSpectrumHolding(body: SpectrumHoldingCreate): Promise<SpectrumHolding> {
  return postData<SpectrumHolding>("spectrum-holdings", body);
}

export function updateSpectrumHolding(id: number, changes: SpectrumHoldingUpdate): Promise<SpectrumHolding> {
  return patchData<SpectrumHolding>(`spectrum-holdings/${id}`, changes);
}

export function deleteSpectrumHolding(id: number): Promise<void> {
  return deleteRecord(`spectrum-holdings/${id}`);
}
