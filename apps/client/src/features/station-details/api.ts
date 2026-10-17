import type { OfficialPermit, OfficialPermitInclude } from "@openbts/shared/contract";

import { type OfficialPermitListParams, fetchOfficialPermits } from "@/features/official/api";
import { fetchAllPages } from "@/lib/api";

const PERMITS_PER_PAGE = 200;
const STATION_PERMIT_INCLUDE: OfficialPermitInclude[] = ["sectors", "officialSite", "officialSite.location"];

export function fetchAllOfficialPermits(query: OfficialPermitListParams, signal?: AbortSignal): Promise<OfficialPermit[]> {
  return fetchAllPages((cursor) => fetchOfficialPermits({ ...query, limit: PERMITS_PER_PAGE, cursor }, signal));
}

export function fetchStationPermits(stationId: number, signal?: AbortSignal): Promise<OfficialPermit[]> {
  return fetchAllOfficialPermits({ stationIds: [stationId], include: STATION_PERMIT_INCLUDE }, signal);
}

export async function fetchElevation(latitude: number, longitude: number): Promise<number> {
  const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`);
  if (!res.ok) throw new Error("Failed to fetch elevation");
  const data = (await res.json()) as { elevation: number[] };
  return data.elevation[0];
}
