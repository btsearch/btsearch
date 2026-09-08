import type { NsgSignalingMessage } from "../../../model";
import { type QualcommDiagHeader, type QualcommDiagPrefix, readDiagHeader } from "../diag";
import {
  QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE,
  QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE,
  decodeQualcommLteNas,
  isValidQualcommLteNasEnvelope,
} from "./lteNas";
import { QUALCOMM_LTE_RRC_OTA_LOG_CODE, decodeQualcommLteRrc, isValidQualcommLteRrcEnvelope } from "./lteRrc";
import { QUALCOMM_NR_RRC_OTA_LOG_CODE, decodeQualcommNrRrc, isValidQualcommNrRrcEnvelope } from "./nrRrc";

export const MAX_QUALCOMM_SIGNALING_BYTES = 0xffff;
export const QUALCOMM_SIGNALING_ENVELOPE_BYTES = 47;

export function isValidQualcommSignalingEnvelope(payloadPrefix: Uint8Array, prefix: QualcommDiagPrefix): boolean {
  if (prefix.packetLength < 12 || prefix.packetLength > MAX_QUALCOMM_SIGNALING_BYTES) return false;
  const view = new DataView(payloadPrefix.buffer, payloadPrefix.byteOffset, payloadPrefix.byteLength);
  if (prefix.logCode === QUALCOMM_LTE_RRC_OTA_LOG_CODE) return isValidQualcommLteRrcEnvelope(prefix.packetLength, view);
  if (prefix.logCode === QUALCOMM_NR_RRC_OTA_LOG_CODE) return isValidQualcommNrRrcEnvelope(prefix.packetLength, view);
  if (prefix.logCode === QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE || prefix.logCode === QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE)
    return isValidQualcommLteNasEnvelope(prefix.packetLength, view);
  return false;
}

export function isQualcommSignalingLogCode(logCode: number): boolean {
  return (
    logCode === QUALCOMM_LTE_RRC_OTA_LOG_CODE ||
    logCode === QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE ||
    logCode === QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE ||
    logCode === QUALCOMM_NR_RRC_OTA_LOG_CODE
  );
}

export function decodeQualcommSignaling(payload: Uint8Array, header?: QualcommDiagHeader): NsgSignalingMessage | null {
  const packet = header ?? readDiagHeader(payload, MAX_QUALCOMM_SIGNALING_BYTES);
  if (packet === null) return null;

  const { logCode } = packet;
  if (logCode === QUALCOMM_LTE_RRC_OTA_LOG_CODE) return decodeQualcommLteRrc(payload, packet.packetLength, packet.view);
  if (logCode === QUALCOMM_NR_RRC_OTA_LOG_CODE) return decodeQualcommNrRrc(payload, packet.packetLength, packet.view);
  if (logCode === QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE || logCode === QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE)
    return decodeQualcommLteNas(payload, packet.packetLength, packet.view, logCode);
  return null;
}
