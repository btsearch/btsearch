import { resolveNrIdentity } from "../../nsg-parser/internal/nrIdentity";
import type {
  NsgCell,
  NsgCellMeasurementRole,
  NsgEvent,
  NsgJsonObject,
  NsgJsonValue,
  NsgLocation,
  NsgLog,
  NsgNrMode,
  NsgTimestamp,
} from "../../nsg-parser/model";
import { isValidLatLng } from "../../nsg-parser/values";
import type { CellrecFileHeader, CellrecProblem, CellrecRecord } from "./container";
import { KIND_EVENT, KIND_FIX, KIND_READING, KIND_SIM_INFO } from "./schema";

const RAT_NAMES: Readonly<Record<string, string>> = { gsm: "GSM", umts: "UMTS", lte: "LTE", nr: "NR" };
const LOCATION_PROVIDERS: Readonly<Record<string, string>> = { gnss: "gps", platformFused: "fused", playServices: "fused", beacondb: "network" };
const UMTS_CID_RADIX = 0x10000;
const E7 = 1e7;
const MILLIMETRES_PER_METRE = 1000;
const MICROSECONDS_PER_MILLISECOND = 1000;

export type CellrecSource = Readonly<{ name: string; size: number }>;
export type CellrecBuildOptions = { gnbidLength?: (mcc: string, mnc: string) => number | null };

type Contents = Readonly<{
  source: CellrecSource;
  header: CellrecFileHeader;
  records: readonly CellrecRecord[];
  problems: readonly CellrecProblem[];
  payloadBytes: number;
}>;

type TimedItem = Readonly<{ t: number; name: string; offset: number; record: CellrecRecord | null; data: NsgJsonObject }>;

function isObject(value: NsgJsonValue | undefined): value is NsgJsonObject {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
}

function objectField(object: NsgJsonObject, key: string): NsgJsonObject {
  const value = object[key];
  return isObject(value) ? value : {};
}

function numberField(object: NsgJsonObject, key: string): number | null {
  const value = object[key];
  return typeof value === "number" ? value : null;
}

function stringField(object: NsgJsonObject, key: string): string | null {
  const value = object[key];
  return typeof value === "string" ? value : null;
}

function objectList(value: NsgJsonValue | undefined): NsgJsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function splitPlmn(plmn: string | null): { mcc: string | null; mnc: string | null } {
  return plmn !== null && /^\d{5,6}$/.test(plmn) ? { mcc: plmn.slice(0, 3), mnc: plmn.slice(3) } : { mcc: null, mnc: null };
}

function withoutKey(object: NsgJsonObject, key: string): NsgJsonObject {
  const { [key]: _omitted, ...rest } = object;
  return rest;
}

class ExplorerLogBuilder {
  readonly events: NsgEvent[] = [];
  readonly cells: NsgCell[] = [];
  readonly locations: NsgLocation[] = [];
  private readonly isDataSimBySlot = new Map<number, boolean>();
  private readonly simPlmnBySlot = new Map<number, string>();
  private readonly measurementsBySlot = new Map<number, NsgJsonObject[]>();

  constructor(
    private readonly startEpochMs: number,
    private readonly options: CellrecBuildOptions,
    initialSims: readonly NsgJsonObject[],
  ) {
    for (const sim of initialSims) this.noteSim(sim);
  }

  timestamp(t: number): NsgTimestamp {
    return {
      elapsedUs: t,
      timestampUs: (BigInt(this.startEpochMs) * 1000n + BigInt(t)).toString(),
      timestampMs: this.startEpochMs + Math.floor(t / MICROSECONDS_PER_MILLISECOND),
    };
  }

  private noteSim(sim: NsgJsonObject): void {
    const slot = numberField(sim, "slot");
    if (slot === null) return;
    if (sim.isPresent === false) {
      this.isDataSimBySlot.delete(slot);
      this.simPlmnBySlot.delete(slot);
      return;
    }
    if (typeof sim.isDataSim === "boolean") this.isDataSimBySlot.set(slot, sim.isDataSim);
    if (typeof sim.simPlmn === "string") this.simPlmnBySlot.set(slot, sim.simPlmn);
  }

  add(item: TimedItem): void {
    const kind = item.record?.kind;
    const slot = numberField(item.data, "slot");
    const data: NsgJsonObject =
      kind === KIND_READING
        ? { ...withoutKey(item.data, "measurements"), slotId: slot, subId: null, default: this.isDefault(slot) }
        : { ...item.data, slotId: slot, subId: null };
    const name = kind === KIND_EVENT ? (stringField(item.data, "type") ?? item.name) : item.name;
    const event: NsgEvent = {
      ...this.timestamp(item.t),
      id: this.events.length,
      name,
      marker: null,
      recordOffset: item.offset,
      streamIndex: slot ?? 0,
      data,
    };
    this.events.push(event);
    if (kind === KIND_READING) this.addReading(event, item.data);
    else if (kind === KIND_FIX) this.addFix(event, item.data);
    else if (kind === KIND_SIM_INFO) this.noteSim(item.data);
  }

