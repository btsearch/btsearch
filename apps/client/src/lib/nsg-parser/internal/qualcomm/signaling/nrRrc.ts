import type { NsgJsonObject, NsgSignalingMessage } from "../../../model";
import {
  type RrcLayout,
  type RrcPduMap,
  type RrcProfile,
  UNKNOWN_RRC_PDU,
  type VersionedRrcProfile,
  hasValidRrcEnvelope,
  nullableIdentity,
} from "./rrcProfile";

export const QUALCOMM_NR_RRC_OTA_LOG_CODE = 0xb821;

function bytesToHex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) result += byte.toString(16).padStart(2, "0");
  return result;
}

type NrRrcLayout = RrcLayout &
  Readonly<{
    packetVersionBytes: 1 | 4;
    channelNumberOffset: number;
    sfnSubframeOffset: number;
    sfnSubframeBytes: 3 | 4;
    pduIdOffset: number;
    sibMaskOffset: number;
    sibMaskBytes: 1 | 4;
    nrCellGlobalIdentityOffset: number | null;
  }>;

const NR_RRC_V7_PDUS: RrcPduMap = {
  1: { direction: "DL", channel: "BCCH-BCH", pduType: null },
  8: { direction: "UL", channel: "UL-DCCH", pduType: null },
  9: { direction: "DL", channel: null, pduType: "RRCReconfiguration" },
  10: { direction: "UL", channel: null, pduType: "RRCReconfigurationComplete" },
  24: { direction: "unknown", channel: null, pduType: "nr-RadioBearerConfig" },
};

const NR_RRC_V8_PDUS: RrcPduMap = {
  1: { direction: "DL", channel: "BCCH-BCH", pduType: null },
  8: { direction: "UL", channel: "UL-DCCH", pduType: null },
  9: { direction: "DL", channel: null, pduType: "RRCReconfiguration" },
  10: { direction: "UL", channel: null, pduType: "RRCReconfigurationComplete" },
  26: { direction: "unknown", channel: null, pduType: "nr-RadioBearerConfig" },
};

const NR_RRC_LEGACY_PDUS: RrcPduMap = {
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
};

const NR_RRC_V9_PDUS: RrcPduMap = {
  ...NR_RRC_LEGACY_PDUS,
  25: { direction: "unknown", channel: null, pduType: "nr-RadioBearerConfig" },
  28: { direction: "unknown", channel: null, pduType: "UE-MRDC-Capability" },
  29: { direction: "unknown", channel: null, pduType: "UE-NR-Capability" },
};

const NR_RRC_V14_PDUS: RrcPduMap = {
  ...NR_RRC_LEGACY_PDUS,
  28: { direction: "unknown", channel: null, pduType: "nr-RadioBearerConfig" },
  31: { direction: "unknown", channel: null, pduType: "UE-MRDC-Capability" },
  32: { direction: "unknown", channel: null, pduType: "UE-NR-Capability" },
  33: { direction: "unknown", channel: null, pduType: "UE-NR-Capability" },
};

const NR_RRC_V17_PDUS: RrcPduMap = {
  ...NR_RRC_LEGACY_PDUS,
  29: { direction: "unknown", channel: null, pduType: "nr-RadioBearerConfig" },
};

const NR_RRC_MODERN_BASE_PDUS: RrcPduMap = {
  1: { direction: "DL", channel: "BCCH-BCH", pduType: null },
  2: { direction: "DL", channel: "BCCH-DL-SCH", pduType: null },
  3: { direction: "DL", channel: "DL-CCCH", pduType: null },
  4: { direction: "DL", channel: "DL-DCCH", pduType: null },
  5: { direction: "DL", channel: "MCCH", pduType: null },
  6: { direction: "DL", channel: "PCCH", pduType: null },
  7: { direction: "UL", channel: "UL-CCCH", pduType: null },
  8: { direction: "UL", channel: "UL-CCCH1", pduType: null },
  9: { direction: "UL", channel: "UL-DCCH", pduType: null },
};

const NR_RRC_V20_PDUS: RrcPduMap = {
  ...NR_RRC_MODERN_BASE_PDUS,
  10: { direction: "DL", channel: null, pduType: "RRCReconfiguration" },
  11: { direction: "UL", channel: null, pduType: "RRCReconfigurationComplete" },
  36: { direction: "unknown", channel: null, pduType: "nr-RadioBearerConfig" },
};

const NR_RRC_V26_PDUS: RrcPduMap = {
  ...NR_RRC_MODERN_BASE_PDUS,
  11: { direction: "DL", channel: null, pduType: "RRCReconfiguration" },
  12: { direction: "UL", channel: null, pduType: "RRCReconfigurationComplete" },
  36: { direction: "unknown", channel: null, pduType: "nr-RadioBearerConfig" },
};

const NR_RRC_V28_PDUS: RrcPduMap = {
  ...NR_RRC_V26_PDUS,
  10: { direction: "UL", channel: "UL-DCCH", pduType: null },
};

const NR_RRC_LAYOUT_V7: NrRrcLayout = {
  messageOffset: 36,
  messageLengthOffset: 34,
  segmentIdOffset: null,
  packetVersionBytes: 1,
  channelNumberOffset: 21,
  sfnSubframeOffset: 25,
  sfnSubframeBytes: 4,
  pduIdOffset: 29,
  sibMaskOffset: 30,
  sibMaskBytes: 1,
  nrCellGlobalIdentityOffset: null,
};

const NR_RRC_LAYOUT_V9: NrRrcLayout = {
  ...NR_RRC_LAYOUT_V7,
  packetVersionBytes: 4,
  sibMaskBytes: 4,
};

