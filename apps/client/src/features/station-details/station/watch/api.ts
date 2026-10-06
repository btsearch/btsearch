import type { StationWatch } from "@openbts/shared/contract";

import { API_V2_BASE, fetchJson, fetchV2Data } from "@/lib/api";

export const stationWatchKeys = {
  status: (stationId: number) => ["station-watch", "internal", stationId, "v2"] as const,
};

export async function fetchIsStationWatched(stationId: number, signal?: AbortSignal): Promise<boolean> {
  const watch = await fetchV2Data<StationWatch>(`stations/${stationId}/watch`, { signal });
  return watch.isWatched;
}

export async function watchStation(stationId: number): Promise<void> {
  await fetchJson(`${API_V2_BASE}/stations/${stationId}/watch`, { method: "PUT" });
}

export async function unwatchStation(stationId: number): Promise<void> {
  await fetchJson(`${API_V2_BASE}/stations/${stationId}/watch`, { method: "DELETE" });
}
