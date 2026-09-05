import { getNsgLocationTimeUs } from "./locations";
import type { NsgCell, NsgLocation } from "./types";

export const NSG_SIGNAL_MAX_AGE_MS = 10_000;
export const NSG_SIGNAL_UNKNOWN_COLOR = "#94a3b8";
export const NSG_SIGNAL_BANDS: { minimumDbm: number | null; maximumDbm: number | null; color: string }[] = [
  { minimumDbm: -80, maximumDbm: null, color: "#16a34a" },
  { minimumDbm: -90, maximumDbm: -80, color: "#84cc16" },
  { minimumDbm: -100, maximumDbm: -90, color: "#eab308" },
  { minimumDbm: -110, maximumDbm: -100, color: "#f97316" },
  { minimumDbm: null, maximumDbm: -110, color: "#dc2626" },
];

export type NsgSignalSim = Pick<NsgCell, "slotId" | "subId">;
export type NsgSignalStatus = "available" | "missing" | "stale" | "ambiguous" | "invalid";
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

type SignalSnapshot = {
  eventIndex: number;
  timestampUs: bigint;
  serving: NsgCell[];
};

function isRecordedDbm(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= -200 && value <= 0;
}

export function getNsgSignalColor(dbm: number | null): string {
  if (!isRecordedDbm(dbm)) return NSG_SIGNAL_UNKNOWN_COLOR;
  return NSG_SIGNAL_BANDS.find((band) => band.minimumDbm === null || dbm >= band.minimumDbm)?.color ?? NSG_SIGNAL_UNKNOWN_COLOR;
}

function parseTimestampUs(timestampUs: string): bigint | null {
  try {
    return BigInt(timestampUs);
  } catch {
    return null;
  }
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
  const timestampUs = parseTimestampUs(measurement.timestampUs);
  if (timestampUs === null) return unavailable;
  const ageUs = BigInt(playheadUs) - timestampUs;
  if (ageUs < 0n || ageUs > BigInt(NSG_SIGNAL_MAX_AGE_MS * 1000)) return unavailable;
  return { measurement, dbm: measurement.dbm, color: getNsgSignalColor(measurement.dbm) };
}

function locationTime(location: NsgLocation): { timestampUs: bigint | null; basis: NsgSignalPoint["timeBasis"] } {
  const timestampUs = getNsgLocationTimeUs(location);
  return { timestampUs, basis: timestampUs === null ? "unavailable" : location.fixTimestampMs === null ? "record" : "fix" };
}

function signalSnapshots(cells: readonly NsgCell[], sim: NsgSignalSim | null): SignalSnapshot[] {
  if (sim === null || (sim.slotId === null && sim.subId === null)) return [];
  const groups = new Map<number, SignalSnapshot>();
  for (const cell of cells) {
    if (cell.slotId !== sim.slotId || cell.subId !== sim.subId) continue;
    let snapshot = groups.get(cell.eventIndex);
    if (!snapshot) {
      const timestampUs = parseTimestampUs(cell.timestampUs);
      if (timestampUs === null) continue;
      snapshot = { eventIndex: cell.eventIndex, timestampUs, serving: [] };
      groups.set(cell.eventIndex, snapshot);
    }
    if (cell.registered === true) snapshot.serving.push(cell);
  }
  return [...groups.values()].sort((left, right) =>
    left.timestampUs === right.timestampUs ? left.eventIndex - right.eventIndex : left.timestampUs < right.timestampUs ? -1 : 1,
  );
}

function precedingSnapshot(snapshots: SignalSnapshot[], timestampUs: bigint): SignalSnapshot | null {
  let low = 0;
  let high = snapshots.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (snapshots[middle].timestampUs <= timestampUs) low = middle + 1;
    else high = middle;
  }
  return low === 0 ? null : snapshots[low - 1];
}

export function associateNsgSignals(locations: readonly NsgLocation[], cells: readonly NsgCell[], sim: NsgSignalSim | null): NsgSignalTrail {
  const snapshots = signalSnapshots(cells, sim);
  let availableCount = 0;
  let staleCount = 0;
  const points = locations.map((location): NsgSignalPoint => {
    const { timestampUs, basis } = locationTime(location);
    const snapshot = timestampUs === null ? null : precedingSnapshot(snapshots, timestampUs);
    const ageMs = snapshot === null || timestampUs === null ? null : Number(timestampUs - snapshot.timestampUs) / 1000;
    const serving = snapshot?.serving ?? [];
    const measurement = serving.length === 1 ? serving[0] : null;
    let status: NsgSignalStatus = "missing";
    if (basis === "unavailable") status = "invalid";
    else if (ageMs !== null && ageMs > NSG_SIGNAL_MAX_AGE_MS) status = "stale";
    else if (serving.length > 1) status = "ambiguous";
    else if (measurement !== null) status = isRecordedDbm(measurement.dbm) ? "available" : "invalid";
    const dbm = status === "available" ? measurement!.dbm : null;
    if (status === "available") availableCount++;
    if (status === "stale") staleCount++;
    return {
      location,
      dbm,
      color: getNsgSignalColor(dbm),
      status,
      ageMs,
      measurement,
      timestampMs: timestampUs === null ? null : Number(timestampUs / 1000n),
      timeBasis: basis,
    };
  });
  return { points, sim, maxAgeMs: NSG_SIGNAL_MAX_AGE_MS, availableCount, unknownCount: points.length - availableCount, staleCount };
}
