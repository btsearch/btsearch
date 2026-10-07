import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_QUALCOMM_SIGNALING_BYTES,
  QUALCOMM_SIGNALING_ENVELOPE_BYTES,
  decodeQualcommSignaling,
  isQualcommSignalingLogCode,
  isValidQualcommSignalingEnvelope,
} from "../../src/lib/nsg-parser/internal/qualcomm/signaling/decoder";
import {
  QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE,
  QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE,
  QUALCOMM_LTE_RRC_OTA_LOG_CODE,
  QUALCOMM_NR_RRC_OTA_LOG_CODE,
  readDiagPrefix,
} from "../../src/lib/nsg-parser/qualcomm";
import { setUint16LE as setUint16 } from "./binary";
import {
  createLteServiceRequestPacket,
  createLteV27PcchPacket,
  createLteV30PcchPacket,
  createNrV12RadioBearerConfigPacket,
  createNrV26UlDcchPacket,
} from "./fixtures/qualcommSignalingPackets";

void test("recognizes only the supported Qualcomm signaling log codes", () => {
  assert.equal(MAX_QUALCOMM_SIGNALING_BYTES, 0xffff);
  assert.equal(QUALCOMM_SIGNALING_ENVELOPE_BYTES, 47);
  assert.equal(QUALCOMM_LTE_RRC_OTA_LOG_CODE, 0xb0c0);
  assert.equal(QUALCOMM_NR_RRC_OTA_LOG_CODE, 0xb821);
  assert.equal(QUALCOMM_LTE_NAS_PLAIN_INCOMING_LOG_CODE, 0xb0ec);
  assert.equal(QUALCOMM_LTE_NAS_PLAIN_OUTGOING_LOG_CODE, 0xb0ed);
  assert.deepEqual([0xb0c0, 0xb821, 0xb0ec, 0xb0ed].map(isQualcommSignalingLogCode), [true, true, true, true]);
  assert.equal(isQualcommSignalingLogCode(0xb0ea), false);
  assert.equal(isQualcommSignalingLogCode(0xb97f), false);
});

void test("validates a bounded signaling envelope for each supported family", () => {
  for (const packet of [createLteV27PcchPacket(), createNrV12RadioBearerConfigPacket(), createLteServiceRequestPacket()]) {
    const prefix = readDiagPrefix(packet);
    assert.ok(prefix);
    assert.equal(isValidQualcommSignalingEnvelope(packet.subarray(0, 47), prefix), true);
  }

  const unsupported = createLteV27PcchPacket();
  setUint16(unsupported, 2, 0xb0ea);
  const unsupportedPrefix = readDiagPrefix(unsupported);
  assert.ok(unsupportedPrefix);
  assert.equal(isValidQualcommSignalingEnvelope(unsupported, unsupportedPrefix), false);
});

void test("honors declared packet lengths, Uint8Array offsets, and outer padding", () => {
  const packets = [createLteV27PcchPacket(), createLteV30PcchPacket(), createNrV26UlDcchPacket()];

  for (const packet of packets) {
    const expected = decodeQualcommSignaling(packet);
    assert.ok(expected);

    const framed = new Uint8Array(packet.length + 13).fill(0xa5);
    framed.set(packet, 5);
    assert.deepEqual(decodeQualcommSignaling(framed.subarray(5, 5 + packet.length)), expected);

    const padded = new Uint8Array(packet.length + 8).fill(0xa5);
    padded.set(packet);
    assert.deepEqual(decodeQualcommSignaling(padded), expected);
  }
});

void test("returns null without throwing for unsupported, truncated, and inconsistent DIAG packets", () => {
  const unsupported = createLteV27PcchPacket();
  setUint16(unsupported, 2, 0xb0ea);
  const declaredTooLong = createLteV27PcchPacket();
  setUint16(declaredTooLong, 0, declaredTooLong.length + 1);

  for (const packet of [new Uint8Array(), unsupported, declaredTooLong])
    assert.doesNotThrow(() => assert.equal(decodeQualcommSignaling(packet), null));
});
