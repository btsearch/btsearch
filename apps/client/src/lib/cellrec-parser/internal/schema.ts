import type { NsgJsonObject, NsgJsonValue } from "../../nsg-parser/model";
import { MalformedWireError, type WireMessage } from "./wire";

const MAX_INT32 = 2 ** 31 - 1;
const MIN_INT32 = -(2 ** 31);

type FieldType =
  | "uint"
  | "sint"
  | "uint64"
  | "sint64"
  | "bool"
  | "string"
  | "strings"
  | "packed"
  | { enum: readonly string[] }
  | { message: MessageSchema }
  | { messages: MessageSchema };

export type MessageSchema = readonly (readonly [number: number, name: string, type: FieldType])[];

const RAT = ["gsm", "umts", "lte", "nr"];
const ROLE = ["serving", "aggregated", "nrSecondary", "neighbour"];
const CONNECTION_STATUS = ["none", "primaryServing", "secondaryServing"];
const DATA_NETWORK_TYPE = [
  "gprs",
  "edge",
  "umts",
  "cdma",
  "evdo0",
  "evdoA",
  "cdma1xRtt",
  "hsdpa",
  "hsupa",
  "hspa",
  "iden",
  "evdoB",
  "lte",
  "ehrpd",
  "hspap",
  "gsm",
  "tdScdma",
  "iwlan",
  "lteCa",
  "nr",
];
const DISPLAY_OVERRIDE = ["none", "lteCa", "lteAdvancedPro", "nrNsa", "nrAdvanced"];
const DATA_ACTIVITY = ["none", "in", "out", "inOut", "dormant"];
const REGISTRATION_STATE = ["registered", "denied", "searching", "limited", "notRegistered", "unknown"];
const MODULATION = ["bpsk", "qpsk", "qam16", "qam64", "qam256", "qam1024"];
const BARRING_SERVICE = ["csService", "psService", "csVoice", "moSignalling", "moData", "csFallback", "mmtelVoice", "mmtelVideo", "emergency", "sms"];
const BARRING = ["unconditional", "conditional"];
const TRIP_MODE = ["passive", "active", "survey"];
const TRIP_END_REASON = ["stopped", "closedAfterRestart"];
const FIX_ORIGIN = ["gnss", "platformFused", "playServices", "beacondb"];
const READER_SOURCE = ["api", "modemLog", "modemPoll"];
const CLOCK_SOURCE = ["system", "gnss"];
const CONNECTION_TYPE = ["gsm", "umts", "lte", "nsa", "sa", "nrDc", "none"];
const SERVICE_STATE = ["inService", "none", "denied", "emergencyOnly", "searching", "notRegistered"];
const EVENT_TYPE = [
  "cellChange",
  "connectionChange",
  "serviceChange",
  "airplaneOn",
  "airplaneOff",
  "locationOff",
  "locationOn",
  "simChange",
  "loggingPaused",
  "loggingResumed",
  "recordingPaused",
  "recordingResumed",
];

const FIELD_RULE: MessageSchema = [
  [1, "field", "string"],
  [2, "rule", "string"],
];
const PROVENANCE: MessageSchema = [
  [1, "derived", "strings"],
  [2, "corrected", { messages: FIELD_RULE }],
  [3, "dropped", { messages: FIELD_RULE }],
  [4, "enriched", { messages: FIELD_RULE }],
];
const PLMN_LIST: MessageSchema = [[1, "plmns", "strings"]];
const TDD_PATTERN: MessageSchema = [
  [1, "periodMicros", "uint"],
  [2, "downlinkSlots", "uint"],
  [3, "downlinkSymbols", "uint"],
  [4, "uplinkSlots", "uint"],
  [5, "uplinkSymbols", "uint"],
];
const TDD: MessageSchema = [
  [1, "subframeAssignment", "uint"],
  [2, "specialSubframePatterns", "uint"],
  [3, "referenceScsKhz", "uint"],
  [4, "pattern1", { message: TDD_PATTERN }],
  [5, "pattern2", { message: TDD_PATTERN }],
];
const SIGNAL: MessageSchema = [
  [1, "rsrpDbm", "sint"],
  [2, "rsrqDb", "sint"],
  [3, "rssnrDb", "sint"],
  [4, "rssiDbm", "sint"],
  [5, "cqi", "uint"],
  [6, "timingAdvance", "uint"],
  [7, "ssRsrpDbm", "sint"],
  [8, "ssRsrqDb", "sint"],
  [9, "ssSinrDb", "sint"],
  [10, "csiRsrpDbm", "sint"],
  [11, "csiRsrqDb", "sint"],
  [12, "csiSinrDb", "sint"],
  [13, "subcarrierSpacingKhz", "uint"],
  [14, "ssbIndex", "uint"],
  [15, "rscpDbm", "sint"],
  [16, "ecNoDb", "sint"],
  [17, "bitErrorRate", "uint"],
  [18, "level", "uint"],
  [19, "beamCount", "uint"],
  [20, "sfn", "uint"],
];
const ACCESS_BARRING: MessageSchema = [
  [1, "service", { enum: BARRING_SERVICE }],
  [2, "barring", { enum: BARRING }],
];
const MIMO: MessageSchema = [
  [1, "transmit", "uint"],
  [2, "receive", "uint"],
];

