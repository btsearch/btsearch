import { getNsgLocationTimeUs } from "./locations";
import {
  NSG_SIGNAL_MAX_AGE_MS,
  type NsgServingCellResolution,
  type NsgSimIdentity,
  createNsgServingCellTimeline,
  resolveNsgServingCellAt,
} from "./servingCells";
import { convertNsgTimestampUsToMs, parseNsgTimestampUs } from "./timestamp";
import type { NsgCell, NsgLocation } from "./types";

export { NSG_SIGNAL_MAX_AGE_MS, createNsgServingCellTimeline, resolveNsgServingCellAt } from "./servingCells";
export type { NsgServingCellResolution, NsgServingCellScope, NsgServingCellSnapshot } from "./servingCells";
export { parseNsgTimestampMs, parseNsgTimestampUs } from "./timestamp";

export const NSG_SIGNAL_UNKNOWN_COLOR = "#94a3b8";
export const NSG_SIGNAL_BANDS: { minimumDbm: number | null; maximumDbm: number | null; color: string }[] = [
  { minimumDbm: -80, maximumDbm: null, color: "#16a34a" },
  { minimumDbm: -90, maximumDbm: -80, color: "#84cc16" },
  { minimumDbm: -100, maximumDbm: -90, color: "#eab308" },
  { minimumDbm: -110, maximumDbm: -100, color: "#f97316" },
  { minimumDbm: null, maximumDbm: -110, color: "#dc2626" },
];

export type NsgSignalSim = NsgSimIdentity;
export type NsgSignalStatus = NsgServingCellResolution["status"];
export type NsgSignalPoint = {
  location: NsgLocation;
  dbm: number | null;
  color: string;
  status: NsgSignalStatus;
  ageMs: number | null;
  measurement: NsgCell | null;
  timestampMs: number | null;
  timeBasis: "fix" | "record" | "unavailable";
};
export type NsgSignalTrail = {
  points: NsgSignalPoint[];
  sim: NsgSignalSim | null;
  maxAgeMs: number;
  availableCount: number;
  unknownCount: number;
  staleCount: number;
};
export type NsgReplaySignal = { measurement: NsgCell | null; dbm: number | null; color: string };

function isRecordedDbm(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= -200 && value <= 0;
}

export function getNsgSignalColor(dbm: number | null): string {
  if (!isRecordedDbm(dbm)) return NSG_SIGNAL_UNKNOWN_COLOR;
  return NSG_SIGNAL_BANDS.find((band) => band.minimumDbm === null || dbm >= band.minimumDbm)?.color ?? NSG_SIGNAL_UNKNOWN_COLOR;
}

export function getNsgReplaySignal(cells: readonly NsgCell[], playheadMs: number): NsgReplaySignal {
  const unavailable: NsgReplaySignal = { measurement: null, dbm: null, color: NSG_SIGNAL_UNKNOWN_COLOR };
  const playheadUs = Math.floor(playheadMs * 1000);
  if (!Number.isSafeInteger(playheadUs)) return unavailable;
  let measurement: NsgCell | null = null;
  for (const cell of cells) {
    if (cell.registered !== true) continue;
    if (measurement !== null) return unavailable;
    measurement = cell;
  }
  if (measurement === null || !isRecordedDbm(measurement.dbm)) return unavailable;
  const timestampUs = parseNsgTimestampUs(measurement.timestampUs);
  if (timestampUs === null) return unavailable;
  const ageUs = BigInt(playheadUs) - timestampUs;
  if (ageUs < 0n || ageUs > BigInt(NSG_SIGNAL_MAX_AGE_MS * 1000)) return unavailable;
  return { measurement, dbm: measurement.dbm, color: getNsgSignalColor(measurement.dbm) };
}

function locationTime(location: NsgLocation): { timestampUs: bigint | null; timestampMs: number | null; basis: NsgSignalPoint["timeBasis"] } {
  const timestampUs = getNsgLocationTimeUs(location);
  const timestampMs = timestampUs === null ? null : convertNsgTimestampUsToMs(timestampUs);
  let basis: NsgSignalPoint["timeBasis"] = "unavailable";
  if (timestampMs !== null) basis = location.fixTimestampMs === null ? "record" : "fix";
  return { timestampUs, timestampMs, basis };
}

export function associateNsgSignals(locations: readonly NsgLocation[], cells: readonly NsgCell[], sim: NsgSignalSim | null): NsgSignalTrail {
  const snapshots = createNsgServingCellTimeline(cells, sim);
  let availableCount = 0;
  let staleCount = 0;
  const points = locations.map((location): NsgSignalPoint => {
    const { timestampUs, timestampMs, basis } = locationTime(location);
    const lookup = timestampMs === null ? null : resolveNsgServingCellAt(snapshots, timestampMs, timestampUs ?? undefined);
    const ageMs = lookup?.ageMs ?? null;
    const measurement = lookup?.resolution.measurement ?? null;
    let status: NsgSignalStatus = basis === "unavailable" ? "invalid" : (lookup?.resolution.status ?? "missing");
    if (status === "available" && !isRecordedDbm(measurement?.dbm ?? null)) status = "invalid";
    const dbm = status === "available" && measurement !== null ? measurement.dbm : null;
    if (status === "available") availableCount++;
    if (status === "stale") staleCount++;
    return {
      location,
      dbm,
      color: getNsgSignalColor(dbm),
      status,
      ageMs,
      measurement,
      timestampMs,
      timeBasis: basis,
    };
  });
  return { points, sim, maxAgeMs: NSG_SIGNAL_MAX_AGE_MS, availableCount, unknownCount: points.length - availableCount, staleCount };
}
