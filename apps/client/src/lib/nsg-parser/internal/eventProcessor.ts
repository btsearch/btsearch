import type { NsgCell, NsgEvent, NsgJsonObject, NsgLocation, NsgParseMode } from "../model";
import { isValidLatLng } from "./coordinates";
import type { DefaultDataSubscriptionChange, LteAnchor } from "./nsa/model";
import { StreamingOperatorState } from "./operatorState";

const MAX_UMTS_CI = 0x0fffffff;
const UMTS_CID_RADIX = 0x10000;

type NsgRadioFields = Pick<
  NsgCell,
  | "lac"
  | "rnc"
  | "cid"
  | "tac"
  | "eci"
  | "pci"
  | "earfcn"
  | "arfcn"
  | "uarfcn"
  | "psc"
  | "bsic"
  | "dbm"
  | "rssi"
  | "rsrp"
  | "rsrq"
  | "sinr"
  | "ecno"
  | "ta"
  | "ber"
>;

export type EventProcessorSink = Readonly<{
  emitCell: (cell: NsgCell) => void;
  retainDefaultDataSubscription: (change: DefaultDataSubscriptionChange) => void;
  retainLteAnchor: (anchor: LteAnchor) => void;
  retainLocation: (location: NsgLocation) => void;
}>;

type Fail = (message: string) => never;

function isObject(value: unknown): value is NsgJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function boolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function umtsIdentity(raw: NsgJsonObject, rat: string): Pick<NsgRadioFields, "rnc" | "cid"> {
  const rnc = numeric(raw.rnc);
  const cid = numeric(raw.cid);
  const ci = numeric(raw.ci);
  if ((rat !== "UMTS" && rat !== "WCDMA") || ci === null || !Number.isInteger(ci) || ci < 0 || ci > MAX_UMTS_CI) return { rnc, cid };
  return {
    rnc: rnc ?? Math.floor(ci / UMTS_CID_RADIX),
    cid: cid ?? ci % UMTS_CID_RADIX,
  };
}

function radioFields(raw: NsgJsonObject, rat: string): NsgRadioFields {
  return {
    lac: numeric(raw.lac),
    ...umtsIdentity(raw, rat),
    tac: numeric(raw.tac),
    eci: numeric(raw.eci),
    pci: numeric(raw.pci),
    earfcn: numeric(raw.earfcn),
    arfcn: numeric(raw.arfcn),
    uarfcn: numeric(raw.uarfcn),
    psc: numeric(raw.psc),
    bsic: numeric(raw.bsic),
    dbm: numeric(raw.dbm),
    rssi: numeric(raw.rssi),
    rsrp: numeric(raw.rsrp),
    rsrq: numeric(raw.rsrq),
    sinr: numeric(raw.sinr),
    ecno: numeric(raw.ecno),
    ta: numeric(raw.ta),
    ber: numeric(raw.ber),
  };
}

export class EventProcessor {
  private readonly operators = new StreamingOperatorState();

  constructor(
    private readonly decoder: TextDecoder,
    private readonly fail: Fail,
  ) {}

  parsePayload(payload: Uint8Array): NsgJsonObject {
    let data: unknown;
    try {
      data = JSON.parse(this.decoder.decode(payload));
    } catch {
      this.fail("Invalid UTF-8 or JSON in a decoded NSG event");
    }
    if (!isObject(data)) this.fail("Expected an NSG JSON event object");
    return data;
  }

  processEvent(event: NsgEvent, mode: NsgParseMode, sink: EventProcessorSink): void {
    this.operators.process(event);
    this.retainDefaultDataSubscription(event, mode, sink);
    if (event.name === "ScheduleCellInfo") this.projectCells(event, mode, sink);
    if (event.name === "change" && mode === "complete") this.retainLocation(event, sink);
  }

  private retainDefaultDataSubscription(event: NsgEvent, mode: NsgParseMode, sink: EventProcessorSink): void {
    if (mode !== "complete" || event.name !== "subscriptionsChanged") return;
    const subId = event.data.defaultDataSubscriptionId;
    if (typeof subId !== "number" || !Number.isSafeInteger(subId) || subId < 0) return;
    sink.retainDefaultDataSubscription({ elapsedUs: event.elapsedUs, subId });
  }

  private projectCells(event: NsgEvent, mode: NsgParseMode, sink: EventProcessorSink): void {
    const cells = event.data.cells;
    if (!Array.isArray(cells)) this.fail("Expected a cells array in an NSG measurement event");
    let lteAnchor: NsgCell | null = null;
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
      const raw = cells[cellIndex];
      if (!isObject(raw)) this.fail("Expected an NSG cell object");
      const rat = (text(raw.type) ?? "unknown").toUpperCase();
      const cell: NsgCell = {
        eventIndex: event.id,
        cellIndex,
        recordOffset: event.recordOffset,
        elapsedUs: event.elapsedUs,
        timestampUs: event.timestampUs,
        timestampMs: event.timestampMs,
        rat,
        registered: boolean(raw.registered),
        subId: numeric(event.data.subId),
        slotId: numeric(event.data.slotId),
        isDefaultSubscription: boolean(event.data.default),
        mcc: text(raw.mcc),
        mnc: text(raw.mnc),
        ...radioFields(raw, rat),
        raw,
      };
      const operator = cell.registered === true ? this.operators.get(cell) : null;
      if (operator !== null) {
        cell.mcc = operator.mcc;
        cell.mnc = operator.mnc;
        raw.mcc = operator.mcc;
        raw.mnc = operator.mnc;
      }
      if (lteAnchor === null && cell.rat === "LTE" && cell.registered === true) lteAnchor = cell;
      sink.emitCell(cell);
    }
    if (lteAnchor !== null && mode === "complete")
      sink.retainLteAnchor({
        cell: lteAnchor,
        derivedCellIndexOffset: cells.length,
      });
  }

  private retainLocation(event: NsgEvent, sink: EventProcessorSink): void {
    const latitude = numeric(event.data.latitude);
    const longitude = numeric(event.data.longitude);
    if (latitude === null || longitude === null || !isValidLatLng(latitude, longitude)) return;
    const fixSeconds = numeric(event.data.time);
    sink.retainLocation({
      eventIndex: event.id,
      elapsedUs: event.elapsedUs,
      timestampUs: event.timestampUs,
      timestampMs: event.timestampMs,
      latitude,
      longitude,
      accuracy: numeric(event.data.accuracy),
      altitude: numeric(event.data.altitude),
      speed: numeric(event.data.speed),
      provider: text(event.data.provider),
      fixTimestampMs: fixSeconds === null ? null : fixSeconds * 1000,
    });
  }
}