  private isDefault(slot: number | null): boolean | null {
    return slot === null ? null : (this.isDataSimBySlot.get(slot) ?? null);
  }

  private addReading(event: NsgEvent, reading: NsgJsonObject): void {
    const slot = numberField(reading, "slot");
    let measurements = objectList(reading.measurements);
    if (slot !== null && measurements.length === 0 && reading.isRepeat === true) measurements = this.measurementsBySlot.get(slot) ?? [];
    else if (slot !== null && measurements.length > 0) this.measurementsBySlot.set(slot, measurements);

    const isNonStandalone = measurements.some((measurement) => measurement.role === "nrSecondary");
    measurements.forEach((measurement, cellIndex) => this.cells.push(this.cellFrom(event, reading, measurement, cellIndex, isNonStandalone)));
  }

  private cellFrom(event: NsgEvent, reading: NsgJsonObject, measurement: NsgJsonObject, cellIndex: number, isNonStandalone: boolean): NsgCell {
    const definition = objectField(measurement, "cell");
    const ratKey = stringField(definition, "rat");
    const rat = (ratKey !== null && RAT_NAMES[ratKey]) || String(definition.rat ?? "unknown").toUpperCase();
    const role = stringField(measurement, "role");
    const signal = objectField(measurement, "signal");
    const isNrLeg = role === "nrSecondary";
    const registered = isNrLeg ? null : typeof measurement.isRegistered === "boolean" ? measurement.isRegistered : role === "serving";
    const isNrNeighbour = isNonStandalone && rat === "NR" && !isNrLeg && registered !== true;
    const measurementRole: NsgCellMeasurementRole | undefined = isNrLeg
      ? "nr-primary"
      : isNrNeighbour
        ? "nr-neighbor"
        : isNonStandalone && rat === "LTE" && registered === true
          ? "lte-secondary"
          : undefined;
    const nrMode: NsgNrMode | null = rat !== "NR" ? null : isNrLeg || isNrNeighbour ? "NSA" : registered === true ? "SA" : null;
    const channel = numberField(definition, "channel");
    const carrierIndex = isNrLeg || isNrNeighbour ? numberField(measurement, "carrier") : null;
    const ownsReadingContext = registered === true || isNrLeg;
    const plmn = stringField(definition, "plmn") ?? (ownsReadingContext ? stringField(reading, "registeredPlmn") : null);
    const { mcc, mnc } = splitPlmn(plmn);
    const areaCode = numberField(definition, "areaCode");
    const cellNumber = numberField(definition, "cellNumber");
    const code = numberField(definition, "code");
    const slot = numberField(reading, "slot");
    const bands = Array.isArray(definition.bands) ? definition.bands.filter((band): band is number => typeof band === "number") : null;
    const nodeIdBits = numberField(definition, "nodeIdBits");
    const nrIdentity =
      rat === "NR"
        ? resolveNrIdentity(
            nodeIdBits === null ? {} : { gnbidLength: nodeIdBits },
            cellNumber,
            mcc !== null && mnc !== null ? (this.options.gnbidLength?.(mcc, mnc) ?? null) : null,
          )
        : { gnbid: null, gnbidLength: null, clid: null, nrIdentitySource: null };
    const level = (lteKey: string, nrKey: string) => numberField(signal, rat === "NR" ? nrKey : lteKey);
    const rsrp = level("rsrpDbm", "ssRsrpDbm");
    const dbm = rat === "GSM" ? numberField(signal, "rssiDbm") : rat === "UMTS" ? numberField(signal, "rscpDbm") : rsrp;

    return {
      ...this.timestamp(event.elapsedUs),
      eventIndex: event.id,
      cellIndex,
      recordOffset: event.recordOffset,
      rat,
      registered,
      measurementRole,
      nrMode,
      sources: ["android-telephony"],
      subId: null,
      slotId: slot,
      isDefaultSubscription: this.isDefault(slot),
      simPlmn: slot === null ? null : (this.simPlmnBySlot.get(slot) ?? null),
      mcc,
      mnc,
      operatorName: ownsReadingContext ? stringField(reading, "networkName") : null,
      lac: rat === "GSM" || rat === "UMTS" ? areaCode : null,
      rnc: rat === "UMTS" && cellNumber !== null ? Math.floor(cellNumber / UMTS_CID_RADIX) : null,
      cid: rat === "GSM" ? cellNumber : rat === "UMTS" && cellNumber !== null ? cellNumber % UMTS_CID_RADIX : null,
      tac: rat === "LTE" || rat === "NR" ? areaCode : null,
      nci: rat === "NR" ? cellNumber : null,
      ...nrIdentity,
      eci: rat === "LTE" ? cellNumber : null,
      pci: rat === "LTE" || rat === "NR" ? code : null,
      earfcn: rat === "LTE" ? channel : null,
      arfcn: rat === "GSM" || rat === "NR" ? channel : null,
      uarfcn: rat === "UMTS" ? channel : null,
      psc: rat === "UMTS" ? code : null,
      bsic: rat === "GSM" ? code : null,
      dbm,
      rssi: numberField(signal, "rssiDbm"),
      rsrp,
      rsrq: level("rsrqDb", "ssRsrqDb"),
      sinr: level("rssnrDb", "ssSinrDb"),
      ecno: numberField(signal, "ecNoDb"),
      ta: numberField(signal, "timingAdvance"),
      ber: numberField(signal, "bitErrorRate"),
      bands,
      raw: { type: ratKey ?? rat.toLowerCase(), ...measurement, ...(carrierIndex === null ? {} : { carrierIndex }) },
    };
  }

