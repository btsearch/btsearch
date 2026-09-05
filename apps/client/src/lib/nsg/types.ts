export type NsgJsonValue = string | number | boolean | null | NsgJsonValue[] | NsgJsonObject;
export type NsgJsonObject = { [key: string]: NsgJsonValue };

export type NsgTimestamp = {
  elapsedUs: number;
  timestampUs: string;
  timestampMs: number;
};

export type NsgEvent = NsgTimestamp & {
  id: number;
  name: string;
  marker: number;
  recordOffset: number;
  frameFields: [number, number, number];
  data: NsgJsonObject;
};

export type NsgCell = NsgTimestamp & {
  eventIndex: number;
  cellIndex: number;
  recordOffset: number;
  rat: string;
  registered: boolean | null;
  subId: number | null;
  slotId: number | null;
  isDefault: boolean | null;
  mcc: string | null;
  mnc: string | null;
  lac: number | null;
  cid: number | null;
  tac: number | null;
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
  ta: number | null;
  ber: number | null;
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
  decodedBytes: number;
  servingCellCount: number;
  events: NsgEvent[];
  cells: NsgCell[];
  locations: NsgLocation[];
};

export type NsgWorkerRequest = { type: "parse"; file: File };
export type NsgWorkerResponse = { type: "progress"; progress: NsgProgress } | { type: "complete"; log: NsgLog } | { type: "error"; message: string };
