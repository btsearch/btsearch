import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_QUALCOMM_NR_MEASUREMENT_BYTES,
  QUALCOMM_NR_MEASUREMENT_LOG_CODE,
  decodeQualcommNrMeasurement,
} from "../../src/lib/nsg-parser/internal/qualcomm/nrMeasurement";
import { copyBytes as copy, bytesFromHex as fromHex, setUint16LE as setUint16 } from "./binary";

const ONE_CELL_HEX =
  "7c007fb9b571ced62e511201090002000000e130011400001314000002000000c0ea09000001b3030001000021c1ffff00b2ffffffffffffffff0000ffffffffb3031c020100000082c0ffff9ef6ffff010000000000000000000000ae1534e61e0a400b8bbfffff0ac0ffff82c0ffff9ef6ffff0000000000000000";
const TWO_CELL_HEX =
  "b8007fb97e54ddcb2e511201090002000004f025011400003c14000002000000c0ea09000002b30301010000f3c4ffff1ec0ffffffffffffffff0000ffffffff9003ec00010000008eb8ffff0af0ffff020000000000000000000000e6bc32f0554cea0414c0ffff3ebdffff8eb8ffff0af0ffff0000000000000000b303be000100000091c8ffff74faffff01000000000000000000000046f8d7e41d2aea0478c8ffff1bc7ffff91c8ffff74faffff0000000000000000";
const TWO_CELL_V2_10_HEX =
  "08017fb970b315406c5412010a0002000080803a0114000077070000e9ffffff" +
  "60c0090000024900000000000000000000000000ffffffffffff0000ffffffff" +
  "49005003010000002cc8ffff46faffff00000100000000000000000059ac7bf2" +
  "e1b1e7060dc8ffff60c5ffff0dfaffff41faffff000000000000000000000000" +
  "00000000000000000000000000000000000000002cc8ffff46faffffa2c8ffff" +
  "f5f9ffff48002801010000007cc3ffffbff6ffff000001000000000000000000" +
  "59ac7bf2d9b1e7066ac4ffff9bbfffff65f6ffff55f4ffff0000000000000000" +
  "0000000000000000000000000000000000000000000000007cc3ffffbff6ffff" +
  "0000000000000000";
const THREE_CELL_V3_HEX =
  "74017fb9013b3fac82521201000003000084f02601140000d2040000eaffffff" +
  "c0ea0900000356020103000000000000000000000000000000000000ffffffff" +
  "ffff0000ffffffff1600ec000100000058bfffffaef6ffff0100010000000000" +
  "000000005997f7d572897b0fddbfffff29beffff12f7ffffb5f5ffff00000000" +
  "0000000000000000000000000000000000000000000000000000000058bfffff" +
  "aef6ffff00000000000000005602de000100000035c3ffff41f9ffff03000100" +
  "000000000000000039ddcfda32c67b0facc2ffffdfbeffff1cf9ffff95f6ffff" +
  "0000000000000000000000000000000000000000000000000000000000000000" +
  "35c3ffff41f9ffff00000000000000002600000001000000d4c0ffffd8f7ffff" +
  "020001000000000000000000cd97130ceead7b0fb5c1ffffcfbfffff7bf8ffff" +
  "29f7ffff00000000000000000000000000000000000000000000000000000000" +
  "00000000d4c0ffffd8f7ffff0000000000000000";

const ONE_CELL = fromHex(ONE_CELL_HEX);
const TWO_CELL = fromHex(TWO_CELL_HEX);
const TWO_CELL_V2_10 = fromHex(TWO_CELL_V2_10_HEX);
const THREE_CELL_V3 = fromHex(THREE_CELL_V3_HEX);

function legacyMeasurement(versionMinor: 6 | 7): Uint8Array {
  const measurementHeaderBytes = versionMinor === 6 ? 20 : 28;
  const payload = new Uint8Array(measurementHeaderBytes + 32 + 16 + 44);
  const view = new DataView(payload.buffer);
  view.setUint16(0, payload.length, true);
  view.setUint16(2, QUALCOMM_NR_MEASUREMENT_LOG_CODE, true);
  view.setUint16(12, versionMinor, true);
  view.setUint16(14, 2, true);
  payload[16] = 1;

  const carrierOffset = measurementHeaderBytes;
  view.setUint32(carrierOffset, 635334, true);
  payload[carrierOffset + 4] = 1;
  payload[carrierOffset + 5] = 0;
  view.setUint16(carrierOffset + 6, 321, true);
  payload[carrierOffset + 8] = 7;

  const cellOffset = carrierOffset + 32;
  view.setUint16(cellOffset, 321, true);
  view.setUint16(cellOffset + 2, 456, true);
  payload[cellOffset + 4] = 1;
  view.setInt32(cellOffset + 8, -120 * 128, true);
  view.setInt32(cellOffset + 12, -15 * 128, true);
  return payload;
}

