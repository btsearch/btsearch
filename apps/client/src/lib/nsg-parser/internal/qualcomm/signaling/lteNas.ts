import type { NsgJsonObject, NsgSignalingMessage } from "../../../model";

export const QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE = 0xb0ec;
export const QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE = 0xb0ed;

const LTE_NAS_VERSION = 1;
const LTE_NAS_MESSAGE_OFFSET = 16;

export function isValidQualcommLteNasEnvelope(packetLength: number, view: DataView): boolean {
  return packetLength >= LTE_NAS_MESSAGE_OFFSET && view.byteLength >= LTE_NAS_MESSAGE_OFFSET && view.getUint8(12) === LTE_NAS_VERSION;
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

export function decodeQualcommLteNas(
  payload: Uint8Array,
  packetLength: number,
  view: DataView,
  logCode: typeof QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE | typeof QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE,
): NsgSignalingMessage | null {
  if (!isValidQualcommLteNasEnvelope(packetLength, view)) return null;

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
    logCode,
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
