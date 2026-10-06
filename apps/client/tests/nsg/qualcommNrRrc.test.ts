import assert from "node:assert/strict";
import test from "node:test";

import { readDiagPrefix } from "../../src/lib/nsg-parser/internal/qualcomm/diag";
import { decodeQualcommSignaling, isValidQualcommSignalingEnvelope } from "../../src/lib/nsg-parser/internal/qualcomm/signaling/decoder";
import { QUALCOMM_NR_RRC_OTA_LOG_CODE } from "../../src/lib/nsg-parser/qualcomm";
import { bytesFromHex as fromHex, setUint16LE as setUint16 } from "./binary";
import {
  createNrV12RadioBearerConfigPacket,
  createNrV12ReconfigurationCompletePacket,
  createNrV26RadioBearerConfigPacket,
  createNrV26UlDcchPacket,
} from "./fixtures/qualcommSignalingPackets";

type SyntheticNrLayout = Readonly<{
  messageOffset: number;
  messageLengthOffset: number;
  segmentIdOffset: number | null;
  packetVersionBytes: 1 | 4;
  channelNumberOffset: number;
  sfnSubframeOffset: number;
  sfnSubframeBytes: 3 | 4;
  pduIdOffset: number;
  sibMaskOffset: number;
  sibMaskBytes: 1 | 4;
  nrCellGlobalIdentityOffset: number | null;
}>;

