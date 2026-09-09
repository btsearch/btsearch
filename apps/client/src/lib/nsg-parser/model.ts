export type NsgJsonValue = string | number | boolean | null | NsgJsonValue[] | NsgJsonObject;
export type NsgJsonObject = { [key: string]: NsgJsonValue };

export type NsgSignalingDirection = "UL" | "DL" | "unknown";

export type NsgSignalingMessage = Readonly<{
  packetLength: number;
  logCode: number;
  version: string;
  rat: "LTE" | "NR";
  layer: "RRC" | "NAS";
  direction: NsgSignalingDirection;
  channel: string | null;
  pduType: string | null;
  pduId: number | null;
  pci: number | null;
  channelNumber: number | null;
  rbid: number | null;
  payloadBytes: number;
  payload: Uint8Array;
  metadata: NsgJsonObject;
}>;

export type NsgTimestamp = {
  elapsedUs: number;
  timestampUs: string;
  timestampMs: number;
};

export type NsgSource = Readonly<{
  name: string;
  size: number;
  decodedSize?: number | null;
  inputBytesRead?: () => number;
}>;

export type NsgCellMeasurementRole = "nr-primary" | "nr-neighbor" | "lte-secondary";
export type NsgCellSource = "android-telephony" | "qualcomm-diag";
export type NsgNrMode = "SA" | "NSA";
export type NsgNrIdentitySource = "reported" | "derived-reported-length" | "derived-default-24";

export type NsgSignalingRecord = NsgTimestamp &
  NsgSignalingMessage & {
    id: number;
    recordOffset: number;
    streamIndex: number;
  };

export type NsgEvent = NsgTimestamp & {
  id: number;
  name: string;
  marker: number | null;
  recordOffset: number;
  streamIndex: number;
  data: NsgJsonObject;
};

export type NsgCell = NsgTimestamp & {
  eventIndex: number;
  cellIndex: number;
  recordOffset: number;
  rat: string;
  registered: boolean | null;
  measurementRole?: NsgCellMeasurementRole;
  nrMode: NsgNrMode | null;
  sources: readonly NsgCellSource[];
  subId: number | null;
  slotId: number | null;
  isDefaultSubscription: boolean | null;
  mcc: string | null;
  mnc: string | null;
  operatorName: string | null;
  lac: number | null;
  rnc: number | null;
  cid: number | null;
  tac: number | null;
  nci: number | null;
  gnbid: number | null;
  gnbidLength: number | null;
  clid: number | null;
  nrIdentitySource: NsgNrIdentitySource | null;
  eci: number | null;
  pci: number | null;
  earfcn: number | null;
  arfcn: number | null;
  uarfcn: number | null;
  psc: number | null;
  bsic: number | null;
  dbm: number | null;
  rssi: number | null;
  rsrp: number | null;
  rsrq: number | null;
  sinr: number | null;
  ecno: number | null;
  ta: number | null;
  ber: number | null;
  bands: readonly number[] | null;
  raw: NsgJsonObject;
};

export type NsgLocation = NsgTimestamp & {
  eventIndex: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  provider: string | null;
  fixTimestampMs: number | null;
};

export type NsgProgress = {
  bytesRead: number;
  totalBytes: number;
  percent: number;
  recordCount: number;
  eventCount: number;
  cellCount: number;
};

export type NsgLog = {
  sourceName: string;
  sourceBytes: number;
  headerXml: string;
  startTimestampUs: string;
  startTimestampMs: number;
  endTimestampMs: number;
  durationSeconds: number;
  recordCount: number;
  recordTypeCounts: Record<string, number>;
  eventTypeCounts: Record<string, number>;
  timeRegressions: number;
  recognizedPayloadBytes: number;
  servingCellCount: number;
  signalingRecordCount: number;
  signalingTruncated: boolean;
  inputTruncated: boolean;
  events: NsgEvent[];
  cells: NsgCell[];
  signaling: NsgSignalingRecord[];
  locations: NsgLocation[];
};

export type NsgParseInput = Readonly<{
  stream: ReadableStream<Uint8Array>;
  source: NsgSource;
}>;

export type NsgParseMode = "complete" | "streaming";

export type NsgParseOptions = {
  mode?: NsgParseMode;
  allowIncompleteFinalRecord?: boolean;
  onCell?: (cell: NsgCell) => void;
  onEvent?: (event: NsgEvent) => void;
  onProgress?: (progress: NsgProgress) => void;
};
