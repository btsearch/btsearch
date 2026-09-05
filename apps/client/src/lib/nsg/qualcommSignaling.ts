import type { NsgJsonObject } from "./json";
import { type QualcommDiagHeader, type QualcommDiagPrefix, readDiagHeader } from "./qualcommDiag";

export const QUALCOMM_LTE_RRC_OTA_LOG_CODE = 0xb0c0;
export const QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE = 0xb0ec;
export const QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE = 0xb0ed;
export const QUALCOMM_NR_RRC_OTA_LOG_CODE = 0xb821;
export const MAX_QUALCOMM_SIGNALING_BYTES = 0xffff;

const LTE_RRC_VERSION = 27;
const LTE_RRC_MESSAGE_OFFSET = 33;
const NR_RRC_VERSION = 12;
const NR_RRC_MESSAGE_OFFSET = 35;
const LTE_NAS_VERSION = 1;
const LTE_NAS_MESSAGE_OFFSET = 16;
export const QUALCOMM_SIGNALING_ENVELOPE_BYTES = NR_RRC_MESSAGE_OFFSET;

export type QualcommSignalingDirection = "UL" | "DL" | "unknown";
export type QualcommSignalingLogCode = "0xB0C0" | "0xB0EC" | "0xB0ED" | "0xB821";

export type DecodedQualcommSignaling = Readonly<{
  packetLength: number;
  logCode: QualcommSignalingLogCode;
  version: string;
  rat: "LTE" | "NR";
  layer: "RRC" | "NAS";
  direction: QualcommSignalingDirection;
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

type RrcPdu = Readonly<{
  direction: QualcommSignalingDirection;
  channel: string | null;
  pduType: string | null;
}>;

const UNKNOWN_RRC_PDU: RrcPdu = Object.freeze({ direction: "unknown", channel: null, pduType: null });

const LTE_RRC_PDUS: Readonly<Partial<Record<number, RrcPdu>>> = {
  1: { direction: "DL", channel: "BCCH-BCH", pduType: null },
  3: { direction: "DL", channel: "BCCH-DL-SCH", pduType: null },
  6: { direction: "DL", channel: "MCCH", pduType: null },
  7: { direction: "DL", channel: "PCCH", pduType: null },
  8: { direction: "DL", channel: "DL-CCCH", pduType: null },
  9: { direction: "DL", channel: "DL-DCCH", pduType: null },
  10: { direction: "UL", channel: "UL-CCCH", pduType: null },
  11: { direction: "UL", channel: "UL-DCCH", pduType: null },
  45: { direction: "DL", channel: "BCCH-BCH-NB", pduType: null },
  46: { direction: "DL", channel: "BCCH-DL-SCH-NB", pduType: null },
  47: { direction: "DL", channel: "PCCH-NB", pduType: null },
  48: { direction: "DL", channel: "DL-CCCH-NB", pduType: null },
  49: { direction: "DL", channel: "DL-DCCH-NB", pduType: null },
  50: { direction: "UL", channel: "UL-CCCH-NB", pduType: null },
  52: { direction: "UL", channel: "UL-DCCH-NB", pduType: null },
};

const NR_RRC_PDUS: Readonly<Partial<Record<number, RrcPdu>>> = {
  1: { direction: "DL", channel: "BCCH-BCH", pduType: null },
  2: { direction: "DL", channel: "BCCH-DL-SCH", pduType: null },
  3: { direction: "DL", channel: "DL-CCCH", pduType: null },
  4: { direction: "DL", channel: "DL-DCCH", pduType: null },
  5: { direction: "DL", channel: "PCCH", pduType: null },
  6: { direction: "UL", channel: "UL-CCCH", pduType: null },
  7: { direction: "UL", channel: "UL-CCCH1", pduType: null },
  8: { direction: "UL", channel: "UL-DCCH", pduType: null },
  9: { direction: "DL", channel: null, pduType: "RRCReconfiguration" },
  10: { direction: "UL", channel: null, pduType: "RRCReconfigurationComplete" },
  25: { direction: "unknown", channel: null, pduType: "nr-RadioBearerConfig" },
};

export function bytesToHex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) result += byte.toString(16).padStart(2, "0");
  return result;
}