void test("decodes the real one-cell Qualcomm NR v2.9 measurement", () => {
  assert.equal(QUALCOMM_NR_MEASUREMENT_LOG_CODE, 0xb97f);
  assert.equal(MAX_QUALCOMM_NR_MEASUREMENT_BYTES, 0xffff);
  assert.deepEqual(decodeQualcommNrMeasurement(ONE_CELL), {
    packetLength: 124,
    versionMajor: 2,
    versionMinor: 9,
    layerCount: 1,
    cells: [
      {
        carrierIndex: 0,
        cellIndex: 0,
        arfcn: 649920,
        ccId: 0,
        pci: 947,
        sfn: 540,
        beamCount: 1,
        rsrp: -126.984375,
        rsrq: -18.765625,
        serving: true,
        servingPci: 947,
        servingSsb: 1,
      },
    ],
  });
});

for (const versionMinor of [6, 7] as const)
  void test(`decodes the source-defined Qualcomm NR v2.${versionMinor} layout`, () => {
    const payload = legacyMeasurement(versionMinor);
    assert.deepEqual(decodeQualcommNrMeasurement(payload), {
      packetLength: payload.length,
      versionMajor: 2,
      versionMinor,
      layerCount: 1,
      cells: [
        {
          carrierIndex: 0,
          cellIndex: 0,
          arfcn: 635334,
          ccId: null,
          pci: 321,
          sfn: 456,
          beamCount: 1,
          rsrp: -120,
          rsrq: -15,
          serving: true,
          servingPci: 321,
          servingSsb: 7,
        },
      ],
    });
  });

void test("uses the valid zero-based serving index in the real two-cell measurement", () => {
  const decoded = decodeQualcommNrMeasurement(TWO_CELL);
  assert.deepEqual(decoded, {
    packetLength: 184,
    versionMajor: 2,
    versionMinor: 9,
    layerCount: 1,
    cells: [
      {
        carrierIndex: 0,
        cellIndex: 0,
        arfcn: 649920,
        ccId: 0,
        pci: 912,
        sfn: 236,
        beamCount: 1,
        rsrp: -142.890625,
        rsrq: -31.921875,
        serving: false,
        servingPci: 947,
        servingSsb: 1,
      },
      {
        carrierIndex: 0,
        cellIndex: 1,
        arfcn: 649920,
        ccId: 0,
        pci: 947,
        sfn: 190,
        beamCount: 1,
        rsrp: -110.8671875,
        rsrq: -11.09375,
        serving: true,
        servingPci: 947,
        servingSsb: 1,
      },
    ],
  });
});

void test("decodes the expanded beam records in a real Qualcomm NR v2.10 measurement", () => {
  assert.deepEqual(decodeQualcommNrMeasurement(TWO_CELL_V2_10), {
    packetLength: 264,
    versionMajor: 2,
    versionMinor: 10,
    layerCount: 1,
    cells: [
      {
        carrierIndex: 0,
        cellIndex: 0,
        arfcn: 639072,
        ccId: 0,
        pci: 73,
        sfn: 848,
        beamCount: 1,
        rsrp: -111.65625,
        rsrq: -11.453125,
        serving: true,
        servingPci: 73,
        servingSsb: 0,
      },
      {
        carrierIndex: 0,
        cellIndex: 1,
        arfcn: 639072,
        ccId: 0,
        pci: 72,
        sfn: 296,
        beamCount: 1,
        rsrp: -121.03125,
        rsrq: -18.5078125,
        serving: false,
        servingPci: 73,
        servingSsb: 0,
      },
    ],
  });
});

void test("decodes the expanded carrier and beam records in a real Qualcomm NR v3.0 measurement", () => {
  assert.deepEqual(decodeQualcommNrMeasurement(THREE_CELL_V3), {
    packetLength: 372,
    versionMajor: 3,
    versionMinor: 0,
    layerCount: 1,
    cells: [
      {
        carrierIndex: 0,
        cellIndex: 0,
        arfcn: 649920,
        ccId: 0,
        pci: 22,
        sfn: 236,
        beamCount: 1,
        rsrp: -129.3125,
        rsrq: -18.640625,
        serving: false,
        servingPci: 598,
        servingSsb: 3,
      },
      {
        carrierIndex: 0,
        cellIndex: 1,
        arfcn: 649920,
        ccId: 0,
        pci: 598,
        sfn: 222,
        beamCount: 1,
        rsrp: -121.5859375,
        rsrq: -13.4921875,
        serving: true,
        servingPci: 598,
        servingSsb: 3,
      },
      {
        carrierIndex: 0,
        cellIndex: 2,
        arfcn: 649920,
        ccId: 0,
        pci: 38,
        sfn: 0,
        beamCount: 1,
        rsrp: -126.34375,
        rsrq: -16.3125,
        serving: false,
        servingPci: 598,
        servingSsb: 3,
      },
    ],
  });

  const mismatchedServingIndex = copy(THREE_CELL_V3);
  mismatchedServingIndex[40] = 0;
  assert.deepEqual(
    decodeQualcommNrMeasurement(mismatchedServingIndex)?.cells.map(({ pci, serving }) => ({ pci, serving })),
    [
      { pci: 22, serving: false },
      { pci: 598, serving: true },
      { pci: 38, serving: false },
    ],
  );

  const duplicateServingPci = copy(THREE_CELL_V3);
  setUint16(duplicateServingPci, 272, 598);
  assert.equal(decodeQualcommNrMeasurement(duplicateServingPci)?.cells.filter((cell) => cell.serving).length, 0);
});

