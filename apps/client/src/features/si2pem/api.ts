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
  report_url: string | null;
  internal_station_id: number | null;
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

export type PEMInstallation = {
  station_id: string | null;
  station_name: string | null;
  operator: { name: string; mnc: number } | null;
  entity: string;
  location: Location;
  region: { id: number; name: string } | null;
  published_at: string;
  registration_date: string | null;
  reference_no: string | null;
  installation_file: string | null;
  report_file: string | null;
  internal_station_id: number | null;
};
export type PEMInstallationsResponse = {
  totalCount: number;
  data: PEMInstallation[];
};
type InstallationsParams = {
  page: number;
  limit: number;
  stationId?: string;
  operator?: number;
  region?: number;
};

export async function fetchPEMInstallations(params: InstallationsParams, signal?: AbortSignal): Promise<PEMInstallationsResponse> {
  const searchParams = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.stationId?.trim()) searchParams.set("station_id", params.stationId.trim());
  if (params.operator !== undefined) searchParams.set("operator", String(params.operator));
  if (params.region !== undefined) searchParams.set("region", String(params.region));

  return fetchJson<PEMInstallationsResponse>(`${API_BASE}/pem/installations?${searchParams.toString()}`, { signal });
}
