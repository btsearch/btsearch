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

export const QUALCOMM_LTE_RRC_OTA_LOG_CODE = 0xb0c0;

type LteRrcLayout = RrcLayout &
  Readonly<{
    rbidOffset: number;
    pciOffset: number;
    channelNumberOffset: number;
    channelNumberBytes: 2 | 4;
    sfnSubframeOffset: number;
    pduIdOffset: number;
    sibMaskOffset: number | null;
    nrRrcReleaseMajorOffset: number | null;
    nrRrcReleaseMinorOffset: number | null;
  }>;

const LTE_RRC_LEGACY_PDUS: RrcPduMap = {
  1: { direction: "DL", channel: "BCCH-BCH", pduType: null },
  2: { direction: "DL", channel: "BCCH-DL-SCH", pduType: null },
  3: { direction: "DL", channel: "MCCH", pduType: null },
  4: { direction: "DL", channel: "PCCH", pduType: null },
  5: { direction: "DL", channel: "DL-CCCH", pduType: null },
  6: { direction: "DL", channel: "DL-DCCH", pduType: null },
  7: { direction: "UL", channel: "UL-CCCH", pduType: null },
  8: { direction: "UL", channel: "UL-DCCH", pduType: null },
};

const LTE_RRC_V9_PDUS: RrcPduMap = {
  8: { direction: "DL", channel: "BCCH-BCH", pduType: null },
  9: { direction: "DL", channel: "BCCH-DL-SCH", pduType: null },
  10: { direction: "DL", channel: "MCCH", pduType: null },
  11: { direction: "DL", channel: "PCCH", pduType: null },
  12: { direction: "DL", channel: "DL-CCCH", pduType: null },
  13: { direction: "DL", channel: "DL-DCCH", pduType: null },
  14: { direction: "UL", channel: "UL-CCCH", pduType: null },
  15: { direction: "UL", channel: "UL-DCCH", pduType: null },
};

const LTE_RRC_V14_PDUS: RrcPduMap = {
  1: { direction: "DL", channel: "BCCH-BCH", pduType: null },
  2: { direction: "DL", channel: "BCCH-DL-SCH", pduType: null },
  4: { direction: "DL", channel: "MCCH", pduType: null },
  5: { direction: "DL", channel: "PCCH", pduType: null },
  6: { direction: "DL", channel: "DL-CCCH", pduType: null },
  7: { direction: "DL", channel: "DL-DCCH", pduType: null },
  8: { direction: "UL", channel: "UL-CCCH", pduType: null },
  9: { direction: "UL", channel: "UL-DCCH", pduType: null },
};

