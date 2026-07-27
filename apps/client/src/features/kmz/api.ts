import { API_BASE, fetchApiData, fetchJson } from "@/lib/api";
import type { Region } from "@/types/station";

export const KMZ_TYPES = ["stations", "radiolines"] as const;
export const KMZ_SOURCES = ["all", "permits", "device_registry"] as const;

export type KmzType = (typeof KMZ_TYPES)[number];
export type KmzSource = (typeof KMZ_SOURCES)[number];

export interface KmzFile {
  date: string;
  type: KmzType;
  source: KmzSource;
  region: Region | null;
  filename: string;
  size: number;
}

export interface KmzListFilters {
  type: KmzType;
  source: KmzSource;
  date: string | null;
  region: string | null;
}

interface KmzListResponse {
  data: KmzFile[];
  totalCount: number;
}

export function fetchKmzList({ type, source, date, region }: KmzListFilters): Promise<KmzListResponse> {
  const params = new URLSearchParams({ type, source, limit: "50" });
  if (date) params.set("date", date);
  if (region) params.set("region", region);
  return fetchJson<KmzListResponse>(`${API_BASE}/kmz?${params.toString()}`);
}

export function fetchKmzDates(type: KmzType, source: KmzSource): Promise<string[]> {
  const params = new URLSearchParams({ type, source });
  return fetchApiData<string[]>(`kmz/dates?${params.toString()}`);
}

export const UNKNOWN_REGION_CODE = "UNKNOWN";

export function isNewKmzFile(file: KmzFile): boolean {
  return file.filename.startsWith(`${file.type}_new_`);
}

export function isUnknownRegionKmzFile(file: KmzFile): boolean {
  return file.filename.endsWith(`_${UNKNOWN_REGION_CODE}.kmz`);
}

export async function downloadKmzFile(file: KmzFile): Promise<boolean> {
  const { date, type, source, region } = file;
  const params = new URLSearchParams({ date, type, source });
  if (region) params.set("region", region.code);
  else if (isUnknownRegionKmzFile(file)) params.set("region", UNKNOWN_REGION_CODE);
  if (isNewKmzFile(file)) params.set("new", "true");

  try {
    const response = await fetch(`${API_BASE}/kmz/download?${params.toString()}`);
    if (!response.ok) return false;

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = file.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
    return true;
  } catch {
    return false;
  }
}