const NR_RRC_LAYOUT_V12: NrRrcLayout = {
  ...NR_RRC_LAYOUT_V9,
  messageOffset: 35,
  messageLengthOffset: 33,
  sfnSubframeBytes: 3,
  pduIdOffset: 28,
  sibMaskOffset: 29,
};

const NR_RRC_LAYOUT_V17: NrRrcLayout = {
  ...NR_RRC_LAYOUT_V12,
  messageOffset: 43,
  messageLengthOffset: 41,
  channelNumberOffset: 29,
  sfnSubframeOffset: 33,
  pduIdOffset: 36,
  sibMaskOffset: 37,
  nrCellGlobalIdentityOffset: 21,
};

const NR_RRC_LAYOUT_V19: NrRrcLayout = {
  ...NR_RRC_LAYOUT_V17,
  messageOffset: 44,
};

const NR_RRC_LAYOUT_V23: NrRrcLayout = {
  ...NR_RRC_LAYOUT_V17,
  messageOffset: 47,
  segmentIdOffset: 46,
};

const NR_RRC_PROFILES: ReadonlyMap<number, RrcProfile<NrRrcLayout>> = new Map([
  [7, { layout: NR_RRC_LAYOUT_V7, pduMap: NR_RRC_V7_PDUS }],
  [8, { layout: NR_RRC_LAYOUT_V7, pduMap: NR_RRC_V8_PDUS }],
  [9, { layout: NR_RRC_LAYOUT_V9, pduMap: NR_RRC_V9_PDUS }],
  [12, { layout: NR_RRC_LAYOUT_V12, pduMap: NR_RRC_V9_PDUS }],
  [14, { layout: NR_RRC_LAYOUT_V12, pduMap: NR_RRC_V14_PDUS }],
  [17, { layout: NR_RRC_LAYOUT_V17, pduMap: NR_RRC_V17_PDUS }],
  [19, { layout: NR_RRC_LAYOUT_V19, pduMap: NR_RRC_V17_PDUS }],
  [20, { layout: NR_RRC_LAYOUT_V19, pduMap: NR_RRC_V20_PDUS }],
  [23, { layout: NR_RRC_LAYOUT_V23, pduMap: NR_RRC_V20_PDUS }],
  [24, { layout: NR_RRC_LAYOUT_V23, pduMap: NR_RRC_V20_PDUS }],
  [25, { layout: NR_RRC_LAYOUT_V19, pduMap: NR_RRC_V17_PDUS }],
  [26, { layout: NR_RRC_LAYOUT_V23, pduMap: NR_RRC_V26_PDUS }],
  [28, { layout: NR_RRC_LAYOUT_V23, pduMap: NR_RRC_V28_PDUS }],
]);

function nrRrcProfile(view: DataView): VersionedRrcProfile<NrRrcLayout> | null {
  if (view.byteLength < 16) return null;
  const firstVersionByte = view.getUint8(12);
  const version = firstVersionByte === 7 || firstVersionByte === 8 ? firstVersionByte : view.getUint32(12, true);
  const profile = NR_RRC_PROFILES.get(version);
  return profile === undefined ? null : { version, ...profile };
}

export function isValidQualcommNrRrcEnvelope(packetLength: number, view: DataView): boolean {
  return hasValidRrcEnvelope(packetLength, view, nrRrcProfile(view));
}

export function decodeQualcommNrRrc(payload: Uint8Array, packetLength: number, view: DataView): NsgSignalingMessage | null {
  const profile = nrRrcProfile(view);
  if (!hasValidRrcEnvelope(packetLength, view, profile)) return null;
  const { layout, pduMap, version } = profile;
  const payloadBytes = view.getUint16(layout.messageLengthOffset, true);

  const pduId = view.getUint8(layout.pduIdOffset);
  const pdu = pduMap[pduId] ?? UNKNOWN_RRC_PDU;
  const metadata: NsgJsonObject = {
    packetVersion: version,
    rrcReleaseMajor: view.getUint8(16),
    rrcReleaseMinor: view.getUint8(17),
    sfnSubframe: bytesToHex(payload.subarray(layout.sfnSubframeOffset, layout.sfnSubframeOffset + layout.sfnSubframeBytes)),
    sibMask: layout.sibMaskBytes === 1 ? view.getUint8(layout.sibMaskOffset) : view.getUint32(layout.sibMaskOffset, true),
  };
  if (layout.packetVersionBytes === 1) metadata.packetVersionReserved = bytesToHex(payload.subarray(13, 16));
  if (layout.nrCellGlobalIdentityOffset !== null) {
    const nrCellGlobalIdentity = view.getBigUint64(layout.nrCellGlobalIdentityOffset, true);
    if (nrCellGlobalIdentity <= 0x0fffffffffffffffn) metadata.nrCellGlobalIdentity = nrCellGlobalIdentity.toString();
  }
  if (layout.segmentIdOffset !== null) metadata.segmentId = view.getUint8(layout.segmentIdOffset);

  return {
    packetLength,
    logCode: QUALCOMM_NR_RRC_OTA_LOG_CODE,
    version: String(version),
    rat: "NR",
    layer: "RRC",
    ...pdu,
    pduId,
    pci: nullableIdentity(view.getUint16(19, true), 0xffff),
    channelNumber: nullableIdentity(view.getUint32(layout.channelNumberOffset, true), 0xffffffff),
    rbid: view.getUint8(18),
    payloadBytes,
    payload: payload.subarray(layout.messageOffset, packetLength),
    metadata,
  };
}
