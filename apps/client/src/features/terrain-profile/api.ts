import { API_BASE, fetchJson } from "@/lib/api";

import type { TerrainProfileAnalysis, TerrainProfileAnalysisRequest } from "./types";

type TerrainProfileEnvelope = { data: TerrainProfileAnalysis };

export async function createTerrainProfileAnalysis(request: TerrainProfileAnalysisRequest, signal?: AbortSignal) {
  const response = await fetchJson<TerrainProfileEnvelope>(`${API_BASE}/terrain-profile/analyses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  return response.data;
}

export async function fetchTerrainProfileAnalysis(analysisId: string, signal?: AbortSignal) {
  const response = await fetchJson<TerrainProfileEnvelope>(`${API_BASE}/terrain-profile/analyses/${encodeURIComponent(analysisId)}`, { signal });
  return response.data;
}

export async function cancelTerrainProfileAnalysis(analysisId: string) {
  await fetch(`${API_BASE}/terrain-profile/analyses/${encodeURIComponent(analysisId)}`, { method: "DELETE" }).catch(() => {});
}
