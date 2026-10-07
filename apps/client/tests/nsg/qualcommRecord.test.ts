import assert from "node:assert/strict";
import test from "node:test";

import {
  QUALCOMM_DIAG_HEADER_BYTES,
  QUALCOMM_DIAG_PREFIX_BYTES,
  QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE,
  QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE,
  QUALCOMM_LTE_RRC_OTA_LOG_CODE,
  QUALCOMM_NR_CONFIGURATION_INFO_LOG_CODE,
  QUALCOMM_NR_RRC_OTA_LOG_CODE,
  QUALCOMM_NR_SERVING_CELL_INFO_LOG_CODE,
  classifyQualcommRecord,
  decodeQualcommRecord,
  readDiagPrefix,
} from "../../src/lib/nsg-parser/qualcomm";
import { bytesFromHex as fromHex, setUint16LE as setUint16 } from "./binary";

const NR_MEASUREMENT = fromHex(
  "7c007fb9b571ced62e511201090002000000e130011400001314000002000000c0ea09000001b3030001000021c1ffff00b2ffffffffffffffff0000ffffffffb3031c020100000082c0ffff9ef6ffff010000000000000000000000ae1534e61e0a400b8bbfffff0ac0ffff82c0ffff9ef6ffff0000000000000000",
);
const LTE_SERVING_CELL = fromHex("2900c2b08f19a9f5d5551201037f004b0500009b4b000064640106a9002ca003000000040102010000");
const LTE_RRC = fromHex("2800c0b024938a971f5112011b10100fa0004100670c000029230700000000070040006fb86b8240");
const LTE_NAS_INCOMING = fromHex(
  "3e00ecb0059ebac125511201010905000749015a4954080162f020db2edb30570220001362f020db2e3410031f11f2030199f7030499f8030299f9640182",
);
const LTE_NAS_OUTGOING = fromHex("1400edb0a13980ea1f51120101090500c73ea40f");
const NR_RRC = fromHex("2b0021b8432c6480275112010c0000000fa001ffffffffffff30d20519000000000800140928d7adc00c20");

function nrServingCell(): Uint8Array {
  const packet = new Uint8Array(50);
  const view = new DataView(packet.buffer);
  view.setUint16(0, packet.length, true);
  view.setUint16(2, QUALCOMM_NR_SERVING_CELL_INFO_LOG_CODE, true);
  view.setUint32(12, 4, true);
  return packet;
}

function nrConfiguration(): Uint8Array {
  const packet = new Uint8Array(73);
  const view = new DataView(packet.buffer);
  view.setUint16(0, packet.length, true);
  view.setUint16(2, QUALCOMM_NR_CONFIGURATION_INFO_LOG_CODE, true);
  view.setUint32(12, 8, true);
  view.setUint8(16, 7);
  view.setUint8(17, 1);
  view.setUint8(18, 2);
  return packet;
}

const NR_SERVING_CELL = nrServingCell();
const NR_CONFIGURATION = nrConfiguration();

void test("defines one exact policy for every supported Qualcomm record code", () => {
  assert.equal(QUALCOMM_DIAG_PREFIX_BYTES, 4);
  assert.equal(QUALCOMM_DIAG_HEADER_BYTES, 12);
  assert.deepEqual(classifyQualcommRecord({ packetLength: 12, logCode: 0xb97f }, 12), {
    kind: "nrMeasurement",
    maximumBytes: 0xffff,
    validationPrefixBytes: null,
  });
  assert.deepEqual(
    classifyQualcommRecord({ packetLength: NR_SERVING_CELL.length, logCode: QUALCOMM_NR_SERVING_CELL_INFO_LOG_CODE }, NR_SERVING_CELL.length),
    {
      kind: "nrServingCell",
      maximumBytes: 50,
      validationPrefixBytes: null,
    },
  );
  assert.deepEqual(
    classifyQualcommRecord({ packetLength: NR_CONFIGURATION.length, logCode: QUALCOMM_NR_CONFIGURATION_INFO_LOG_CODE }, NR_CONFIGURATION.length),
    {
      kind: "nrConfiguration",
      maximumBytes: 0xffff,
      validationPrefixBytes: null,
    },
  );
  assert.deepEqual(classifyQualcommRecord({ packetLength: 12, logCode: 0xb0c2 }, 12), {
    kind: "lteServingCell",
    maximumBytes: 64,
    validationPrefixBytes: null,
  });
  for (const logCode of [0xb0c0, 0xb0ec, 0xb0ed, 0xb821]) {
    assert.deepEqual(classifyQualcommRecord({ packetLength: 12, logCode }, 12), {
      kind: "signaling",
      maximumBytes: 0xffff,
      validationPrefixBytes: 47,
    });
  }
  assert.equal(classifyQualcommRecord({ packetLength: 12, logCode: 0xb0ea }, 12), null);

  assert.equal(classifyQualcommRecord({ packetLength: 64, logCode: 0xb0c2 }, 64)?.kind, "lteServingCell");
  assert.equal(classifyQualcommRecord({ packetLength: 65, logCode: 0xb0c2 }, 65), null);
  assert.equal(classifyQualcommRecord({ packetLength: 12, logCode: 0xb0c2 }, 11), null);
  assert.equal(classifyQualcommRecord({ packetLength: 11, logCode: 0xb0c2 }, 11), null);
});

