import type { TerrainProfileCreate } from "@openbts/shared/contract";

import type { TerrainProfileRecord, TerrainProfileRequest } from "./types";
import { API_V2_BASE, ApiResponseError, BackendUnavailableError, RateLimitError, fetchJson, fetchV2Data } from "@/lib/api";

const POLL_INTERVAL_MS = 2000;
const PROFILE_INCLUDE = "candidates";
const JSON_HEADERS = { "Content-Type": "application/json" };
const REJECTED_RECEIVER_STATUS = 400;

export type TerrainRequestFailure = "rejectedReceiver" | "rateLimited" | "sourceUnavailable" | "unknown";

export class TerrainProfileCancelledError extends Error {
  constructor() {
    super("The terrain profile was cancelled");
  }
}

function toTerrainProfileCreate({ station, receiver, antennaKey }: TerrainProfileRequest): TerrainProfileCreate {
  const body: TerrainProfileCreate = {
    receiver: { latitude: receiver.latitude, longitude: receiver.longitude, heightMeters: receiver.heightMeters },
  };
  if (station.source === "internal") body.stationId = station.id;
  else body.officialSiteId = station.id;
  if (antennaKey !== undefined) body.antennaKey = antennaKey;
  return body;
}

function toProfilePath(profileId: string): string {
  return `terrain-profiles/${encodeURIComponent(profileId)}`;
}

function createTerrainProfile(request: TerrainProfileRequest): Promise<TerrainProfileRecord> {
  return fetchV2Data<TerrainProfileRecord>(`terrain-profiles?include=${PROFILE_INCLUDE}`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(toTerrainProfileCreate(request)),
  });
}

function fetchTerrainProfile(profileId: string, signal: AbortSignal): Promise<TerrainProfileRecord> {
  return fetchV2Data<TerrainProfileRecord>(`${toProfilePath(profileId)}?include=${PROFILE_INCLUDE}`, { signal });
}

async function cancelTerrainProfile(profileId: string): Promise<void> {
  await fetchJson(`${API_V2_BASE}/${toProfilePath(profileId)}`, { method: "DELETE" }).catch(() => undefined);
}

function waitForNextPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(finishWaiting, POLL_INTERVAL_MS);

    function finishWaiting() {
      signal.removeEventListener("abort", stopWaiting);
      resolve();
    }

    function stopWaiting() {
      window.clearTimeout(timer);
      reject(signal.reason);
    }

    if (signal.aborted) stopWaiting();
    else signal.addEventListener("abort", stopWaiting, { once: true });
  });
}

async function pollUntilSettled(profile: TerrainProfileRecord, signal: AbortSignal): Promise<TerrainProfileRecord> {
  if (profile.status !== "pending") return profile;
  await waitForNextPoll(signal);
  return pollUntilSettled(await fetchTerrainProfile(profile.id, signal), signal);
}

async function fetchUntilSettled(started: TerrainProfileRecord, signal: AbortSignal): Promise<TerrainProfileRecord> {
  try {
    return await pollUntilSettled(started, signal);
  } catch (error) {
    if (signal.aborted) void cancelTerrainProfile(started.id);
    throw error;
  }
}

async function requestTerrainProfile(request: TerrainProfileRequest, signal: AbortSignal): Promise<TerrainProfileRecord> {
  const started = await createTerrainProfile(request);
  if (signal.aborted) {
    if (started.status === "pending") void cancelTerrainProfile(started.id);
    throw signal.reason;
  }
  return fetchUntilSettled(started, signal);
}

export async function fetchSettledTerrainProfile(request: TerrainProfileRequest, signal: AbortSignal): Promise<TerrainProfileRecord> {
  const settled = await requestTerrainProfile(request, signal);
  if (settled.status !== "cancelled") return settled;
  if (signal.aborted) throw signal.reason;

  const repeated = await requestTerrainProfile(request, signal);
  if (repeated.status === "cancelled") throw new TerrainProfileCancelledError();
  return repeated;
}

export function classifyTerrainRequestError(error: unknown): TerrainRequestFailure {
  if (error instanceof RateLimitError) return "rateLimited";
  if (error instanceof BackendUnavailableError) return "sourceUnavailable";
  if (error instanceof ApiResponseError && error.status === REJECTED_RECEIVER_STATUS) return "rejectedReceiver";
  return "unknown";
}
