import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_QUALCOMM_LTE_SERVING_CELL_INFO_BYTES,
  QUALCOMM_LTE_SERVING_CELL_INFO_LOG_CODE,
  decodeQualcommLteServingCellInfo,
} from "../../src/lib/nsg-parser/internal/qualcomm/lteServingCell";
import { copyBytes as copy, bytesFromHex as fromHex, setUint16LE as setUint16 } from "./binary";

const PLUS = fromHex("2900c2b08f19a9f5d5551201037f004b0500009b4b000064640106a9002ca003000000040102010000");
const T_MOBILE = fromHex("2900c2b0f3069195d6551201031201e1000000314700004b4b190e270256d301000000040102020000");

void test("decodes the real Plus LTE serving-cell packet", () => {
  assert.equal(QUALCOMM_LTE_SERVING_CELL_INFO_LOG_CODE, 0xb0c2);
  assert.equal(MAX_QUALCOMM_LTE_SERVING_CELL_INFO_BYTES, 64);
  assert.deepEqual(decodeQualcommLteServingCellInfo(PLUS), {
    version: 3,
    pci: 127,
    earfcn: 1355,
    ulEarfcn: 19355,
    cellIdentity: 11077121,
    tac: 41004,
    band: 3,
    mcc: "260",
    mnc: "01",
  });
});

void test("decodes the real T-Mobile LTE serving-cell packet", () => {
  assert.deepEqual(decodeQualcommLteServingCellInfo(T_MOBILE), {
    version: 3,
    pci: 274,
    earfcn: 225,
    ulEarfcn: 18225,
    cellIdentity: 36113945,
    tac: 54102,
    band: 1,
    mcc: "260",
    mnc: "02",
  });
});

void test("pads a three-digit MNC to its declared width", () => {
  const threeDigitMnc = copy(PLUS);
  threeDigitMnc[37] = 3;

  assert.equal(decodeQualcommLteServingCellInfo(threeDigitMnc)?.mnc, "001");
});

void test("returns null without throwing for unsupported or malformed packets", () => {
  const wrongCode = setUint16(copy(PLUS), 2, 0xb0c1);
  const wrongVersion = copy(PLUS);
  wrongVersion[12] = 2;
  const declaredTooShort = setUint16(copy(PLUS), 0, 40);
  const invalidMcc = setUint16(copy(PLUS), 35, 1000);
  const twoDigitOverflow = setUint16(copy(PLUS), 38, 100);
  const invalidDigitCounts = [1, 4].map((digitCount) => {
    const packet = copy(PLUS);
    packet[37] = digitCount;
    return packet;
  });
  const malformed = [wrongCode, wrongVersion, declaredTooShort, PLUS.subarray(0, 40), invalidMcc, twoDigitOverflow, ...invalidDigitCounts];

  for (const payload of malformed)
    assert.doesNotThrow(() => {
      assert.equal(decodeQualcommLteServingCellInfo(payload), null);
    });
});