void test("decodes NR measurement and LTE serving-cell records through discriminated results", () => {
  const nr = decodeQualcommRecord(NR_MEASUREMENT);
  if (nr?.kind !== "nrMeasurement") assert.fail("Expected an NR measurement record");
  assert.equal(nr.packetLength, NR_MEASUREMENT.length);
  assert.equal(nr.value.versionMajor, 2);
  assert.equal(nr.value.versionMinor, 9);
  assert.equal(nr.value.cells.length, 1);
  assert.equal(nr.value.cells[0].serving, true);

  const lte = decodeQualcommRecord(LTE_SERVING_CELL);
  if (lte?.kind !== "lteServingCell") assert.fail("Expected an LTE serving-cell record");
  assert.equal(lte.packetLength, LTE_SERVING_CELL.length);
  assert.equal(lte.value.cellIdentity, 11077121);
  assert.equal(lte.value.earfcn, 1355);
  assert.equal(lte.value.pci, 127);

  const serving = decodeQualcommRecord(NR_SERVING_CELL);
  if (serving?.kind !== "nrServingCell") assert.fail("Expected an NR serving-cell record");
  assert.equal(serving.value.version, 4);

  const configuration = decodeQualcommRecord(NR_CONFIGURATION);
  if (configuration?.kind !== "nrConfiguration") assert.fail("Expected an NR configuration record");
  assert.equal(configuration.value.connectivityMode, 2);
});

void test("routes every supported signaling log code through one signaling result", () => {
  const cases = [
    [LTE_RRC, QUALCOMM_LTE_RRC_OTA_LOG_CODE],
    [LTE_NAS_INCOMING, QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE],
    [LTE_NAS_OUTGOING, QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE],
    [NR_RRC, QUALCOMM_NR_RRC_OTA_LOG_CODE],
  ] as const;

  for (const [packet, logCode] of cases) {
    const record = decodeQualcommRecord(packet);
    if (record?.kind !== "signaling") assert.fail(`Expected signaling ${logCode}`);
    assert.equal(record.packetLength, packet.length);
    assert.equal(record.value.logCode, logCode);
  }
});

void test("honors DIAG limits, declared packet lengths, byte offsets, and outer padding", () => {
  for (const packet of [NR_MEASUREMENT, NR_SERVING_CELL, NR_CONFIGURATION, LTE_SERVING_CELL, LTE_RRC, NR_RRC]) {
    const expected = decodeQualcommRecord(packet);
    assert.ok(expected);

    const framed = new Uint8Array(packet.length + 13).fill(0xa5);
    framed.set(packet, 5);
    const slice = framed.subarray(5, 5 + packet.length);
    const prefix = readDiagPrefix(slice);
    assert.ok(prefix);
    assert.deepEqual(decodeQualcommRecord(slice, prefix), expected);

    const padded = new Uint8Array(packet.length + 9).fill(0xa5);
    padded.set(packet);
    assert.deepEqual(decodeQualcommRecord(padded), expected);

    const declaredTooLong = Uint8Array.from(packet);
    setUint16(declaredTooLong, 0, packet.length + 1);
    assert.equal(decodeQualcommRecord(declaredTooLong), null);
  }

  const maximumServingCell = new Uint8Array(64);
  maximumServingCell.set(LTE_SERVING_CELL);
  setUint16(maximumServingCell, 0, maximumServingCell.length);
  assert.equal(decodeQualcommRecord(maximumServingCell)?.kind, "lteServingCell");

  const oversizedServingCell = new Uint8Array(65);
  oversizedServingCell.set(LTE_SERVING_CELL);
  setUint16(oversizedServingCell, 0, oversizedServingCell.length);
  assert.equal(decodeQualcommRecord(oversizedServingCell), null);

  const unsupported = Uint8Array.from(LTE_RRC);
  setUint16(unsupported, 2, 0xb0ea);
  assert.equal(decodeQualcommRecord(unsupported), null);
});

void test("returns null without throwing for truncated prefixes and packets", () => {
  for (let length = 0; length < QUALCOMM_DIAG_PREFIX_BYTES; length++)
    assert.doesNotThrow(() => assert.equal(decodeQualcommRecord(NR_MEASUREMENT.subarray(0, length)), null));

  for (const packet of [NR_MEASUREMENT, NR_SERVING_CELL, NR_CONFIGURATION, LTE_SERVING_CELL, LTE_RRC, LTE_NAS_INCOMING, LTE_NAS_OUTGOING, NR_RRC]) {
    for (let length = QUALCOMM_DIAG_PREFIX_BYTES; length < packet.length; length++)
      assert.doesNotThrow(() => assert.equal(decodeQualcommRecord(packet.subarray(0, length)), null));
  }
});