  private addFix(event: NsgEvent, fix: NsgJsonObject): void {
    const latitudeE7 = numberField(fix, "latitudeE7");
    const longitudeE7 = numberField(fix, "longitudeE7");
    if (latitudeE7 === null || longitudeE7 === null) return;
    const latitude = latitudeE7 / E7;
    const longitude = longitudeE7 / E7;
    if (!isValidLatLng(latitude, longitude)) return;
    const metres = (key: string) => {
      const millimetres = numberField(fix, key);
      return millimetres === null ? null : millimetres / MILLIMETRES_PER_METRE;
    };
    const origin = stringField(fix, "origin");
    const gnssTimeOffsetMicros = numberField(fix, "gnssTimeOffsetMicros");
    this.locations.push({
      ...this.timestamp(event.elapsedUs),
      eventIndex: event.id,
      latitude,
      longitude,
      accuracy: metres("accuracyMm"),
      altitude: metres("altitudeMm"),
      speed: metres("speedMmPerS"),
      provider: origin === null ? null : (LOCATION_PROVIDERS[origin] ?? origin),
      fixTimestampMs:
        gnssTimeOffsetMicros === null
          ? null
          : this.startEpochMs + Math.floor((event.elapsedUs + gnssTimeOffsetMicros) / MICROSECONDS_PER_MILLISECOND),
    });
  }
}

function startEpochMillis(info: NsgJsonObject, records: readonly CellrecRecord[]): number {
  const fromHeader = numberField(objectField(info, "trip"), "startEpochMillis");
  if (fromHeader !== null) return fromHeader;
  const tripStart = records.find((record) => record.name === "tripStart");
  return (tripStart ? numberField(tripStart.body, "startEpochMillis") : null) ?? numberField(info, "createdEpochMillis") ?? 0;
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

export function buildExplorerLog({ source, header, records, problems, payloadBytes }: Contents, options: CellrecBuildOptions): NsgLog {
  const startEpochMs = startEpochMillis(header.info, records);
  const builder = new ExplorerLogBuilder(startEpochMs, options, objectList(header.info.sims));
  const timed: TimedItem[] = [
    ...records.flatMap((record) => (record.t === null ? [] : [{ t: record.t, name: record.name, offset: record.offset, record, data: record.body }])),
    ...problems.map((problem) => ({
      t: problem.t,
      name: "readProblem",
      offset: problem.offset,
      record: null,
      data: { kind: problem.kind, sequence: problem.sequence, message: problem.message },
    })),
  ].sort((left, right) => left.t - right.t);
  for (const item of timed) builder.add(item);

  const lastT = timed.at(-1)?.t ?? 0;
  return {
    format: "cellrec",
    sourceName: source.name,
    sourceBytes: source.size,
    headerXml: JSON.stringify({ formatMinor: header.formatMinor, ...header.info }, null, 2),
    startTimestampUs: (BigInt(startEpochMs) * 1000n).toString(),
    startTimestampMs: startEpochMs,
    endTimestampMs: builder.timestamp(lastT).timestampMs,
    durationSeconds: lastT / 1_000_000,
    recordCount: records.length,
    recordTypeCounts: countBy(records, (record) => record.name),
    eventTypeCounts: countBy(builder.events, (event) => event.name),
    timeRegressions: 0,
    recognizedPayloadBytes: payloadBytes,
    servingCellCount: builder.cells.reduce((count, cell) => count + (cell.registered === true ? 1 : 0), 0),
    signalingRecordCount: 0,
    signalingTruncated: false,
    inputTruncated: problems.some((problem) => problem.kind === "truncated"),
    events: builder.events,
    cells: builder.cells,
    signaling: [],
    locations: builder.locations,
  };
}
