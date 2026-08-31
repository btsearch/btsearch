import { API_BASE, fetchJson } from "@/lib/api";
import type { Operator, Region } from "@/types/station";

export type PlannedStatus = "PLANNED" | "COMPLETED" | "CANCELED" | "INACTIVE";
type Lab = { PCA: string; name: string };
type Location = { longitude: number; latitude: number; city: string; address: string };
type DateObj = { from: string; to: string };

export type PlannedPEMStation = {
  id: number | null;
  station_id: string | null;
  location: Location;
  region: Region | null;
  operator: Operator | null;
  lab: Lab | null;
  date: DateObj | null;
  status: PlannedStatus;
  disabled_date?: string | null;
};
export type PlannedPEMsResponse = {
  totalCount: number;
  data: PlannedPEMStation[];
};
type PlannedParams = {
  page: number;
  limit: number;
  status: PlannedStatus;
  operators?: number[];
  stationId?: string;
  operator?: string;
  region?: number;
};

export async function fetchPlannedMeasurements(params: PlannedParams, signal?: AbortSignal): Promise<PlannedPEMsResponse> {
  const searchParams = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    status: params.status,
  });
  if (params.operators?.length) searchParams.set("operators", params.operators.join(","));
  if (params.stationId?.trim()) searchParams.set("station_id", params.stationId.trim());
  if (params.operator) searchParams.set("operator", params.operator);
  if (params.region) searchParams.set("region", String(params.region));

  return fetchJson<PlannedPEMsResponse>(`${API_BASE}/pem/planned?${searchParams.toString()}`, { signal });
}
