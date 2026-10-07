import type { Brand, BrandCreate, BrandUpdate } from "../types";
import { deleteRecord, patchData, postData, putData } from "./request";
import type { AuditOperationHandle } from "@/lib/api";

export const BRAND_LOGO_MAX_BYTES = 512 * 1024;
export const BRAND_LOGO_TYPES: readonly string[] = ["image/svg+xml", "image/png", "image/webp"];

const LOGO_FILE_PART = "file";

export function createBrand(body: BrandCreate, auditOperation?: AuditOperationHandle): Promise<Brand> {
  return postData<Brand>("brands", body, auditOperation);
}

export function updateBrand(id: number, changes: BrandUpdate): Promise<Brand> {
  return patchData<Brand>(`brands/${id}`, changes);
}

export function deleteBrand(id: number): Promise<void> {
  return deleteRecord(`brands/${id}`);
}

export function uploadBrandLogo(id: number, file: File, auditOperation?: AuditOperationHandle): Promise<Brand> {
  const formData = new FormData();
  formData.append(LOGO_FILE_PART, file);
  return putData<Brand>(`brands/${id}/logo`, formData, auditOperation);
}

export function deleteBrandLogo(id: number): Promise<void> {
  return deleteRecord(`brands/${id}/logo`);
}
