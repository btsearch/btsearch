const API_BASE = (process.env.API_BASE_URL ?? "http://localhost:3030").replace(/\/$/, "");
const API_V2_BASE = `${API_BASE.replace(/\/api\/v1$/, "")}/api/v2`;

export type Band = { id: number; name: string };

type CellBase = { id: number; bandId: number | null; band?: Band };
export type GsmCell = CellBase & { rat: "gsm"; lac: number; cid: number; isEGsm: boolean };
export type UmtsCell = CellBase & { rat: "umts"; lac: number | null; rnc: number | null; cid: number | null; longCid: number | null };
export type LteCell = CellBase & {
  rat: "lte";
  tac: number | null;
  enbid: number | null;
  clid: number | null;
  eci: number | null;
  pci: number | null;
  supportsIot: boolean;
};
export type NrCell = CellBase & {
  rat: "nr";
  mode: "nsa" | "sa";
  tac: number | null;
  gnbid: number | null;
  clid: number | null;
  nci: number | null;
  pci: number | null;
  supportsRedCap: boolean;
};
export type Cell = GsmCell | UmtsCell | LteCell | NrCell;

export type Brand = { id: number; name: string };
export type Operator = { id: number; name: string; brandId: number | null };
export type Region = { id: number; name: string };

export type StationLocation = { id: number; city: string | null; address: string | null; latitude: number; longitude: number };
export type Location = StationLocation & { region: Region };

export type StationIdentifier = { kind: string; value: string };

export type Station = {
  id: number;
  siteId: string;
  notes: string | null;
  identifiers: StationIdentifier[];
  operator: Operator | null;
  location: Location | null;
  cells: Cell[];
};

export type SearchResult = Omit<Station, "location" | "cells"> & { location: StationLocation | null };

export type Photo = { id: string; urls: { display: string }; selections: { stationId: number; isMain: boolean }[] };

export type LocationWithStations = Location & { stations: Omit<Station, "location">[] };

export type EmfReport = { url: string };

export type ImportRunDataset = { datasetId: number; datasetKey: string; error: string | null };
export type ImportRunSlice = { datasetId: number; outcome: "applied" | "unchanged" | "held" };
export type ImportRunStep = { step: string; startedAt: string | null; finishedAt: string | null; error: string | null };

export type ImportRun = {
  id: string;
  sourceKey: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  error: string | null;
  datasets: ImportRunDataset[];
  startedAt: string | null;
  finishedAt: string | null;
};

export type ImportRunDetail = ImportRun & { slices: ImportRunSlice[]; steps: ImportRunStep[] };

export type OfficialSource = { key: string; shortName: string };

const API_KEY = process.env.API_KEY;

async function apiFetch<T>(path: string): Promise<T> {
  const url = `${API_V2_BASE}/${path}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; errors?: { message?: string }[] };
    throw new Error(body.message ?? body.errors?.[0]?.message ?? `API ${res.status} ${path}`);
  }
  const body = (await res.json()) as { data: T };
  return body.data;
}

export function getStation(id: number): Promise<Station> {
  return apiFetch<Station>(`stations/${id}?include=operator,location.region,cells.band`);
}

export function getStationPhotos(stationId: number): Promise<Photo[]> {
  return apiFetch<Photo[]>(`stations/${stationId}/photos`);
}

export function searchStations(query: string, limit = 25): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit), statuses: "active,awaitingCells,inactive", include: "operator,location" });
  return apiFetch<SearchResult[]>(`search?${params.toString()}`);
}

export function getLocation(id: number): Promise<LocationWithStations> {
  return apiFetch<LocationWithStations>(`locations/${id}?include=region,stations.operator,stations.cells`);
}

export function getStationEmfReports(stationId: number): Promise<EmfReport[]> {
  return apiFetch<EmfReport[]>(`emf/reports?stationId=${stationId}`);
}

export async function getBrands(): Promise<Brand[]> {
  try {
    return await apiFetch<Brand[]>("brands");
  } catch (err) {
    console.error("[api] Failed to load brands:", err);
    return [];
  }
}

export async function getLatestImportRuns(): Promise<ImportRunDetail[]> {
  const runs = await apiFetch<ImportRun[]>("official/import-runs?kinds=import,replay&isDryRun=false");
  const latestRuns = runs.filter((run, index) => runs.findIndex(({ sourceKey }) => sourceKey === run.sourceKey) === index);
  return Promise.all(latestRuns.map((run) => apiFetch<ImportRunDetail>(`official/import-runs/${run.id}`)));
}

export async function getSourceShortNames(): Promise<Map<string, string>> {
  try {
    const sources = await apiFetch<OfficialSource[]>("official/sources");
    return new Map(sources.map((source) => [source.key, source.shortName]));
  } catch (err) {
    console.error("[api] Failed to load official sources:", err);
    return new Map();
  }
}

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL ?? API_BASE).replace(/\/$/, "");
}

export function photoUrl(photo: Photo): string {
  return `${publicBase()}${photo.urls.display}`;
}

export function stationUrl(stationId: number, location: Pick<StationLocation, "latitude" | "longitude">): string {
  return `${publicBase()}/#map=16.00/${location.latitude}/${location.longitude}~f~S${stationId}`;
}
