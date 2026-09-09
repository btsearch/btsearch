import { hasByteRange } from "../binary";
import { type QualcommDiagHeader, readDiagHeader } from "./diag";

export const QUALCOMM_NR_CONFIGURATION_INFO_LOG_CODE = 0xb825;
export const MAX_QUALCOMM_NR_CONFIGURATION_INFO_BYTES = 0xffff;

const SUPPORTED_VERSION = 8;
const FIXED_PACKET_BYTES = 73;
const CONTIGUOUS_CARRIER_GROUP_BYTES = 4;
const ACTIVE_CARRIER_BYTES = 18;
const ACTIVE_RADIO_BEARER_BYTES = 18;

export type QualcommNrContiguousCarrierGroup = Readonly<{
  band: number;
  downlinkBandwidthClass: number;
  uplinkBandwidthClass: number;
}>;

export type QualcommNrActiveCarrier = Readonly<{
  ccId: number;
  cellId: number;
  downlinkArfcn: number;
  uplinkArfcn: number;
  band: number;
  bandType: number;
  downlinkBandwidth: number;
  uplinkBandwidth: number;
  downlinkMaxMimo: number;
  uplinkMaxMimo: number;
}>;

export type QualcommNrConfigurationInfo = Readonly<{
  packetLength: number;
  version: number;
  state: number;
  configurationActive: boolean;
  connectivityMode: number;
  activeSrbCount: number;
  activeDrbCount: number;
  mnMcgDrbIds: number;
  contiguousCarrierGroups: readonly QualcommNrContiguousCarrierGroup[];
  activeCarriers: readonly QualcommNrActiveCarrier[];
  activeRadioBearerCount: number;
}>;

export function isConnectedQualcommNrSa(configuration: QualcommNrConfigurationInfo): boolean {
  return configuration.state === 7 && configuration.configurationActive && configuration.connectivityMode === 2;
}

export function decodeQualcommNrConfigurationInfo(payload: Uint8Array, parsedHeader?: QualcommDiagHeader): QualcommNrConfigurationInfo | null {
  const header = parsedHeader ?? readDiagHeader(payload, MAX_QUALCOMM_NR_CONFIGURATION_INFO_BYTES);
  if (
    header === null ||
    header.logCode !== QUALCOMM_NR_CONFIGURATION_INFO_LOG_CODE ||
    header.packetLength < FIXED_PACKET_BYTES ||
    header.view.getUint32(12, true) !== SUPPORTED_VERSION
  )
    return null;
  const { packetLength, view } = header;
  const contiguousCarrierGroupCount = view.getUint8(70);
  const activeCarrierCount = view.getUint8(71);
  const activeRadioBearerCount = view.getUint8(72);
  const groupsBytes = contiguousCarrierGroupCount * CONTIGUOUS_CARRIER_GROUP_BYTES;
  const carriersBytes = activeCarrierCount * ACTIVE_CARRIER_BYTES;
  const bearersBytes = activeRadioBearerCount * ACTIVE_RADIO_BEARER_BYTES;
  const expectedPacketBytes = FIXED_PACKET_BYTES + groupsBytes + carriersBytes + bearersBytes;
  if (packetLength !== expectedPacketBytes) return null;

  const contiguousCarrierGroups: QualcommNrContiguousCarrierGroup[] = [];
  let offset = FIXED_PACKET_BYTES;
  for (let index = 0; index < contiguousCarrierGroupCount; index++) {
    if (!hasByteRange(offset, CONTIGUOUS_CARRIER_GROUP_BYTES, packetLength)) return null;
    contiguousCarrierGroups.push({
      band: view.getUint16(offset, true),
      downlinkBandwidthClass: view.getUint8(offset + 2) & 0x01,
      uplinkBandwidthClass: view.getUint8(offset + 3) & 0x01,
    });
    offset += CONTIGUOUS_CARRIER_GROUP_BYTES;
  }

  const activeCarriers: QualcommNrActiveCarrier[] = [];
  for (let index = 0; index < activeCarrierCount; index++) {
    if (!hasByteRange(offset, ACTIVE_CARRIER_BYTES, packetLength)) return null;
    activeCarriers.push({
      ccId: view.getUint8(offset),
      cellId: view.getUint16(offset + 1, true),
      downlinkArfcn: view.getUint32(offset + 3, true),
      uplinkArfcn: view.getUint32(offset + 7, true),
      band: view.getUint16(offset + 11, true),
      bandType: view.getUint8(offset + 13) & 0x01,
      downlinkBandwidth: view.getUint8(offset + 14) & 0x0f,
      uplinkBandwidth: view.getUint8(offset + 15) & 0x0f,
      downlinkMaxMimo: view.getUint8(offset + 16),
      uplinkMaxMimo: view.getUint8(offset + 17),
    });
    offset += ACTIVE_CARRIER_BYTES;
  }

  if (!hasByteRange(offset, bearersBytes, packetLength)) return null;
  return {
    packetLength,
    version: SUPPORTED_VERSION,
    state: view.getUint8(16) & 0x07,
    configurationActive: (view.getUint8(17) & 0x01) === 1,
    connectivityMode: view.getUint8(18) & 0x03,
    activeSrbCount: view.getUint8(19),
    activeDrbCount: view.getUint8(20),
    mnMcgDrbIds: view.getUint8(21),
    contiguousCarrierGroups,
    activeCarriers,
    activeRadioBearerCount,
  };
}