const CELL_DEF: MessageSchema = [
  [1, "id", "uint64"],
  [2, "rat", { enum: RAT }],
  [3, "plmn", "string"],
  [4, "cellNumber", "uint64"],
  [5, "areaCode", "uint"],
  [6, "channel", "uint"],
  [7, "code", "uint"],
  [8, "bands", "packed"],
  [9, "bandwidthKhz", "uint"],
  [10, "ulChannel", "uint"],
  [11, "ulBandwidthKhz", "uint"],
  [12, "additionalPlmns", { message: PLMN_LIST }],
  [13, "isBarred", "bool"],
  [14, "reservedForOperatorUsePlmns", { message: PLMN_LIST }],
  [15, "supportsEndc", "bool"],
  [16, "tdd", { message: TDD }],
  [17, "provenance", { message: PROVENANCE }],
  [18, "nodeIdBits", "uint"],
];
const MEASUREMENT: MessageSchema = [
  [1, "cell", "uint64"],
  [2, "role", { enum: ROLE }],
  [3, "connectionStatus", { enum: CONNECTION_STATUS }],
  [4, "dt", "sint64"],
  [5, "signal", { message: SIGNAL }],
  [6, "accessBarring", { message: [[1, "entries", { messages: ACCESS_BARRING }]] }],
  [7, "downlinkModulation", { enum: MODULATION }],
  [8, "uplinkModulation", { enum: MODULATION }],
  [9, "downlinkMimo", { message: MIMO }],
  [10, "uplinkMimo", { message: MIMO }],
  [11, "isRegistered", "bool"],
  [12, "provenance", { message: PROVENANCE }],
  [13, "carrier", "uint"],
];
const READING: MessageSchema = [
  [2, "slot", "uint"],
  [3, "reader", "uint"],
  [4, "registeredPlmn", "string"],
  [5, "isRoaming", "bool"],
  [6, "dataNetworkType", { enum: DATA_NETWORK_TYPE }],
  [7, "displayOverride", { enum: DISPLAY_OVERRIDE }],
  [8, "dataActivity", { enum: DATA_ACTIVITY }],
  [9, "isNrAvailable", "bool"],
  [10, "isDcNrRestricted", "bool"],
  [11, "registrationState", { enum: REGISTRATION_STATE }],
  [12, "rejectCause", "uint"],
  [13, "networkName", "string"],
  [14, "cellBandwidthsKhz", "packed"],
  [15, "carriesData", "bool"],
  [16, "unplacedNrSignal", { message: SIGNAL }],
  [17, "isRepeat", "bool"],
  [18, "listedCount", "uint"],
  [
    19,
    "removedByRule",
    {
      messages: [
        [1, "rule", "string"],
        [2, "count", "uint"],
      ],
    },
  ],
  [20, "isForUpload", "bool"],
  [21, "measurements", { messages: MEASUREMENT }],
  [22, "provenance", { message: PROVENANCE }],
];
const FIX: MessageSchema = [
  [2, "origin", { enum: FIX_ORIGIN }],
  [3, "latitudeE7", "sint"],
  [4, "longitudeE7", "sint"],
  [5, "accuracyMm", "uint"],
  [6, "altitudeMm", "sint"],
  [7, "verticalAccuracyMm", "uint"],
  [8, "speedMmPerS", "uint"],
  [9, "speedAccuracyMmPerS", "uint"],
  [10, "bearingCentiDeg", "uint"],
  [11, "bearingAccuracyCentiDeg", "uint"],
  [12, "gnssTimeOffsetMicros", "sint64"],
  [13, "isMock", "bool"],
];
const EVENT: MessageSchema = [
  [2, "type", { enum: EVENT_TYPE }],
  [3, "slot", "uint"],
  [4, "fromCell", "uint64"],
  [5, "toCell", "uint64"],
  [6, "fromConnection", { enum: CONNECTION_TYPE }],
  [7, "toConnection", { enum: CONNECTION_TYPE }],
  [8, "serviceState", { enum: SERVICE_STATE }],
  [9, "rejectCause", "uint"],
  [10, "fromLevelDbm", "sint"],
  [11, "toLevelDbm", "sint"],
  [12, "simPlmnBefore", "string"],
  [13, "simPlmnAfter", "string"],
];
const TRIP_START: MessageSchema = [
  [1, "tripId", "string"],
  [2, "startEpochMillis", "uint64"],
  [3, "startElapsedMicros", "uint64"],
  [4, "mode", { enum: TRIP_MODE }],
  [5, "timeZone", "string"],
];
const DEVICE_INFO: MessageSchema = [
  [1, "manufacturer", "string"],
  [2, "model", "string"],
  [3, "board", "string"],
  [4, "soc", "string"],
  [5, "sdkInt", "uint"],
  [6, "securityPatch", "string"],
  [7, "appVersionName", "string"],
  [8, "appVersionCode", "uint64"],
];
const READER_INFO: MessageSchema = [
  [1, "id", "uint"],
  [2, "name", "string"],
  [3, "version", "string"],
  [4, "source", { enum: READER_SOURCE }],
  [5, "rulesVersion", "uint"],
  [6, "capabilities", "strings"],
  [7, "enrichers", "strings"],
];
const SIM_INFO: MessageSchema = [
  [2, "slot", "uint"],
  [3, "simPlmn", "string"],
  [4, "isDataSim", "bool"],
  [5, "isPresent", "bool"],
];