const SYNTHETIC_NR_V7: SyntheticNrLayout = {
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

const SYNTHETIC_NR_V9: SyntheticNrLayout = {
  ...SYNTHETIC_NR_V7,
  packetVersionBytes: 4,
  sibMaskBytes: 4,
};

const SYNTHETIC_NR_V12: SyntheticNrLayout = {
  ...SYNTHETIC_NR_V9,
  messageOffset: 35,
  messageLengthOffset: 33,
  sfnSubframeBytes: 3,
  pduIdOffset: 28,
  sibMaskOffset: 29,
};

const SYNTHETIC_NR_V17: SyntheticNrLayout = {
  ...SYNTHETIC_NR_V12,
  messageOffset: 43,
  messageLengthOffset: 41,
  channelNumberOffset: 29,
  sfnSubframeOffset: 33,
  pduIdOffset: 36,
  sibMaskOffset: 37,
  nrCellGlobalIdentityOffset: 21,
};

const SYNTHETIC_NR_V19: SyntheticNrLayout = {
  ...SYNTHETIC_NR_V17,
  messageOffset: 44,
};

const SYNTHETIC_NR_V23: SyntheticNrLayout = {
  ...SYNTHETIC_NR_V17,
  messageOffset: 47,
  segmentIdOffset: 46,
};

function syntheticNrPacket(version: number, layout: SyntheticNrLayout, pduId: number, message: Uint8Array = fromHex("beef")): Uint8Array {
  const packet = new Uint8Array(layout.messageOffset + message.length);
  const view = new DataView(packet.buffer);
  view.setUint16(0, packet.length, true);
  view.setUint16(2, QUALCOMM_NR_RRC_OTA_LOG_CODE, true);
  if (layout.packetVersionBytes === 1) {
    view.setUint8(12, version);
    packet.set(fromHex("a1b2c3"), 13);
  } else view.setUint32(12, version, true);
  view.setUint8(16, 18);
  view.setUint8(17, 64);
  view.setUint8(18, 6);
  view.setUint16(19, 123, true);
  if (layout.nrCellGlobalIdentityOffset !== null) view.setBigUint64(layout.nrCellGlobalIdentityOffset, 0x123456789abcdefn, true);
  view.setUint32(layout.channelNumberOffset, 640000, true);
  packet.set(fromHex("11223344").subarray(0, layout.sfnSubframeBytes), layout.sfnSubframeOffset);
  view.setUint8(layout.pduIdOffset, pduId);
  if (layout.sibMaskBytes === 1) {
    view.setUint8(layout.sibMaskOffset, 0x44);
    packet.set(fromHex("a1b2c3"), layout.sibMaskOffset + 1);
  } else view.setUint32(layout.sibMaskOffset, 0x11223344, true);
  view.setUint16(layout.messageLengthOffset, message.length, true);
  if (layout.segmentIdOffset !== null) view.setUint8(layout.segmentIdOffset, 5);
  packet.set(message, layout.messageOffset);
  return packet;
}

void test("decodes every explicitly supported NR RRC version with its layout and PDU map", () => {
  const cases = [
    [7, SYNTHETIC_NR_V7, 24, "unknown", null, "nr-RadioBearerConfig"],
    [8, SYNTHETIC_NR_V7, 26, "unknown", null, "nr-RadioBearerConfig"],
    [9, SYNTHETIC_NR_V9, 28, "unknown", null, "UE-MRDC-Capability"],
    [12, SYNTHETIC_NR_V12, 28, "unknown", null, "UE-MRDC-Capability"],
    [14, SYNTHETIC_NR_V12, 31, "unknown", null, "UE-MRDC-Capability"],
    [17, SYNTHETIC_NR_V17, 29, "unknown", null, "nr-RadioBearerConfig"],
    [19, SYNTHETIC_NR_V19, 29, "unknown", null, "nr-RadioBearerConfig"],
    [20, SYNTHETIC_NR_V19, 10, "DL", null, "RRCReconfiguration"],
    [23, SYNTHETIC_NR_V23, 10, "DL", null, "RRCReconfiguration"],
    [24, SYNTHETIC_NR_V23, 10, "DL", null, "RRCReconfiguration"],
    [25, SYNTHETIC_NR_V19, 29, "unknown", null, "nr-RadioBearerConfig"],
    [26, SYNTHETIC_NR_V23, 11, "DL", null, "RRCReconfiguration"],
    [28, SYNTHETIC_NR_V23, 10, "UL", "UL-DCCH", null],
  ] as const;

  for (const [version, layout, pduId, direction, channel, pduType] of cases) {
    const packet = syntheticNrPacket(version, layout, pduId);
    const prefix = readDiagPrefix(packet);
    assert.ok(prefix);
    assert.equal(isValidQualcommSignalingEnvelope(packet.subarray(0, 47), prefix), true);
    const decoded = decodeQualcommSignaling(packet);
    assert.ok(decoded, `NR v${version}`);
    assert.equal(decoded.version, String(version));
    assert.equal(decoded.direction, direction);
    assert.equal(decoded.channel, channel);
    assert.equal(decoded.pduType, pduType);
    assert.equal(decoded.pduId, pduId);
    assert.equal(decoded.pci, 123);
    assert.equal(decoded.channelNumber, 640000);
    assert.equal(decoded.rbid, 6);
    assert.equal(decoded.payloadBytes, 2);
    assert.deepEqual(decoded.payload, fromHex("beef"));
    assert.equal(decoded.metadata.packetVersion, version);
    assert.equal(decoded.metadata.rrcReleaseMajor, 18);
    assert.equal(decoded.metadata.rrcReleaseMinor, 64);
    assert.equal(decoded.metadata.sfnSubframe, layout.sfnSubframeBytes === 4 ? "11223344" : "112233");
    assert.equal(decoded.metadata.sibMask, layout.sibMaskBytes === 1 ? 0x44 : 0x11223344);
    assert.equal(decoded.metadata.packetVersionReserved, layout.packetVersionBytes === 1 ? "a1b2c3" : undefined);
    assert.equal(decoded.metadata.nrCellGlobalIdentity, layout.nrCellGlobalIdentityOffset === null ? undefined : 0x123456789abcdefn.toString());
    assert.equal(decoded.metadata.segmentId, layout.segmentIdOffset === null ? undefined : 5);
  }
});

void test("maps every source-backed NR RRC PDU group", () => {
  const legacyPdus = [
    [1, "DL", "BCCH-BCH", null],
    [2, "DL", "BCCH-DL-SCH", null],
    [3, "DL", "DL-CCCH", null],
    [4, "DL", "DL-DCCH", null],
    [5, "DL", "PCCH", null],
    [6, "UL", "UL-CCCH", null],
    [7, "UL", "UL-CCCH1", null],
    [8, "UL", "UL-DCCH", null],
    [9, "DL", null, "RRCReconfiguration"],
    [10, "UL", null, "RRCReconfigurationComplete"],
  ] as const;
  const modernPdus = [
    [1, "DL", "BCCH-BCH", null],
    [2, "DL", "BCCH-DL-SCH", null],
    [3, "DL", "DL-CCCH", null],
    [4, "DL", "DL-DCCH", null],
    [5, "DL", "MCCH", null],
    [6, "DL", "PCCH", null],
    [7, "UL", "UL-CCCH", null],
    [8, "UL", "UL-CCCH1", null],
    [9, "UL", "UL-DCCH", null],
  ] as const;
  const groups = [
    {
      version: 7,
      layout: SYNTHETIC_NR_V7,
      unmappedPduId: 2,
      pdus: [
        [1, "DL", "BCCH-BCH", null],
        [8, "UL", "UL-DCCH", null],
        [9, "DL", null, "RRCReconfiguration"],
        [10, "UL", null, "RRCReconfigurationComplete"],
        [24, "unknown", null, "nr-RadioBearerConfig"],
      ],
    },
    {
      version: 8,
      layout: SYNTHETIC_NR_V7,
      unmappedPduId: 24,
      pdus: [
        [1, "DL", "BCCH-BCH", null],
        [8, "UL", "UL-DCCH", null],
        [9, "DL", null, "RRCReconfiguration"],
        [10, "UL", null, "RRCReconfigurationComplete"],
        [26, "unknown", null, "nr-RadioBearerConfig"],
      ],
    },
    {
      version: 9,
      layout: SYNTHETIC_NR_V9,
      unmappedPduId: 24,
      pdus: [
        ...legacyPdus,
        [25, "unknown", null, "nr-RadioBearerConfig"],
        [28, "unknown", null, "UE-MRDC-Capability"],
        [29, "unknown", null, "UE-NR-Capability"],
      ],
    },
    {
      version: 14,
      layout: SYNTHETIC_NR_V12,
      unmappedPduId: 25,
      pdus: [
        ...legacyPdus,
        [28, "unknown", null, "nr-RadioBearerConfig"],
        [31, "unknown", null, "UE-MRDC-Capability"],
        [32, "unknown", null, "UE-NR-Capability"],
        [33, "unknown", null, "UE-NR-Capability"],
      ],
    },
    {
      version: 17,
      layout: SYNTHETIC_NR_V17,
      unmappedPduId: 28,
      pdus: [...legacyPdus, [29, "unknown", null, "nr-RadioBearerConfig"]],
    },
    {
      version: 20,
      layout: SYNTHETIC_NR_V19,
      unmappedPduId: 12,
      pdus: [
        ...modernPdus,
        [10, "DL", null, "RRCReconfiguration"],
        [11, "UL", null, "RRCReconfigurationComplete"],
        [36, "unknown", null, "nr-RadioBearerConfig"],
      ],
    },
    {
      version: 26,
      layout: SYNTHETIC_NR_V23,
      unmappedPduId: 10,
      pdus: [
        ...modernPdus,
        [11, "DL", null, "RRCReconfiguration"],
        [12, "UL", null, "RRCReconfigurationComplete"],
        [36, "unknown", null, "nr-RadioBearerConfig"],
      ],
    },
    {
      version: 28,
      layout: SYNTHETIC_NR_V23,
      unmappedPduId: 13,
      pdus: [
        ...modernPdus,
        [10, "UL", "UL-DCCH", null],
        [11, "DL", null, "RRCReconfiguration"],
        [12, "UL", null, "RRCReconfigurationComplete"],
        [36, "unknown", null, "nr-RadioBearerConfig"],
      ],
    },
  ] as const;

  for (const group of groups) {
    for (const [pduId, direction, channel, pduType] of group.pdus) {
      const decoded = decodeQualcommSignaling(syntheticNrPacket(group.version, group.layout, pduId));
      assert.equal(decoded?.direction, direction, `NR v${group.version} PDU ${pduId}`);
      assert.equal(decoded?.channel, channel, `NR v${group.version} PDU ${pduId}`);
      assert.equal(decoded?.pduType, pduType, `NR v${group.version} PDU ${pduId}`);
    }
    const unmapped = decodeQualcommSignaling(syntheticNrPacket(group.version, group.layout, group.unmappedPduId));
    assert.equal(unmapped?.direction, "unknown");
    assert.equal(unmapped?.channel, null);
    assert.equal(unmapped?.pduType, null);
  }
});

void test("rejects adjacent unsupported NR RRC versions", () => {
  const unsupportedVersions = [6, 10, 11, 13, 15, 16, 18, 21, 22, 27, 29];
  for (const version of unsupportedVersions)
    assert.equal(decodeQualcommSignaling(syntheticNrPacket(version, SYNTHETIC_NR_V23, 6)), null, `NR v${version}`);
});

void test("accepts zero-length NR RRC messages at every distinct layout boundary", () => {
  const cases = [
    [7, SYNTHETIC_NR_V7, 24],
    [9, SYNTHETIC_NR_V9, 28],
    [12, SYNTHETIC_NR_V12, 28],
    [17, SYNTHETIC_NR_V17, 29],
    [19, SYNTHETIC_NR_V19, 29],
    [23, SYNTHETIC_NR_V23, 10],
  ] as const;

  for (const [version, layout, pduId] of cases) {
    const decoded = decodeQualcommSignaling(syntheticNrPacket(version, layout, pduId, new Uint8Array()));
    assert.ok(decoded, `NR v${version}`);
    assert.equal(decoded.packetLength, layout.messageOffset);
    assert.equal(decoded.payloadBytes, 0);
    assert.deepEqual(decoded.payload, new Uint8Array());
  }
});

void test("preserves zero NR identities and normalizes all-ones PCI and channel sentinels", () => {
  const zeroPacket = syntheticNrPacket(17, SYNTHETIC_NR_V17, 29);
  const zeroView = new DataView(zeroPacket.buffer);
  zeroView.setUint16(19, 0, true);
  zeroView.setUint32(SYNTHETIC_NR_V17.channelNumberOffset, 0, true);
  const zero = decodeQualcommSignaling(zeroPacket);
  assert.equal(zero?.pci, 0);
  assert.equal(zero?.channelNumber, 0);

  const unavailablePacket = syntheticNrPacket(17, SYNTHETIC_NR_V17, 29);
  const unavailableView = new DataView(unavailablePacket.buffer);
  unavailableView.setUint16(19, 0xffff, true);
  unavailableView.setUint32(SYNTHETIC_NR_V17.channelNumberOffset, 0xffffffff, true);
  const unavailable = decodeQualcommSignaling(unavailablePacket);
  assert.equal(unavailable?.pci, null);
  assert.equal(unavailable?.channelNumber, null);
});

void test("keeps NR v7 and v8 reserved bytes separate", () => {
  for (const version of [7, 8]) {
    const pduId = version === 7 ? 24 : 26;
    const decoded = decodeQualcommSignaling(syntheticNrPacket(version, SYNTHETIC_NR_V7, pduId));
    assert.equal(decoded?.version, String(version));
    assert.equal(decoded?.metadata.packetVersionReserved, "a1b2c3");
    assert.equal(decoded?.metadata.sibMask, 0x44);
  }
});

void test("accepts the maximum 60-bit NCGI and omits the first invalid value", () => {
  const maximum = syntheticNrPacket(17, SYNTHETIC_NR_V17, 29);
  new DataView(maximum.buffer).setBigUint64(21, 0x0fffffffffffffffn, true);
  assert.equal(decodeQualcommSignaling(maximum)?.metadata.nrCellGlobalIdentity, 0x0fffffffffffffffn.toString());

  const firstInvalid = syntheticNrPacket(17, SYNTHETIC_NR_V17, 29);
  new DataView(firstInvalid.buffer).setBigUint64(21, 0x1000000000000000n, true);
  const decoded = decodeQualcommSignaling(firstInvalid);
  assert.ok(decoded);
  assert.equal("nrCellGlobalIdentity" in decoded.metadata, false);
});

void test("decodes real NR RRC v12 direct PDUs and normalizes unavailable identities", () => {
  assert.deepEqual(decodeQualcommSignaling(createNrV12RadioBearerConfigPacket()), {
    packetLength: 43,
    logCode: QUALCOMM_NR_RRC_OTA_LOG_CODE,
    version: "12",
    rat: "NR",
    layer: "RRC",
    direction: "unknown",
    channel: null,
    pduType: "nr-RadioBearerConfig",
    pduId: 25,
    pci: null,
    channelNumber: null,
    rbid: 1,
    payloadBytes: 8,
    payload: fromHex("140928d7adc00c20"),
    metadata: {
      packetVersion: 12,
      rrcReleaseMajor: 15,
      rrcReleaseMinor: 160,
      sfnSubframe: "30d205",
      sibMask: 0,
    },
  });

  const complete = decodeQualcommSignaling(createNrV12ReconfigurationCompletePacket());
  assert.equal(complete?.direction, "UL");
  assert.equal(complete?.pduType, "RRCReconfigurationComplete");
  assert.equal(complete?.pci, 881);
  assert.equal(complete?.channelNumber, 649920);
  assert.deepEqual(complete?.payload, fromHex("00"));
});

void test("decodes real NR RRC v26 envelopes with their version-specific PDU map", () => {
  assert.deepEqual(decodeQualcommSignaling(createNrV26UlDcchPacket()), {
    packetLength: 62,
    logCode: QUALCOMM_NR_RRC_OTA_LOG_CODE,
    version: "26",
    rat: "NR",
    layer: "RRC",
    direction: "UL",
    channel: "UL-DCCH",
    pduType: null,
    pduId: 9,
    pci: 16,
    channelNumber: 518910,
    rbid: 1,
    payloadBytes: 15,
    payload: fromHex("00020874105e8c2ba210b17a70ae80"),
    metadata: {
      packetVersion: 26,
      rrcReleaseMajor: 17,
      rrcReleaseMinor: 128,
      sfnSubframe: "317c05",
      sibMask: 0,
      nrCellGlobalIdentity: "0",
      segmentId: 0,
    },
  });

  const radioBearerConfig = decodeQualcommSignaling(createNrV26RadioBearerConfigPacket());
  assert.equal(radioBearerConfig?.pduId, 36);
  assert.equal(radioBearerConfig?.pduType, "nr-RadioBearerConfig");
  assert.equal(radioBearerConfig?.direction, "unknown");
  assert.deepEqual(radioBearerConfig?.payload, fromHex("1009288e9026"));

  const pduCases = [
    [5, "DL", "MCCH", null],
    [6, "DL", "PCCH", null],
    [7, "UL", "UL-CCCH", null],
    [8, "UL", "UL-CCCH1", null],
    [9, "UL", "UL-DCCH", null],
    [10, "unknown", null, null],
    [11, "DL", null, "RRCReconfiguration"],
    [12, "UL", null, "RRCReconfigurationComplete"],
    [36, "unknown", null, "nr-RadioBearerConfig"],
  ] as const;
  for (const [pduId, direction, channel, pduType] of pduCases) {
    const packet = createNrV26UlDcchPacket();
    packet[36] = pduId;
    const decoded = decodeQualcommSignaling(packet);
    assert.equal(decoded?.direction, direction);
    assert.equal(decoded?.channel, channel);
    assert.equal(decoded?.pduType, pduType);
  }
});

void test("retains NR v26 segment provenance without treating partial transport as malformed", () => {
  const segment = createNrV26UlDcchPacket();
  segment[46] = 7;
  assert.equal(decodeQualcommSignaling(segment)?.metadata.segmentId, 7);
});

void test("returns null for unsupported or inconsistent NR RRC packets", () => {
  const wrongVersion = createNrV12RadioBearerConfigPacket();
  wrongVersion[12] = 13;
  const wrongV26Version = createNrV26UlDcchPacket();
  wrongV26Version[12] = 27;
  const wrongMessageLength = setUint16(createNrV12RadioBearerConfigPacket(), 33, 9);
  const wrongV26MessageLength = setUint16(createNrV26UlDcchPacket(), 41, 16);
  const truncatedV26 = createNrV26UlDcchPacket().subarray(0, 46);

  for (const payload of [wrongVersion, wrongV26Version, wrongMessageLength, wrongV26MessageLength, truncatedV26])
    assert.doesNotThrow(() => {
      assert.equal(decodeQualcommSignaling(payload), null);
    });
});
