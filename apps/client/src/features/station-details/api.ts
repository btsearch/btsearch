import { API_BASE, fetchApiData, fetchJson } from "@/lib/api";
import type { Station, UkePermit, UkeStation } from "@/types/station";

export const fetchStation = (id: number) => fetchApiData<Station>(`stations/${id}`);

export const fetchUkeStation = (id: number) => fetchApiData<UkeStation>(`uke/stations/${id}`);
export const fetchStationPermits = (stationId: number) =>
  fetchApiData<UkePermit[]>(`stations/${stationId}/permits`, { allowedErrors: [404] }).then((permits) => permits ?? []);
export const fetchUkePermit = (id: string) => fetchApiData<UkePermit[]>(`uke/permits?station_id=${id}`);

export async function fetchIsUkeStationWatched(ukeStationId: number): Promise<boolean> {
  const status = await fetchApiData<{ watched: boolean }>(`uke/stations/${ukeStationId}/watch`);
  return status.watched;
}

export async function watchUkeStation(ukeStationId: number): Promise<void> {
  await fetchJson(`${API_BASE}/uke/stations/${ukeStationId}/watch`, { method: "POST" });
}

export async function unwatchUkeStation(ukeStationId: number): Promise<void> {
  await fetchJson(`${API_BASE}/uke/stations/${ukeStationId}/watch`, { method: "DELETE" });
}

export async function fetchElevation(latitude: number, longitude: number): Promise<number> {
  const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`);
  if (!res.ok) throw new Error("Failed to fetch elevation");
  const data = (await res.json()) as { elevation: number[] };
  return data.elevation[0];
}