export const FILE_INFO: MessageSchema = [
  [1, "writer", "string"],
  [2, "createdEpochMillis", "uint64"],
  [3, "trip", { message: TRIP_START }],
  [4, "device", { message: DEVICE_INFO }],
  [5, "readers", { messages: READER_INFO }],
  [6, "sims", { messages: [[1, "t", "uint64"], ...SIM_INFO] }],
  [7, "kinds", "packed"],
  [8, "isExport", "bool"],
];

export const KIND_CELL_DEF = 1;
export const KIND_READING = 2;
export const KIND_FIX = 3;
export const KIND_EVENT = 4;
export const KIND_SIM_INFO = 10;
export const KIND_BLOCK_INDEX = 11;
const KIND_EXCLUDED_SPAN = 12;

type RecordKind = { name: string; schema: MessageSchema; isTimed: boolean };

export const RECORD_KINDS: ReadonlyMap<number, RecordKind> = new Map([
  [KIND_CELL_DEF, { name: "cellDef", schema: CELL_DEF, isTimed: false }],
  [KIND_READING, { name: "reading", schema: READING, isTimed: true }],
  [KIND_FIX, { name: "fix", schema: FIX, isTimed: true }],
  [KIND_EVENT, { name: "event", schema: EVENT, isTimed: true }],
  [5, { name: "tripStart", schema: TRIP_START, isTimed: false }],
  [6, { name: "tripEnd", schema: [[2, "reason", { enum: TRIP_END_REASON }]], isTimed: true }],
  [7, { name: "deviceInfo", schema: DEVICE_INFO, isTimed: false }],
  [8, { name: "readerInfo", schema: READER_INFO, isTimed: false }],
  [
    9,
    {
      name: "clockAnchor",
      schema: [
        [2, "epochMillis", "uint64"],
        [3, "source", { enum: CLOCK_SOURCE }],
      ],
      isTimed: true,
    },
  ],
  [KIND_SIM_INFO, { name: "simInfo", schema: SIM_INFO, isTimed: true }],
  [KIND_BLOCK_INDEX, { name: "blockIndex", schema: [], isTimed: false }],
  [KIND_EXCLUDED_SPAN, { name: "excludedSpan", schema: [[2, "durationMicros", "uint64"]], isTimed: true }],
]);

function inInt32Range(value: number | undefined, minimum: number): number | undefined {
  if (value !== undefined && (value < minimum || value > MAX_INT32)) throw new MalformedWireError(`${value} does not fit a 32-bit field`);
  return value;
}

function decodeField(message: WireMessage, number: number, type: FieldType): NsgJsonValue | undefined {
  if (type === "uint") return inInt32Range(message.uint(number), 0);
  if (type === "sint") return inInt32Range(message.sint(number), MIN_INT32);
  if (type === "uint64") return message.uint(number);
  if (type === "sint64") return message.sint(number);
  if (type === "bool") return message.bool(number);
  if (type === "string") return message.string(number);
  if (type === "strings") return message.strings(number);
  if (type === "packed") return message.packedUints(number)?.map((value) => inInt32Range(value, 0) ?? value);
  if ("enum" in type) {
    const id = message.uint(number);
    return id === undefined ? undefined : (type.enum[id] ?? id);
  }
  if ("message" in type) {
    const nested = message.message(number);
    return nested === undefined ? undefined : decodeMessage(nested, type.message);
  }
  return message.messages(number).map((nested) => decodeMessage(nested, type.messages));
}

export function decodeMessage(message: WireMessage, schema: MessageSchema): NsgJsonObject {
  const decoded: NsgJsonObject = {};
  for (const [number, name, type] of schema) {
    const value = decodeField(message, number, type);
    if (value !== undefined) decoded[name] = value;
  }
  return decoded;
}
