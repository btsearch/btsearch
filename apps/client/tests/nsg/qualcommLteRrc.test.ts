import assert from "node:assert/strict";
import test from "node:test";

import { readDiagPrefix } from "../../src/lib/nsg-parser/internal/qualcomm/diag";
import { decodeQualcommSignaling, isValidQualcommSignalingEnvelope } from "../../src/lib/nsg-parser/internal/qualcomm/signaling/decoder";
import { QUALCOMM_LTE_RRC_OTA_LOG_CODE } from "../../src/lib/nsg-parser/qualcomm";
import { bytesFromHex as fromHex, setUint16LE as setUint16 } from "./binary";
import { createLteV27PcchPacket, createLteV30PcchPacket } from "./fixtures/qualcommSignalingPackets";

type SyntheticLteLayout = Readonly<{
  messageOffset: number;
  messageLengthOffset: number;
  segmentIdOffset: number | null;
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

const SYNTHETIC_LTE_V2: SyntheticLteLayout = {
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

const SYNTHETIC_LTE_V6: SyntheticLteLayout = {
  ...SYNTHETIC_LTE_V2,
  messageOffset: 29,
  messageLengthOffset: 27,
  sibMaskOffset: 23,
};

const SYNTHETIC_LTE_V8: SyntheticLteLayout = {
  ...SYNTHETIC_LTE_V6,
  messageOffset: 31,
  messageLengthOffset: 29,
  channelNumberBytes: 4,
  sfnSubframeOffset: 22,
  pduIdOffset: 24,
  sibMaskOffset: 25,
};

const SYNTHETIC_LTE_V25: SyntheticLteLayout = {
  ...SYNTHETIC_LTE_V8,
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

const SYNTHETIC_LTE_V30: SyntheticLteLayout = {
  ...SYNTHETIC_LTE_V25,
  messageOffset: 36,
  segmentIdOffset: 35,
};

function syntheticLtePacket(version: number, layout: SyntheticLteLayout, pduId: number, message: Uint8Array = fromHex("dead")): Uint8Array {
  const packet = new Uint8Array(layout.messageOffset + message.length);
  const view = new DataView(packet.buffer);
  view.setUint16(0, packet.length, true);
  view.setUint16(2, QUALCOMM_LTE_RRC_OTA_LOG_CODE, true);
  view.setUint8(12, version);
  view.setUint8(13, 17);
  view.setUint8(14, 32);
  view.setUint8(layout.rbidOffset, 7);
  view.setUint16(layout.pciOffset, 321, true);
  if (layout.channelNumberBytes === 2) view.setUint16(layout.channelNumberOffset, 6400, true);
  else view.setUint32(layout.channelNumberOffset, 6400, true);
  view.setUint16(layout.sfnSubframeOffset, 0x3456, true);
  view.setUint8(layout.pduIdOffset, pduId);
  view.setUint16(layout.messageLengthOffset, message.length, true);
  if (layout.sibMaskOffset !== null) view.setUint32(layout.sibMaskOffset, 0x11223344, true);
  if (layout.nrRrcReleaseMajorOffset !== null) view.setUint8(layout.nrRrcReleaseMajorOffset, 18);
  if (layout.nrRrcReleaseMinorOffset !== null) view.setUint8(layout.nrRrcReleaseMinorOffset, 64);
  if (layout.segmentIdOffset !== null) view.setUint8(layout.segmentIdOffset, 3);
  packet.set(message, layout.messageOffset);
  return packet;
}

void test("decodes every explicitly supported LTE RRC version with its layout and PDU map", () => {
  const cases = [
    [2, SYNTHETIC_LTE_V2, 4, "PCCH"],
    [3, SYNTHETIC_LTE_V2, 4, "PCCH"],
    [4, SYNTHETIC_LTE_V2, 4, "PCCH"],
    [6, SYNTHETIC_LTE_V6, 4, "PCCH"],
    [7, SYNTHETIC_LTE_V6, 4, "PCCH"],
    [8, SYNTHETIC_LTE_V8, 4, "PCCH"],
    [9, SYNTHETIC_LTE_V8, 11, "PCCH"],
    [12, SYNTHETIC_LTE_V8, 11, "PCCH"],
    [13, SYNTHETIC_LTE_V8, 4, "PCCH"],
    [14, SYNTHETIC_LTE_V8, 5, "PCCH"],
    [15, SYNTHETIC_LTE_V8, 5, "PCCH"],
    [16, SYNTHETIC_LTE_V8, 5, "PCCH"],
    [19, SYNTHETIC_LTE_V8, 47, "PCCH-NB"],
    [20, SYNTHETIC_LTE_V8, 56, "PCCH-NB"],
    [22, SYNTHETIC_LTE_V8, 4, "PCCH"],
    [24, SYNTHETIC_LTE_V8, 56, "PCCH-NB"],
    [25, SYNTHETIC_LTE_V25, 56, "PCCH-NB"],
    [26, SYNTHETIC_LTE_V25, 47, "PCCH-NB"],
    [27, SYNTHETIC_LTE_V25, 47, "PCCH-NB"],
    [29, SYNTHETIC_LTE_V25, 47, "PCCH-NB"],
    [30, SYNTHETIC_LTE_V30, 47, "PCCH-NB"],
    [31, SYNTHETIC_LTE_V30, 47, "PCCH-NB"],
  ] as const;

  for (const [version, layout, pduId, channel] of cases) {
    const packet = syntheticLtePacket(version, layout, pduId);
    const prefix = readDiagPrefix(packet);
    assert.ok(prefix);
    assert.equal(isValidQualcommSignalingEnvelope(packet.subarray(0, 47), prefix), true);
    const decoded = decodeQualcommSignaling(packet);
    assert.ok(decoded, `LTE v${version}`);
    assert.equal(decoded.version, String(version));
    assert.equal(decoded.direction, "DL");
    assert.equal(decoded.channel, channel);
    assert.equal(decoded.pduId, pduId);
    assert.equal(decoded.pci, 321);
    assert.equal(decoded.channelNumber, 6400);
    assert.equal(decoded.rbid, 7);
    assert.equal(decoded.payloadBytes, 2);
    assert.deepEqual(decoded.payload, fromHex("dead"));
    assert.equal(decoded.metadata.packetVersion, version);
    assert.equal(decoded.metadata.rrcReleaseMajor, 17);
    assert.equal(decoded.metadata.rrcReleaseMinor, 32);
    assert.equal(decoded.metadata.sfn, 0x345);
    assert.equal(decoded.metadata.subframe, 6);
    assert.equal("sibMask" in decoded.metadata, layout.sibMaskOffset !== null);
    assert.equal("nrRrcReleaseMajor" in decoded.metadata, layout.nrRrcReleaseMajorOffset !== null);
    assert.equal(decoded.metadata.nrRrcReleaseMajor, layout.nrRrcReleaseMajorOffset === null ? undefined : 18);
    assert.equal(decoded.metadata.nrRrcReleaseMinor, layout.nrRrcReleaseMinorOffset === null ? undefined : 64);
    assert.equal(decoded.metadata.segmentId, layout.segmentIdOffset === null ? undefined : 3);
  }
});

void test("maps every source-backed LTE RRC PDU group", () => {
  const v14Pdus = [
    [1, "DL", "BCCH-BCH"],
    [2, "DL", "BCCH-DL-SCH"],
    [4, "DL", "MCCH"],
    [5, "DL", "PCCH"],
    [6, "DL", "DL-CCCH"],
    [7, "DL", "DL-DCCH"],
    [8, "UL", "UL-CCCH"],
    [9, "UL", "UL-DCCH"],
  ] as const;
  const groups = [
    {
      version: 2,
      layout: SYNTHETIC_LTE_V2,
      unmappedPduId: 9,
      pdus: [
        [1, "DL", "BCCH-BCH"],
        [2, "DL", "BCCH-DL-SCH"],
        [3, "DL", "MCCH"],
        [4, "DL", "PCCH"],
        [5, "DL", "DL-CCCH"],
        [6, "DL", "DL-DCCH"],
        [7, "UL", "UL-CCCH"],
        [8, "UL", "UL-DCCH"],
      ],
    },
    {
      version: 9,
      layout: SYNTHETIC_LTE_V8,
      unmappedPduId: 1,
      pdus: [
        [8, "DL", "BCCH-BCH"],
        [9, "DL", "BCCH-DL-SCH"],
        [10, "DL", "MCCH"],
        [11, "DL", "PCCH"],
        [12, "DL", "DL-CCCH"],
        [13, "DL", "DL-DCCH"],
        [14, "UL", "UL-CCCH"],
        [15, "UL", "UL-DCCH"],
      ],
    },
    { version: 14, layout: SYNTHETIC_LTE_V8, unmappedPduId: 3, pdus: v14Pdus },
    {
      version: 30,
      layout: SYNTHETIC_LTE_V30,
      unmappedPduId: 2,
      pdus: [
        [1, "DL", "BCCH-BCH"],
        [3, "DL", "BCCH-DL-SCH"],
        [6, "DL", "MCCH"],
        [7, "DL", "PCCH"],
        [8, "DL", "DL-CCCH"],
        [9, "DL", "DL-DCCH"],
        [10, "UL", "UL-CCCH"],
        [11, "UL", "UL-DCCH"],
        [45, "DL", "BCCH-BCH-NB"],
        [46, "DL", "BCCH-DL-SCH-NB"],
        [47, "DL", "PCCH-NB"],
        [48, "DL", "DL-CCCH-NB"],
        [49, "DL", "DL-DCCH-NB"],
        [50, "UL", "UL-CCCH-NB"],
        [52, "UL", "UL-DCCH-NB"],
      ],
    },
    {
      version: 25,
      layout: SYNTHETIC_LTE_V25,
      unmappedPduId: 3,
      pdus: [
        ...v14Pdus,
        [54, "DL", "BCCH-BCH-NB"],
        [55, "DL", "BCCH-DL-SCH-NB"],
        [56, "DL", "PCCH-NB"],
        [57, "DL", "DL-CCCH-NB"],
        [58, "DL", "DL-DCCH-NB"],
        [59, "UL", "UL-CCCH-NB"],
        [61, "UL", "UL-DCCH-NB"],
      ],
    },
  ] as const;

  for (const group of groups) {
    for (const [pduId, direction, channel] of group.pdus) {
      const decoded = decodeQualcommSignaling(syntheticLtePacket(group.version, group.layout, pduId));
      assert.equal(decoded?.direction, direction, `LTE v${group.version} PDU ${pduId}`);
      assert.equal(decoded?.channel, channel, `LTE v${group.version} PDU ${pduId}`);
      assert.equal(decoded?.pduType, null, `LTE v${group.version} PDU ${pduId}`);
    }
    const unmapped = decodeQualcommSignaling(syntheticLtePacket(group.version, group.layout, group.unmappedPduId));
    assert.equal(unmapped?.direction, "unknown");
    assert.equal(unmapped?.channel, null);
    assert.equal(unmapped?.pduType, null);
  }
});

void test("rejects adjacent unsupported LTE RRC versions", () => {
  const unsupportedVersions = [1, 5, 10, 11, 17, 18, 21, 23, 28, 32];
  for (const version of unsupportedVersions)
    assert.equal(decodeQualcommSignaling(syntheticLtePacket(version, SYNTHETIC_LTE_V30, 7)), null, `LTE v${version}`);
});

void test("accepts zero-length LTE RRC messages at every distinct layout boundary", () => {
  const cases = [
    [2, SYNTHETIC_LTE_V2, 4],
    [6, SYNTHETIC_LTE_V6, 4],
    [8, SYNTHETIC_LTE_V8, 4],
    [25, SYNTHETIC_LTE_V25, 56],
    [30, SYNTHETIC_LTE_V30, 47],
  ] as const;

  for (const [version, layout, pduId] of cases) {
    const decoded = decodeQualcommSignaling(syntheticLtePacket(version, layout, pduId, new Uint8Array()));
    assert.ok(decoded, `LTE v${version}`);
    assert.equal(decoded.packetLength, layout.messageOffset);
    assert.equal(decoded.payloadBytes, 0);
    assert.deepEqual(decoded.payload, new Uint8Array());
  }
});

void test("preserves zero LTE identities and normalizes all-ones PCI and channel sentinels", () => {
  for (const [version, layout] of [
    [2, SYNTHETIC_LTE_V2],
    [8, SYNTHETIC_LTE_V8],
  ] as const) {
    const zeroPacket = syntheticLtePacket(version, layout, 4);
    const zeroView = new DataView(zeroPacket.buffer);
    zeroView.setUint16(layout.pciOffset, 0, true);
    if (layout.channelNumberBytes === 2) zeroView.setUint16(layout.channelNumberOffset, 0, true);
    else zeroView.setUint32(layout.channelNumberOffset, 0, true);
    const zero = decodeQualcommSignaling(zeroPacket);
    assert.equal(zero?.pci, 0, `LTE v${version} zero PCI`);
    assert.equal(zero?.channelNumber, 0, `LTE v${version} zero channel`);

    const unavailablePacket = syntheticLtePacket(version, layout, 4);
    const unavailableView = new DataView(unavailablePacket.buffer);
    unavailableView.setUint16(layout.pciOffset, 0xffff, true);
    if (layout.channelNumberBytes === 2) unavailableView.setUint16(layout.channelNumberOffset, 0xffff, true);
    else unavailableView.setUint32(layout.channelNumberOffset, 0xffffffff, true);
    const unavailable = decodeQualcommSignaling(unavailablePacket);
    assert.equal(unavailable?.pci, null, `LTE v${version} unavailable PCI`);
    assert.equal(unavailable?.channelNumber, null, `LTE v${version} unavailable channel`);
  }
});

void test("decodes the real LTE RRC v30 transport envelope", () => {
  assert.deepEqual(decodeQualcommSignaling(createLteV30PcchPacket()), {
    packetLength: 43,
    logCode: QUALCOMM_LTE_RRC_OTA_LOG_CODE,
    version: "30",
    rat: "LTE",
    layer: "RRC",
    direction: "DL",
    channel: "PCCH",
    pduType: null,
    pduId: 7,
    pci: 208,
    channelNumber: 3175,
    rbid: 0,
    payloadBytes: 7,
    payload: fromHex("40005e779a0780"),
    metadata: {
      packetVersion: 30,
      rrcReleaseMajor: 17,
      rrcReleaseMinor: 32,
      nrRrcReleaseMajor: 17,
      nrRrcReleaseMinor: 128,
      sfn: 909,
      subframe: 9,
      sibMask: 0,
      segmentId: 0,
    },
  });
});

void test("decodes the real LTE RRC v27 transport envelope without claiming an ASN.1 message", () => {
  assert.deepEqual(decodeQualcommSignaling(createLteV27PcchPacket()), {
    packetLength: 40,
    logCode: QUALCOMM_LTE_RRC_OTA_LOG_CODE,
    version: "27",
    rat: "LTE",
    layer: "RRC",
    direction: "DL",
    channel: "PCCH",
    pduType: null,
    pduId: 7,
    pci: 65,
    channelNumber: 3175,
    rbid: 0,
    payloadBytes: 7,
    payload: fromHex("40006fb86b8240"),
    metadata: {
      packetVersion: 27,
      rrcReleaseMajor: 16,
      rrcReleaseMinor: 16,
      nrRrcReleaseMajor: 15,
      nrRrcReleaseMinor: 160,
      sfn: 562,
      subframe: 9,
      sibMask: 0,
    },
  });
});

void test("retains LTE v30 segment provenance without treating partial transport as malformed", () => {
  const segment = createLteV30PcchPacket();
  segment[35] = 3;
  assert.equal(decodeQualcommSignaling(segment)?.metadata.segmentId, 3);
});

void test("preserves unknown LTE RRC PDUs without inventing names", () => {
  const packet = createLteV27PcchPacket();
  packet[26] = 0xff;
  const decoded = decodeQualcommSignaling(packet);
  assert.equal(decoded?.direction, "unknown");
  assert.equal(decoded?.channel, null);
  assert.equal(decoded?.pduType, null);
  assert.equal(decoded?.pduId, 0xff);
});

void test("returns null for unsupported or inconsistent LTE RRC packets", () => {
  const wrongVersion = createLteV27PcchPacket();
  wrongVersion[12] = 28;
  const wrongV30Version = createLteV30PcchPacket();
  wrongV30Version[12] = 32;
  const wrongMessageLength = setUint16(createLteV27PcchPacket(), 31, 8);
  const wrongV30MessageLength = setUint16(createLteV30PcchPacket(), 31, 8);
  const truncatedV30 = createLteV30PcchPacket().subarray(0, 35);

  for (const payload of [wrongVersion, wrongV30Version, wrongMessageLength, wrongV30MessageLength, truncatedV30])
    assert.doesNotThrow(() => {
      assert.equal(decodeQualcommSignaling(payload), null);
    });
});