void test("flattens cells from multiple carrier layers with stable indices", () => {
  const combined = new Uint8Array(32 + (ONE_CELL.length - 32) + (TWO_CELL.length - 32));
  combined.set(ONE_CELL.subarray(0, 32));
  combined[20] = 2;
  combined.set(ONE_CELL.subarray(32), 32);
  combined.set(TWO_CELL.subarray(32), ONE_CELL.length);
  setUint16(combined, 0, combined.length);

  const decoded = decodeQualcommNrMeasurement(combined);
  assert.equal(decoded?.layerCount, 2);
  assert.deepEqual(
    decoded?.cells.map(({ carrierIndex, cellIndex, pci, serving }) => ({ carrierIndex, cellIndex, pci, serving })),
    [
      { carrierIndex: 0, cellIndex: 0, pci: 947, serving: true },
      { carrierIndex: 1, cellIndex: 0, pci: 912, serving: false },
      { carrierIndex: 1, cellIndex: 1, pci: 947, serving: true },
    ],
  );
});

void test("marks no cell serving when the serving index is out of range", () => {
  const invalidServingIndex = copy(ONE_CELL);
  invalidServingIndex[40] = 1;
  const decoded = decodeQualcommNrMeasurement(invalidServingIndex);

  assert.equal(decoded?.cells[0].pci, decoded?.cells[0].servingPci);
  assert.equal(decoded?.cells[0].serving, false);
});

void test("accepts zero internal padding, ignores outer padding, and honors Uint8Array offsets", () => {
  const padded = new Uint8Array(ONE_CELL.length + 44 + 3);
  padded.set(ONE_CELL);
  padded.set([0xaa, 0xbb, 0xcc], ONE_CELL.length + 44);
  setUint16(padded, 0, ONE_CELL.length + 44);
  const expected = decodeQualcommNrMeasurement(ONE_CELL);
  assert.ok(expected);
  assert.deepEqual(decodeQualcommNrMeasurement(padded), { ...expected, packetLength: ONE_CELL.length + 44 });

  const framed = new Uint8Array(ONE_CELL.length + 11).fill(0xa5);
  framed.set(ONE_CELL, 7);
  assert.deepEqual(decodeQualcommNrMeasurement(framed.subarray(7, 7 + ONE_CELL.length)), expected);

  for (const split of [0, 1, 2, 11, 12, 31, 32, 63, 64, ONE_CELL.length]) {
    const rebuilt = new Uint8Array(ONE_CELL.length);
    rebuilt.set(ONE_CELL.subarray(0, split));
    rebuilt.set(ONE_CELL.subarray(split), split);
    assert.deepEqual(decodeQualcommNrMeasurement(rebuilt), expected);
  }
});

void test("returns null without throwing for unknown, truncated, or malformed packets", () => {
  const declaredTooLong = setUint16(copy(ONE_CELL), 0, ONE_CELL.length + 1);
  const declaredTooShort = setUint16(copy(ONE_CELL), 0, 31);
  const wrongCode = setUint16(copy(ONE_CELL), 2, 0xb97e);
  const wrongMinor = setUint16(copy(ONE_CELL), 12, 8);
  const wrongMajor = setUint16(copy(ONE_CELL), 14, 3);
  const missingLayer = copy(ONE_CELL);
  missingLayer[20] = 2;
  const missingCell = copy(ONE_CELL);
  missingCell[37] = 2;
  const missingBeam = copy(ONE_CELL);
  missingBeam[68] = 2;
  const invalidV2_10BeamCount = copy(TWO_CELL_V2_10);
  invalidV2_10BeamCount[69] = 1;
  const invalidV3BeamCount = copy(THREE_CELL_V3);
  invalidV3BeamCount[77] = 1;
  const nonzeroInternalPadding = new Uint8Array(ONE_CELL.length + 1);
  nonzeroInternalPadding.set(ONE_CELL);
  nonzeroInternalPadding[ONE_CELL.length] = 1;
  setUint16(nonzeroInternalPadding, 0, nonzeroInternalPadding.length);

  const malformed = [
    new Uint8Array(),
    declaredTooLong,
    declaredTooShort,
    wrongCode,
    wrongMinor,
    wrongMajor,
    missingLayer,
    missingCell,
    missingBeam,
    invalidV2_10BeamCount,
    invalidV3BeamCount,
    nonzeroInternalPadding,
    ...Array.from({ length: ONE_CELL.length }, (_, length) => ONE_CELL.subarray(0, length)),
    ...Array.from({ length: TWO_CELL_V2_10.length }, (_, length) => TWO_CELL_V2_10.subarray(0, length)),
    ...Array.from({ length: THREE_CELL_V3.length }, (_, length) => THREE_CELL_V3.subarray(0, length)),
  ];
  for (const payload of malformed)
    assert.doesNotThrow(() => {
      assert.equal(decodeQualcommNrMeasurement(payload), null);
    });
});
