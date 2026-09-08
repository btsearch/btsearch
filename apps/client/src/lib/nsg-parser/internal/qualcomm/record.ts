import type { NsgSignalingMessage } from "../../model";
import { QUALCOMM_DIAG_HEADER_BYTES, type QualcommDiagHeader, type QualcommDiagPrefix, readDiagHeader, readDiagPrefix } from "./diag";
import {
  MAX_QUALCOMM_LTE_SERVING_CELL_INFO_BYTES,
  QUALCOMM_LTE_SERVING_CELL_INFO_LOG_CODE,
  type QualcommLteServingCellInfo,
  decodeQualcommLteServingCellInfo,
} from "./lteServingCell";
import {
  MAX_QUALCOMM_NR_MEASUREMENT_BYTES,
  QUALCOMM_NR_MEASUREMENT_LOG_CODE,
  type QualcommNrMeasurement,
  decodeQualcommNrMeasurement,
} from "./nrMeasurement";
import { MAX_QUALCOMM_SIGNALING_BYTES, QUALCOMM_SIGNALING_ENVELOPE_BYTES, decodeQualcommSignaling } from "./signaling/decoder";
import { QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE, QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE } from "./signaling/lteNas";
import { QUALCOMM_LTE_RRC_OTA_LOG_CODE } from "./signaling/lteRrc";
import { QUALCOMM_NR_RRC_OTA_LOG_CODE } from "./signaling/nrRrc";

export type QualcommRecordPolicy =
  | Readonly<{ kind: "nrMeasurement"; maximumBytes: number; validationPrefixBytes: null }>
  | Readonly<{ kind: "lteServingCell"; maximumBytes: number; validationPrefixBytes: null }>
  | Readonly<{ kind: "signaling"; maximumBytes: number; validationPrefixBytes: number }>;

export type DecodedQualcommRecord =
  | Readonly<{ kind: "nrMeasurement"; packetLength: number; value: QualcommNrMeasurement }>
  | Readonly<{ kind: "lteServingCell"; packetLength: number; value: QualcommLteServingCellInfo }>
  | Readonly<{ kind: "signaling"; packetLength: number; value: NsgSignalingMessage }>;

type QualcommRecordDescriptor = Readonly<{
  policy: QualcommRecordPolicy;
  decode: (payload: Uint8Array, header: QualcommDiagHeader) => DecodedQualcommRecord | null;
}>;

const NR_MEASUREMENT_POLICY = {
  kind: "nrMeasurement",
  maximumBytes: MAX_QUALCOMM_NR_MEASUREMENT_BYTES,
  validationPrefixBytes: null,
} as const satisfies QualcommRecordPolicy;
const LTE_SERVING_CELL_POLICY = {
  kind: "lteServingCell",
  maximumBytes: MAX_QUALCOMM_LTE_SERVING_CELL_INFO_BYTES,
  validationPrefixBytes: null,
} as const satisfies QualcommRecordPolicy;
const SIGNALING_POLICY = {
  kind: "signaling",
  maximumBytes: MAX_QUALCOMM_SIGNALING_BYTES,
  validationPrefixBytes: QUALCOMM_SIGNALING_ENVELOPE_BYTES,
} as const satisfies QualcommRecordPolicy;

function decodeNrMeasurementRecord(payload: Uint8Array, header: QualcommDiagHeader): DecodedQualcommRecord | null {
  const value = decodeQualcommNrMeasurement(payload, header);
  return value === null ? null : { kind: "nrMeasurement", packetLength: header.packetLength, value };
}

function decodeLteServingCellRecord(payload: Uint8Array, header: QualcommDiagHeader): DecodedQualcommRecord | null {
  const value = decodeQualcommLteServingCellInfo(payload, header);
  return value === null ? null : { kind: "lteServingCell", packetLength: header.packetLength, value };
}

function decodeSignalingRecord(payload: Uint8Array, header: QualcommDiagHeader): DecodedQualcommRecord | null {
  const value = decodeQualcommSignaling(payload, header);
  return value === null ? null : { kind: "signaling", packetLength: header.packetLength, value };
}

const NR_MEASUREMENT_DESCRIPTOR = { policy: NR_MEASUREMENT_POLICY, decode: decodeNrMeasurementRecord } as const satisfies QualcommRecordDescriptor;
const LTE_SERVING_CELL_DESCRIPTOR = {
  policy: LTE_SERVING_CELL_POLICY,
  decode: decodeLteServingCellRecord,
} as const satisfies QualcommRecordDescriptor;
const SIGNALING_DESCRIPTOR = { policy: SIGNALING_POLICY, decode: decodeSignalingRecord } as const satisfies QualcommRecordDescriptor;

const QUALCOMM_RECORD_DESCRIPTORS: ReadonlyMap<number, QualcommRecordDescriptor> = new Map<number, QualcommRecordDescriptor>([
  [QUALCOMM_NR_MEASUREMENT_LOG_CODE, NR_MEASUREMENT_DESCRIPTOR],
  [QUALCOMM_LTE_SERVING_CELL_INFO_LOG_CODE, LTE_SERVING_CELL_DESCRIPTOR],
  [QUALCOMM_LTE_RRC_OTA_LOG_CODE, SIGNALING_DESCRIPTOR],
  [QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE, SIGNALING_DESCRIPTOR],
  [QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE, SIGNALING_DESCRIPTOR],
  [QUALCOMM_NR_RRC_OTA_LOG_CODE, SIGNALING_DESCRIPTOR],
]);

function descriptorForLogCode(logCode: number): QualcommRecordDescriptor | null {
  return QUALCOMM_RECORD_DESCRIPTORS.get(logCode) ?? null;
}

function descriptorForPacket(prefix: QualcommDiagPrefix, payloadLength: number): QualcommRecordDescriptor | null {
  const descriptor = descriptorForLogCode(prefix.logCode);
  if (
    descriptor === null ||
    prefix.packetLength < QUALCOMM_DIAG_HEADER_BYTES ||
    prefix.packetLength > payloadLength ||
    prefix.packetLength > descriptor.policy.maximumBytes
  )
    return null;
  return descriptor;
}

export function classifyQualcommRecord(prefix: QualcommDiagPrefix, payloadLength: number): QualcommRecordPolicy | null {
  return descriptorForPacket(prefix, payloadLength)?.policy ?? null;
}

export function decodeQualcommRecord(payload: Uint8Array, parsedPrefix?: QualcommDiagPrefix): DecodedQualcommRecord | null {
  const prefix = parsedPrefix ?? readDiagPrefix(payload);
  if (prefix === null) return null;
  const descriptor = descriptorForPacket(prefix, payload.byteLength);
  if (descriptor === null) return null;
  const header = readDiagHeader(payload, descriptor.policy.maximumBytes, prefix);
  return header === null ? null : descriptor.decode(payload, header);
}
