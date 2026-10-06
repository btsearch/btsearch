import assert from "node:assert/strict";
import test from "node:test";

import { readDiagHeader } from "../../src/lib/nsg-parser/internal/qualcomm/diag";
import { QUALCOMM_DIAG_HEADER_BYTES, QUALCOMM_LTE_RRC_OTA_LOG_CODE, readDiagPrefix } from "../../src/lib/nsg-parser/qualcomm";
import { createLteV27PcchPacket } from "./fixtures/qualcommSignalingPackets";

const MAX_UINT16 = 0xffff;

function createDiagPacket(packetLength: number, logCode = QUALCOMM_LTE_RRC_OTA_LOG_CODE): Uint8Array {
  const packet = new Uint8Array(packetLength);
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  view.setUint16(0, packetLength, true);
  view.setUint16(2, logCode, true);
  return packet;
}

void test("accepts an exact DIAG header and the maximum uint16 packet length", () => {
  const exactHeader = createDiagPacket(QUALCOMM_DIAG_HEADER_BYTES);
  const exact = readDiagHeader(exactHeader, QUALCOMM_DIAG_HEADER_BYTES);
  assert.ok(exact);
  assert.equal(exact.packetLength, QUALCOMM_DIAG_HEADER_BYTES);
  assert.equal(exact.logCode, QUALCOMM_LTE_RRC_OTA_LOG_CODE);
  assert.equal(exact.view.byteLength, QUALCOMM_DIAG_HEADER_BYTES);

  const maximumPacket = createDiagPacket(MAX_UINT16);
  const maximum = readDiagHeader(maximumPacket, MAX_UINT16);
  assert.ok(maximum);
  assert.equal(maximum.packetLength, MAX_UINT16);
  assert.equal(maximum.view.byteLength, MAX_UINT16);
});

void test("rejects a consistent parsed prefix one byte over the caller limit", () => {
  const packet = createDiagPacket(QUALCOMM_DIAG_HEADER_BYTES + 1);
  const prefix = readDiagPrefix(packet);
  assert.ok(prefix);

  assert.equal(readDiagHeader(packet, QUALCOMM_DIAG_HEADER_BYTES, prefix), null);
});

void test("rejects parsed prefixes that disagree with the encoded DIAG prefix", () => {
  const packet = createDiagPacket(QUALCOMM_DIAG_HEADER_BYTES + 1);

  assert.equal(
    readDiagHeader(packet, packet.length, {
      packetLength: QUALCOMM_DIAG_HEADER_BYTES,
      logCode: QUALCOMM_LTE_RRC_OTA_LOG_CODE,
    }),
    null,
  );
  assert.equal(
    readDiagHeader(packet, packet.length, {
      packetLength: packet.length,
      logCode: QUALCOMM_LTE_RRC_OTA_LOG_CODE + 1,
    }),
    null,
  );
});

void test("bounds the DIAG view to the declared packet inside a Uint8Array slice", () => {
  const source = createLteV27PcchPacket();
  const framed = new Uint8Array(source.length + 9).fill(0xa5);
  framed.set(source, 4);
  const packet = framed.subarray(4, 4 + source.length);
  const header = readDiagHeader(packet, MAX_UINT16);

  assert.equal(header?.packetLength, source.length);
  assert.equal(header?.logCode, QUALCOMM_LTE_RRC_OTA_LOG_CODE);
  assert.equal(header?.view.byteOffset, packet.byteOffset);
  assert.equal(header?.view.byteLength, source.length);
  assert.equal(readDiagHeader(packet.subarray(0, QUALCOMM_DIAG_HEADER_BYTES - 1), MAX_UINT16), null);
  assert.equal(readDiagHeader(packet, source.length - 1), null);
});