function nullableIdentity(value: number, unavailable: number): number | null {
  return value === unavailable ? null : value;
}

function hasValidLteRrcEnvelope(packetLength: number, view: DataView): boolean {
  return (
    packetLength >= LTE_RRC_MESSAGE_OFFSET &&
    view.byteLength >= LTE_RRC_MESSAGE_OFFSET &&
    view.getUint8(12) === LTE_RRC_VERSION &&
    LTE_RRC_MESSAGE_OFFSET + view.getUint16(31, true) === packetLength
  );
}

function hasValidNrRrcEnvelope(packetLength: number, view: DataView): boolean {
  return (
    packetLength >= NR_RRC_MESSAGE_OFFSET &&
    view.byteLength >= NR_RRC_MESSAGE_OFFSET &&
    view.getUint32(12, true) === NR_RRC_VERSION &&
    NR_RRC_MESSAGE_OFFSET + view.getUint16(33, true) === packetLength
  );
}

function hasValidLteNasEnvelope(packetLength: number, view: DataView): boolean {
  return packetLength >= LTE_NAS_MESSAGE_OFFSET && view.byteLength >= LTE_NAS_MESSAGE_OFFSET && view.getUint8(12) === LTE_NAS_VERSION;
}

export function isValidQualcommSignalingEnvelope(payloadPrefix: Uint8Array, prefix: QualcommDiagPrefix): boolean {
  if (prefix.packetLength < 12 || prefix.packetLength > MAX_QUALCOMM_SIGNALING_BYTES) return false;
  const view = new DataView(payloadPrefix.buffer, payloadPrefix.byteOffset, payloadPrefix.byteLength);
  if (prefix.logCode === QUALCOMM_LTE_RRC_OTA_LOG_CODE) return hasValidLteRrcEnvelope(prefix.packetLength, view);
  if (prefix.logCode === QUALCOMM_NR_RRC_OTA_LOG_CODE) return hasValidNrRrcEnvelope(prefix.packetLength, view);
  if (prefix.logCode === QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE || prefix.logCode === QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE)
    return hasValidLteNasEnvelope(prefix.packetLength, view);
  return false;
}

function decodeLteRrc(payload: Uint8Array, packetLength: number, view: DataView): DecodedQualcommSignaling | null {
  if (!hasValidLteRrcEnvelope(packetLength, view)) return null;
  const payloadBytes = view.getUint16(31, true);

  const pduId = view.getUint8(26);
  const pdu = LTE_RRC_PDUS[pduId] ?? UNKNOWN_RRC_PDU;
  const sfnSubframe = view.getUint16(24, true);

  return {
    packetLength,
    logCode: "0xB0C0",
    version: String(LTE_RRC_VERSION),
    rat: "LTE",
    layer: "RRC",
    ...pdu,
    pduId,
    pci: nullableIdentity(view.getUint16(18, true), 0xffff),
    channelNumber: nullableIdentity(view.getUint32(20, true), 0xffffffff),
    rbid: view.getUint8(17),
    payloadBytes,
    payload: payload.subarray(LTE_RRC_MESSAGE_OFFSET, packetLength),
    metadata: {
      packetVersion: LTE_RRC_VERSION,
      rrcReleaseMajor: view.getUint8(13),
      rrcReleaseMinor: view.getUint8(14),
      nrRrcReleaseMajor: view.getUint8(15),
      nrRrcReleaseMinor: view.getUint8(16),
      sfn: sfnSubframe >>> 4,
      subframe: sfnSubframe & 0x0f,
      sibMask: view.getUint32(27, true),
    },
  };
}

