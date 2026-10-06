import assert from "node:assert/strict";
import test from "node:test";

import {
  QUALCOMM_NR_CONFIGURATION_INFO_LOG_CODE,
  QUALCOMM_NR_SERVING_CELL_INFO_LOG_CODE,
  decodeQualcommNrConfigurationInfo,
  decodeQualcommNrServingCellInfo,
  isConnectedQualcommNrStandalone,
} from "../../src/lib/nsg-parser/qualcomm";

function servingCellPacket(): Uint8Array {
  const packet = new Uint8Array(50);
  const view = new DataView(packet.buffer);
  view.setUint16(0, packet.length, true);
  view.setUint16(2, QUALCOMM_NR_SERVING_CELL_INFO_LOG_CODE, true);
  view.setUint32(12, 4, true);
  view.setUint16(16, 123, true);
  view.setUint32(18, 640_000, true);
  view.setUint32(22, 640_032, true);
  view.setUint16(26, 100, true);
  view.setUint16(28, 80, true);
  view.setBigUint64(30, 4_886_718_345n, true);
  view.setUint16(38, 310, true);
  view.setUint8(40, 3);
  view.setUint8(41, 26);
  view.setUint8(42, 1);
  view.setUint32(44, 144_470, true);
  view.setUint16(48, 78, true);
  return packet;
}

function configurationPacket(): Uint8Array {
  const packet = new Uint8Array(113);
  const view = new DataView(packet.buffer);
  view.setUint16(0, packet.length, true);
  view.setUint16(2, QUALCOMM_NR_CONFIGURATION_INFO_LOG_CODE, true);
  view.setUint32(12, 8, true);
  view.setUint8(16, 7);
  view.setUint8(17, 1);
  view.setUint8(18, 2);
  view.setUint8(19, 1);
  view.setUint8(70, 1);
  view.setUint8(71, 1);
  view.setUint8(72, 1);
  view.setUint16(73, 78, true);
  view.setUint8(75, 1);
  view.setUint8(76, 1);
  view.setUint8(77, 0);
  view.setUint16(78, 123, true);
  view.setUint32(80, 640_000, true);
  view.setUint32(84, 640_000, true);
  view.setUint16(88, 78, true);
  view.setUint8(90, 1);
  view.setUint8(91, 12);
  view.setUint8(92, 12);
  view.setUint8(93, 4);
  view.setUint8(94, 2);
  return packet;
}

const NR_CONFIGURATION_V8 = configurationPacket();

void test("decodes the exact public B823 v4 serving-cell layout without inventing field semantics", () => {
  const decoded = decodeQualcommNrServingCellInfo(servingCellPacket());
  assert.deepEqual(decoded, {
    packetLength: 50,
    version: 4,
    physicalCellId: 123,
    downlinkFrequency: 640_000,
    uplinkFrequency: 640_032,
    downlinkBandwidth: 100,
    uplinkBandwidth: 80,
    cellIdentity: 4_886_718_345n,
    mcc: 310,
    mncDigitCount: 3,
    mnc: 26,
    allowedAccess: 1,
    tac: 144_470,
    band: 78,
  });
});

void test("decodes connected SA state and active carriers from the exact public B825 v8 layout", () => {
  assert.equal(NR_CONFIGURATION_V8.length, 113);
  const decoded = decodeQualcommNrConfigurationInfo(NR_CONFIGURATION_V8);
  assert.ok(decoded);
  assert.equal(isConnectedQualcommNrStandalone(decoded), true);
  assert.equal(decoded.activeSrbCount, 1);
  assert.equal(decoded.activeDrbCount, 0);
  assert.equal(decoded.activeRadioBearerCount, 1);
  assert.deepEqual(decoded.contiguousCarrierGroups, [{ band: 78, downlinkBandwidthClass: 1, uplinkBandwidthClass: 1 }]);
  assert.deepEqual(decoded.activeCarriers, [
    {
      ccId: 0,
      cellId: 123,
      downlinkArfcn: 640_000,
      uplinkArfcn: 640_000,
      band: 78,
      bandType: 1,
      downlinkBandwidth: 12,
      uplinkBandwidth: 12,
      downlinkMaxMimo: 4,
      uplinkMaxMimo: 2,
    },
  ]);
});

void test("rejects adjacent versions, inconsistent lengths, truncation and unrelated log codes", () => {
  const serving = servingCellPacket();
  for (const version of [3, 5]) {
    const packet = Uint8Array.from(serving);
    new DataView(packet.buffer).setUint32(12, version, true);
    assert.equal(decodeQualcommNrServingCellInfo(packet), null);
  }
  for (let length = 0; length < serving.length; length++) assert.equal(decodeQualcommNrServingCellInfo(serving.subarray(0, length)), null);

  const wrongServingLength = new Uint8Array(serving.length + 1);
  wrongServingLength.set(serving);
  new DataView(wrongServingLength.buffer).setUint16(0, wrongServingLength.length, true);
  assert.equal(decodeQualcommNrServingCellInfo(wrongServingLength), null);

  for (const version of [7, 9]) {
    const packet = Uint8Array.from(NR_CONFIGURATION_V8);
    new DataView(packet.buffer).setUint32(12, version, true);
    assert.equal(decodeQualcommNrConfigurationInfo(packet), null);
  }
  const wrongCounts = Uint8Array.from(NR_CONFIGURATION_V8);
  wrongCounts[71]++;
  assert.equal(decodeQualcommNrConfigurationInfo(wrongCounts), null);
  for (let length = 0; length < NR_CONFIGURATION_V8.length; length++)
    assert.equal(decodeQualcommNrConfigurationInfo(NR_CONFIGURATION_V8.subarray(0, length)), null);
});