const LTE_RRC_MODERN_PDUS: RrcPduMap = {
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

const LTE_RRC_MODERN_ALTERNATE_PDUS: RrcPduMap = {
  ...LTE_RRC_V14_PDUS,
  54: { direction: "DL", channel: "BCCH-BCH-NB", pduType: null },
  55: { direction: "DL", channel: "BCCH-DL-SCH-NB", pduType: null },
  56: { direction: "DL", channel: "PCCH-NB", pduType: null },
  57: { direction: "DL", channel: "DL-CCCH-NB", pduType: null },
  58: { direction: "DL", channel: "DL-DCCH-NB", pduType: null },
  59: { direction: "UL", channel: "UL-CCCH-NB", pduType: null },
  61: { direction: "UL", channel: "UL-DCCH-NB", pduType: null },
};

const LTE_RRC_LAYOUT_V2: LteRrcLayout = {
  messageOffset: 25,
  messageLengthOffset: 23,
  segmentIdOffset: null,
  rbidOffset: 15,
  pciOffset: 16,
  channelNumberOffset: 18,
  channelNumberBytes: 2,
  sfnSubframeOffset: 20,
  pduIdOffset: 22,
  sibMaskOffset: null,
  nrRrcReleaseMajorOffset: null,
  nrRrcReleaseMinorOffset: null,
};

const LTE_RRC_LAYOUT_V6: LteRrcLayout = {
  ...LTE_RRC_LAYOUT_V2,
  messageOffset: 29,
  messageLengthOffset: 27,
  sibMaskOffset: 23,
};

const LTE_RRC_LAYOUT_V8: LteRrcLayout = {
  ...LTE_RRC_LAYOUT_V6,
  messageOffset: 31,
  messageLengthOffset: 29,
  channelNumberBytes: 4,
  sfnSubframeOffset: 22,
  pduIdOffset: 24,
  sibMaskOffset: 25,
};

const LTE_RRC_LAYOUT_V25: LteRrcLayout = {
  ...LTE_RRC_LAYOUT_V8,
  messageOffset: 33,
  messageLengthOffset: 31,
  rbidOffset: 17,
  pciOffset: 18,
  channelNumberOffset: 20,
  sfnSubframeOffset: 24,
  pduIdOffset: 26,
  sibMaskOffset: 27,
  nrRrcReleaseMajorOffset: 15,
  nrRrcReleaseMinorOffset: 16,
};

const LTE_RRC_LAYOUT_V30: LteRrcLayout = {
  ...LTE_RRC_LAYOUT_V25,
  messageOffset: 36,
  segmentIdOffset: 35,
};

const LTE_RRC_PROFILES: ReadonlyMap<number, RrcProfile<LteRrcLayout>> = new Map([
  [2, { layout: LTE_RRC_LAYOUT_V2, pduMap: LTE_RRC_LEGACY_PDUS }],
  [3, { layout: LTE_RRC_LAYOUT_V2, pduMap: LTE_RRC_LEGACY_PDUS }],
  [4, { layout: LTE_RRC_LAYOUT_V2, pduMap: LTE_RRC_LEGACY_PDUS }],
  [6, { layout: LTE_RRC_LAYOUT_V6, pduMap: LTE_RRC_LEGACY_PDUS }],
  [7, { layout: LTE_RRC_LAYOUT_V6, pduMap: LTE_RRC_LEGACY_PDUS }],
  [8, { layout: LTE_RRC_LAYOUT_V8, pduMap: LTE_RRC_LEGACY_PDUS }],
  [9, { layout: LTE_RRC_LAYOUT_V8, pduMap: LTE_RRC_V9_PDUS }],
  [12, { layout: LTE_RRC_LAYOUT_V8, pduMap: LTE_RRC_V9_PDUS }],
  [13, { layout: LTE_RRC_LAYOUT_V8, pduMap: LTE_RRC_LEGACY_PDUS }],
  [14, { layout: LTE_RRC_LAYOUT_V8, pduMap: LTE_RRC_V14_PDUS }],
  [15, { layout: LTE_RRC_LAYOUT_V8, pduMap: LTE_RRC_V14_PDUS }],
  [16, { layout: LTE_RRC_LAYOUT_V8, pduMap: LTE_RRC_V14_PDUS }],
  [19, { layout: LTE_RRC_LAYOUT_V8, pduMap: LTE_RRC_MODERN_PDUS }],
  [20, { layout: LTE_RRC_LAYOUT_V8, pduMap: LTE_RRC_MODERN_ALTERNATE_PDUS }],
  [22, { layout: LTE_RRC_LAYOUT_V8, pduMap: LTE_RRC_LEGACY_PDUS }],
  [24, { layout: LTE_RRC_LAYOUT_V8, pduMap: LTE_RRC_MODERN_ALTERNATE_PDUS }],
  [25, { layout: LTE_RRC_LAYOUT_V25, pduMap: LTE_RRC_MODERN_ALTERNATE_PDUS }],
  [26, { layout: LTE_RRC_LAYOUT_V25, pduMap: LTE_RRC_MODERN_PDUS }],
  [27, { layout: LTE_RRC_LAYOUT_V25, pduMap: LTE_RRC_MODERN_PDUS }],
  [29, { layout: LTE_RRC_LAYOUT_V25, pduMap: LTE_RRC_MODERN_PDUS }],
  [30, { layout: LTE_RRC_LAYOUT_V30, pduMap: LTE_RRC_MODERN_PDUS }],
  [31, { layout: LTE_RRC_LAYOUT_V30, pduMap: LTE_RRC_MODERN_PDUS }],
]);

function lteRrcProfile(view: DataView): VersionedRrcProfile<LteRrcLayout> | null {
  if (view.byteLength < 13) return null;
  const version = view.getUint8(12);
  const profile = LTE_RRC_PROFILES.get(version);
  return profile === undefined ? null : { version, ...profile };
}

export function isValidQualcommLteRrcEnvelope(packetLength: number, view: DataView): boolean {
  return hasValidRrcEnvelope(packetLength, view, lteRrcProfile(view));
}

export function decodeQualcommLteRrc(payload: Uint8Array, packetLength: number, view: DataView): NsgSignalingMessage | null {
  const profile = lteRrcProfile(view);
  if (!hasValidRrcEnvelope(packetLength, view, profile)) return null;
  const { layout, pduMap, version } = profile;
  const payloadBytes = view.getUint16(layout.messageLengthOffset, true);

  const pduId = view.getUint8(layout.pduIdOffset);
  const pdu = pduMap[pduId] ?? UNKNOWN_RRC_PDU;
  const sfnSubframe = view.getUint16(layout.sfnSubframeOffset, true);
  const metadata: NsgJsonObject = {
    packetVersion: version,
    rrcReleaseMajor: view.getUint8(13),
    rrcReleaseMinor: view.getUint8(14),
    sfn: sfnSubframe >>> 4,
    subframe: sfnSubframe & 0x0f,
  };
  if (layout.nrRrcReleaseMajorOffset !== null) metadata.nrRrcReleaseMajor = view.getUint8(layout.nrRrcReleaseMajorOffset);
  if (layout.nrRrcReleaseMinorOffset !== null) metadata.nrRrcReleaseMinor = view.getUint8(layout.nrRrcReleaseMinorOffset);
  if (layout.sibMaskOffset !== null) metadata.sibMask = view.getUint32(layout.sibMaskOffset, true);
  if (layout.segmentIdOffset !== null) metadata.segmentId = view.getUint8(layout.segmentIdOffset);

  const channelNumber =
    layout.channelNumberBytes === 2
      ? nullableIdentity(view.getUint16(layout.channelNumberOffset, true), 0xffff)
      : nullableIdentity(view.getUint32(layout.channelNumberOffset, true), 0xffffffff);

  return {
    packetLength,
    logCode: QUALCOMM_LTE_RRC_OTA_LOG_CODE,
    version: String(version),
    rat: "LTE",
    layer: "RRC",
    ...pdu,
    pduId,
    pci: nullableIdentity(view.getUint16(layout.pciOffset, true), 0xffff),
    channelNumber,
    rbid: view.getUint8(layout.rbidOffset),
    payloadBytes,
    payload: payload.subarray(layout.messageOffset, packetLength),
    metadata,
  };
}