function decodeNrRrc(payload: Uint8Array, packetLength: number, view: DataView): DecodedQualcommSignaling | null {
  if (!hasValidNrRrcEnvelope(packetLength, view)) return null;
  const payloadBytes = view.getUint16(33, true);

  const pduId = view.getUint8(28);
  const pdu = NR_RRC_PDUS[pduId] ?? UNKNOWN_RRC_PDU;

  return {
    packetLength,
    logCode: "0xB821",
    version: String(NR_RRC_VERSION),
    rat: "NR",
    layer: "RRC",
    ...pdu,
    pduId,
    pci: nullableIdentity(view.getUint16(19, true), 0xffff),
    channelNumber: nullableIdentity(view.getUint32(21, true), 0xffffffff),
    rbid: view.getUint8(18),
    payloadBytes,
    payload: payload.subarray(NR_RRC_MESSAGE_OFFSET, packetLength),
    metadata: {
      packetVersion: NR_RRC_VERSION,
      rrcReleaseMajor: view.getUint8(16),
      rrcReleaseMinor: view.getUint8(17),
      sfnSubframe: bytesToHex(payload.subarray(25, 28)),
      sibMask: view.getUint32(29, true),
    },
  };
}

function nasPduType(message: Uint8Array): string | null {
  if (message.length === 0) return null;
  const securityHeaderType = message[0] >>> 4;
  const protocolDiscriminator = message[0] & 0x0f;
  if (securityHeaderType === 12 && protocolDiscriminator === 7) return "Service Request";
  if (securityHeaderType !== 0 || protocolDiscriminator !== 7 || message.length < 2) return null;
  if (message[1] === 0x48) return "Tracking Area Update Request";
  if (message[1] === 0x49) return "Tracking Area Update Accept";
  return null;
}

function decodeLteNas(
  payload: Uint8Array,
  packetLength: number,
  view: DataView,
  logCode: typeof QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE | typeof QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE,
): DecodedQualcommSignaling | null {
  if (!hasValidLteNasEnvelope(packetLength, view)) return null;

  const message = payload.subarray(LTE_NAS_MESSAGE_OFFSET, packetLength);
  const securityHeaderType = message.length > 0 ? message[0] >>> 4 : 0;
  const protocolDiscriminator = message.length > 0 ? message[0] & 0x0f : 0;
  const metadata: NsgJsonObject = {
    packetVersion: LTE_NAS_VERSION,
    protocolVersionMajor: view.getUint8(13),
    protocolVersionMinor: view.getUint8(14),
    protocolVersionRevision: view.getUint8(15),
    securityHeaderType,
    protocolDiscriminator,
  };
  if (securityHeaderType === 0 && message.length > 1) metadata.messageType = message[1];

  return {
    packetLength,
    logCode: logCode === QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE ? "0xB0EC" : "0xB0ED",
    version: `${LTE_NAS_VERSION} (${view.getUint8(13)}.${view.getUint8(14)}.${view.getUint8(15)})`,
    rat: "LTE",
    layer: "NAS",
    direction: logCode === QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE ? "DL" : "UL",
    channel: protocolDiscriminator === 7 ? "EMM" : null,
    pduType: nasPduType(message),
    pduId: null,
    pci: null,
    channelNumber: null,
    rbid: null,
    payloadBytes: message.length,
    payload: message,
    metadata,
  };
}

export function isQualcommSignalingLogCode(logCode: number): boolean {
  return (
    logCode === QUALCOMM_LTE_RRC_OTA_LOG_CODE ||
    logCode === QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE ||
    logCode === QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE ||
    logCode === QUALCOMM_NR_RRC_OTA_LOG_CODE
  );
}

export function decodeQualcommSignaling(payload: Uint8Array, header?: QualcommDiagHeader): DecodedQualcommSignaling | null {
  const packet = header ?? readDiagHeader(payload, MAX_QUALCOMM_SIGNALING_BYTES);
  if (packet === null) return null;

  const { logCode } = packet;
  if (logCode === QUALCOMM_LTE_RRC_OTA_LOG_CODE) return decodeLteRrc(payload, packet.packetLength, packet.view);
  if (logCode === QUALCOMM_NR_RRC_OTA_LOG_CODE) return decodeNrRrc(payload, packet.packetLength, packet.view);
  if (logCode === QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE || logCode === QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE)
    return decodeLteNas(payload, packet.packetLength, packet.view, logCode);
  return null;
}
