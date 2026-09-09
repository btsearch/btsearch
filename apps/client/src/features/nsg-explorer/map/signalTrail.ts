import { convertNsgTimestampUsToMs, parseNsgTimestampUs } from "@/lib/nsg-parser";
import type { NsgCell, NsgLocation } from "@/lib/nsg-parser/model";

import {
  MAX_SIGNAL_AGE_MS,
  type ServingCellResolution,
  type SimIdentity,
  createServingCellTimeline,
  resolveServingCellAt,
} from "../cells/servingTimeline";
import { getLocationTimeUs } from "./routeLocations";

export const SIGNAL_UNKNOWN_COLOR = "#94a3b8";
export const SIGNAL_BANDS: { minimumDbm: number | null; maximumDbm: number | null; color: string }[] = [
  { minimumDbm: -80, maximumDbm: null, color: "#16a34a" },
  { minimumDbm: -90, maximumDbm: -80, color: "#84cc16" },
  { minimumDbm: -100, maximumDbm: -90, color: "#eab308" },
  { minimumDbm: -110, maximumDbm: -100, color: "#f97316" },
  { minimumDbm: null, maximumDbm: -110, color: "#dc2626" },
];

export type SignalSim = SimIdentity;
export type SignalStatus = ServingCellResolution["status"];
export type SignalPoint = {
  location: NsgLocation;
  dbm: number | null;
  color: string;
  status: SignalStatus;
  ageMs: number | null;
  measurement: NsgCell | null;
  timestampMs: number | null;
  timeBasis: "fix" | "record" | "unavailable";
};
export type SignalTrail = {
  points: SignalPoint[];
  sim: SignalSim | null;
  maxAgeMs: number;
  availableCount: number;
  unknownCount: number;
  staleCount: number;
};
export type ReplaySignal = { measurement: NsgCell | null; dbm: number | null; color: string };

function isRecordedDbm(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= -200 && value <= 0;
}

function getCellSignalDbm(cell: NsgCell): number | null {
  if (cell.rat === "NR" && cell.sources[0] === "qualcomm-diag" && isRecordedDbm(cell.rsrp)) return cell.rsrp;
  return cell.dbm;
}

export function getSignalColor(dbm: number | null): string {
  if (!isRecordedDbm(dbm)) return SIGNAL_UNKNOWN_COLOR;
  return SIGNAL_BANDS.find((band) => band.minimumDbm === null || dbm >= band.minimumDbm)?.color ?? SIGNAL_UNKNOWN_COLOR;
}

export function getReplaySignal(cells: readonly NsgCell[], playheadMs: number): ReplaySignal {
  const unavailable: ReplaySignal = { measurement: null, dbm: null, color: SIGNAL_UNKNOWN_COLOR };
  const playheadUs = Math.floor(playheadMs * 1000);
  if (!Number.isSafeInteger(playheadUs)) return unavailable;
  let measurement: NsgCell | null = null;
  for (const cell of cells) {
    if (cell.registered !== true) continue;
    if (measurement !== null) return unavailable;
    measurement = cell;
  }
  if (measurement === null) return unavailable;
  const dbm = getCellSignalDbm(measurement);
  if (!isRecordedDbm(dbm)) return unavailable;
  const timestampUs = parseNsgTimestampUs(measurement.timestampUs);
  if (timestampUs === null) return unavailable;
  const ageUs = BigInt(playheadUs) - timestampUs;
  if (ageUs < 0n || ageUs > BigInt(MAX_SIGNAL_AGE_MS * 1000)) return unavailable;
  return { measurement, dbm, color: getSignalColor(dbm) };
}

function locationTime(location: NsgLocation): { timestampUs: bigint | null; timestampMs: number | null; basis: SignalPoint["timeBasis"] } {
  const timestampUs = getLocationTimeUs(location);
  const timestampMs = timestampUs === null ? null : convertNsgTimestampUsToMs(timestampUs);
  let basis: SignalPoint["timeBasis"] = "unavailable";
  if (timestampMs !== null) basis = location.fixTimestampMs === null ? "record" : "fix";
  return { timestampUs, timestampMs, basis };
}

export function createSignalTrail(locations: readonly NsgLocation[], cells: readonly NsgCell[], sim: SignalSim | null): SignalTrail {
  const snapshots = createServingCellTimeline(cells, sim);
  let availableCount = 0;
  let staleCount = 0;
  const points = locations.map((location): SignalPoint => {
    const { timestampUs, timestampMs, basis } = locationTime(location);
    const lookup = timestampMs === null ? null : resolveServingCellAt(snapshots, timestampMs, timestampUs ?? undefined);
    const ageMs = lookup?.ageMs ?? null;
    const measurement = lookup?.resolution.measurement ?? null;
    const signalDbm = measurement === null ? null : getCellSignalDbm(measurement);
    let status: SignalStatus = basis === "unavailable" ? "invalid" : (lookup?.resolution.status ?? "missing");
    if (status === "available" && !isRecordedDbm(signalDbm)) status = "invalid";
    const dbm = status === "available" ? signalDbm : null;
    if (status === "available") availableCount++;
    if (status === "stale") staleCount++;
    return {
      location,
      dbm,
      color: getSignalColor(dbm),
      status,
      ageMs,
      measurement,
      timestampMs,
      timeBasis: basis,
    };
  });
  return { points, sim, maxAgeMs: MAX_SIGNAL_AGE_MS, availableCount, unknownCount: points.length - availableCount, staleCount };
}
