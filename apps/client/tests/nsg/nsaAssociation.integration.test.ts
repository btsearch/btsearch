import assert from "node:assert/strict";
import test from "node:test";

import { createSnapshotCollection } from "../../src/features/nsg-explorer/cells/snapshots";
import { createCellsCsv } from "../../src/features/nsg-explorer/export/cellsCsv";
import { formatNsgTimestamp } from "../../src/lib/nsg-parser";
import { StreamDecoder } from "../../src/lib/nsg-parser/internal/streamDecoder";
import { QUALCOMM_NR_CONFIGURATION_INFO_LOG_CODE, QUALCOMM_NR_SERVING_CELL_INFO_LOG_CODE } from "../../src/lib/nsg-parser/qualcomm";
import { concatBytes as concat } from "./binary";
import {
  B0C2_PLUS,
  B0C2_T_MOBILE,
  B97F_ONE_CELL,
  B97F_TWO_CELLS,
  B97F_V2_10_NO_SERVING,
  B97F_V2_10_ONE_CELL,
  B97F_V3_ONE_CELL,
  EPOCH_US,
  frame,
  jsonEvent,
  lteEvent,
  lteSubscriptionEvent,
  nsgHeader,
  timeAnchor,
} from "./fixtures/nsgContainer";

function parseRecording(bytes: Uint8Array, chunkSize = bytes.length) {
  const parser = new StreamDecoder({ name: "synthetic.log", size: bytes.length });
  for (let start = 0; start < bytes.length; start += chunkSize) parser.push(bytes.subarray(start, start + chunkSize));
  return parser.finish();
}

function nrStandaloneConfiguration(): Uint8Array {
  const packet = new Uint8Array(91);
  const view = new DataView(packet.buffer);
  view.setUint16(0, packet.length, true);
  view.setUint16(2, QUALCOMM_NR_CONFIGURATION_INFO_LOG_CODE, true);
  view.setUint32(12, 8, true);
  view.setUint8(16, 7);
  view.setUint8(17, 1);
  view.setUint8(18, 2);
  view.setUint8(71, 1);
  view.setUint16(74, 947, true);
  view.setUint32(76, 649_920, true);
  view.setUint32(80, 649_920, true);
  view.setUint16(84, 78, true);
  view.setUint8(86, 1);
  view.setUint8(87, 12);
  view.setUint8(88, 12);
  view.setUint8(89, 4);
  view.setUint8(90, 2);
  return packet;
}

function nrStandaloneServingCell(): Uint8Array {
  const packet = new Uint8Array(50);
  const view = new DataView(packet.buffer);
  view.setUint16(0, packet.length, true);
  view.setUint16(2, QUALCOMM_NR_SERVING_CELL_INFO_LOG_CODE, true);
  view.setUint32(12, 4, true);
  view.setUint16(16, 947, true);
  view.setUint32(18, 123_456, true);
  view.setUint32(22, 123_456, true);
  view.setUint16(26, 100, true);
  view.setUint16(28, 100, true);
  view.setBigUint64(30, 6_461_599_761n, true);
  view.setUint16(38, 310, true);
  view.setUint8(40, 3);
  view.setUint8(41, 26);
  view.setUint32(44, 23_290, true);
  view.setUint16(48, 78, true);
  return packet;
}

void test("uses an explicit Qualcomm SA tuple before Android fallback data", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      frame(16, 800_000, nrStandaloneConfiguration()),
      frame(16, 900_000, nrStandaloneServingCell()),
      frame(16, 950_000, B97F_ONE_CELL),
      jsonEvent(1_000_000, {
        event: "ScheduleCellInfo",
        subId: 2,
        slotId: 0,
        default: true,
        cells: [
          {
            type: "nr5g",
            registered: true,
            mcc: "505",
            mnc: "02",
            nci: 6_461_599_761,
            tac: 1,
            pci: 947,
            arfcn: 649_920,
            bands: [40],
            dbm: -99,
            "ss-rsrp": -90,
            "ss-rsrq": -9,
            "ss-sinr": 8,
          },
        ],
      }),
      lteEvent(1_020_000),
    ),
    1,
  );
  const nr = log.cells.filter((cell) => cell.rat === "NR");
  const lte = log.cells.find((cell) => cell.rat === "LTE");

  assert.equal(nr.length, 1);
  assert.ok(lte);
  assert.equal(lte.measurementRole, undefined);
  assert.equal(nr[0].registered, true);
  assert.equal(nr[0].measurementRole, undefined);
  assert.equal(nr[0].nrMode, "SA");
  assert.deepEqual(nr[0].sources, ["qualcomm-diag", "android-telephony"]);
  assert.equal(nr[0].nci, 6_461_599_761);
  assert.equal(nr[0].gnbid, 1_577_539);
  assert.equal(nr[0].gnbidLength, 24);
  assert.equal(nr[0].clid, 17);
  assert.equal(nr[0].nrIdentitySource, "derived-default-24");
  assert.equal(nr[0].tac, 23_290);
  assert.equal(nr[0].pci, 947);
  assert.equal(nr[0].arfcn, 649_920);
  assert.deepEqual(nr[0].bands, [78]);
  assert.equal(nr[0].rsrp, -126.984375);
  assert.equal(nr[0].rsrq, -18.765625);
  assert.equal(nr[0].sinr, 8);
  assert.equal(nr[0].mcc, "505");
  assert.equal(nr[0].mnc, "02");
  assert.equal(nr[0].raw.diagConfigurationConnectivityMode, 2);
  assert.equal(nr[0].raw.diagServingCellIdentity, "6461599761");
  assert.equal(nr[0].raw.diagMeasurementLogCode, "0xB97F");
  assert.equal(log.cells.length, 2);
  assert.equal(log.servingCellCount, 2);
});

void test("associates only the nearest NR packet with an LTE anchor and preserves modem provenance", () => {
  const initial = concat(nsgHeader(), timeAnchor());
  const farther = frame(16, 200_000, B97F_ONE_CELL);
  const nearest = frame(16, 950_000, B97F_TWO_CELLS);
  const nearestRecordOffset = initial.length + farther.length;
  const log = parseRecording(concat(initial, farther, nearest, lteEvent(1_000_000)));
  const lte = log.cells.find((cell) => cell.rat === "LTE");
  const nr = log.cells.filter((cell) => cell.rat === "NR");

  assert.ok(lte);
  assert.equal(lte.measurementRole, "lte-secondary");
  assert.equal(lte.raw.measurementRole, "lte-secondary");
  assert.equal(nr.length, 2);
  assert.deepEqual(
    nr.map((cell) => cell.cellIndex),
    [1, 2],
  );
  assert.ok(nr.every((cell) => cell.eventIndex === lte.eventIndex));
  assert.ok(nr.every((cell) => cell.recordOffset === lte.recordOffset));
  assert.ok(nr.every((cell) => cell.elapsedUs === lte.elapsedUs));
  assert.ok(nr.every((cell) => cell.timestampUs === lte.timestampUs));
  assert.ok(nr.every((cell) => cell.raw.diagRecordOffset === nearestRecordOffset));
  assert.ok(nr.every((cell) => cell.raw.diagStreamIndex === 0));
  assert.ok(nr.every((cell) => cell.raw.diagElapsedUs === 950_000));
  assert.ok(nr.every((cell) => cell.raw.diagTimestampUs === (EPOCH_US + 950_000n).toString()));
  assert.ok(nr.every((cell) => cell.subId === 2 && cell.slotId === 0 && cell.isDefaultSubscription === false));
  assert.ok(nr.every((cell) => cell.mcc === "260" && cell.mnc === "03"));
  assert.ok(nr.every((cell) => cell.raw.mcc === "260" && cell.raw.mnc === "03"));
  assert.equal(createSnapshotCollection(log.cells).snapshots[0].timestampMs, createSnapshotCollection(nr).snapshots[0].timestampMs);

  const neighbor = nr.find((cell) => cell.pci === 912);
  const serving = nr.find((cell) => cell.pci === 947);
  assert.ok(neighbor);
  assert.ok(serving);
  assert.equal(neighbor.registered, false);
  assert.equal(neighbor.measurementRole, "nr-neighbor");
  assert.equal(neighbor.raw.measurementRole, "neighbor");
  assert.equal(serving.registered, null);
  assert.equal(serving.measurementRole, "nr-primary");
  assert.equal(serving.raw.measurementRole, "nr-primary");
  assert.equal(serving.rsrp, -110.8671875);
  assert.equal(serving.rsrq, -11.09375);
  const csv = createCellsCsv(log, [serving]);
  assert.ok(csv.includes(`${formatNsgTimestamp(lte.timestampUs)},1000000,2,0,false`));
  assert.ok(csv.includes('""diagElapsedUs"":950000'));
});

void test("associates a real Qualcomm NR v3.0 packet with its LTE anchor", () => {
  const log = parseRecording(concat(nsgHeader(), timeAnchor(), frame(16, 950_000, B97F_V3_ONE_CELL), lteEvent(1_000_000)));
  const nr = log.cells.find((cell) => cell.rat === "NR");

  assert.ok(nr);
  assert.equal(nr.measurementRole, "nr-primary");
  assert.equal(nr.pci, 26);
  assert.equal(nr.arfcn, 649920);
  assert.equal(nr.rsrp, -123.9453125);
  assert.equal(nr.rsrq, -14.6875);
  assert.equal(nr.raw.diagVersion, "3.0");
});

void test("associates a real Qualcomm NR v2.10 packet with its LTE anchor", () => {
  const log = parseRecording(concat(nsgHeader(), timeAnchor(), frame(16, 950_000, B97F_V2_10_ONE_CELL), lteEvent(1_000_000)));
  const nr = log.cells.find((cell) => cell.rat === "NR");

  assert.ok(nr);
  assert.equal(nr.measurementRole, "nr-primary");
  assert.equal(nr.pci, 73);
  assert.equal(nr.arfcn, 639072);
  assert.equal(nr.rsrp, -108.984375);
  assert.equal(nr.rsrq, -11.2109375);
  assert.equal(nr.raw.diagVersion, "2.10");
});

void test("does not fabricate a serving NR cell from a real v2.10 sentinel packet", () => {
  const log = parseRecording(concat(nsgHeader(), timeAnchor(), frame(16, 950_000, B97F_V2_10_NO_SERVING), lteEvent(1_000_000)));

  assert.equal(
    log.cells.some((cell) => cell.rat === "NR"),
    false,
  );
});

void test("uses DIAG stream evidence instead of the Android default subscription in a dual-SIM log", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      jsonEvent(30_000, { event: "subscriptionsChanged", defaultDataSubscriptionId: 3 }),
      lteSubscriptionEvent(1_000_000, { subId: 3, slotId: 1, isDefault: false, mnc: "01", eci: 11_077_121, earfcn: 1355 }),
      lteSubscriptionEvent(1_350_000, { subId: 2, slotId: 0, isDefault: true, mnc: "02", eci: 36_113_945, earfcn: 225 }),
      frame(16, 1_200_000, B0C2_PLUS, 0),
      frame(16, 1_400_000, B97F_ONE_CELL),
    ),
  );
  const nr = log.cells.find((cell) => cell.rat === "NR");

  assert.ok(nr);
  assert.equal(nr.subId, 3);
  assert.equal(nr.slotId, 1);
  assert.equal(nr.isDefaultSubscription, false);
  assert.equal(nr.mnc, "01");
  assert.equal(nr.raw.diagStreamIndex, 0);
  assert.deepEqual(
    log.cells.map((cell) => [cell.eventIndex, cell.rat, cell.measurementRole]),
    [
      [1, "LTE", "lte-secondary"],
      [1, "NR", "nr-primary"],
      [2, "LTE", undefined],
    ],
  );
});

void test("supports a DIAG stream mapping inverted from the Android slot index", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      lteSubscriptionEvent(1_000_000, { subId: 2, slotId: 0, isDefault: false, mnc: "02", eci: 36_113_945, earfcn: 225 }),
      lteSubscriptionEvent(1_350_000, { subId: 3, slotId: 1, isDefault: true, mnc: "01", eci: 11_077_121, earfcn: 1355 }),
      frame(16, 1_200_000, B0C2_T_MOBILE, 1),
      frame(16, 1_400_000, B97F_ONE_CELL, 1),
    ),
  );
  const nr = log.cells.find((cell) => cell.rat === "NR");

  assert.ok(nr);
  assert.equal(nr.subId, 2);
  assert.equal(nr.slotId, 0);
  assert.equal(nr.mnc, "02");
  assert.equal(nr.raw.diagStreamIndex, 1);
});

void test("never crosses subscriptions while applying the LTE anchor age limit", () => {
  const attached = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      lteSubscriptionEvent(1_100_000, { subId: 3, slotId: 1, isDefault: false, mnc: "01", eci: 11_077_121, earfcn: 1355 }),
      lteSubscriptionEvent(1_950_000, { subId: 2, slotId: 0, isDefault: true, mnc: "02", eci: 36_113_945, earfcn: 225 }),
      frame(16, 1_500_000, B0C2_PLUS, 0),
      frame(16, 2_000_000, B97F_ONE_CELL, 0),
    ),
  );
  const dropped = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      lteSubscriptionEvent(400_000, { subId: 3, slotId: 1, isDefault: false, mnc: "01", eci: 11_077_121, earfcn: 1355 }),
      lteSubscriptionEvent(1_950_000, { subId: 2, slotId: 0, isDefault: true, mnc: "02", eci: 36_113_945, earfcn: 225 }),
      frame(16, 1_500_000, B0C2_PLUS, 0),
      frame(16, 2_000_000, B97F_ONE_CELL, 0),
    ),
  );

  assert.equal(attached.cells.find((cell) => cell.rat === "NR")?.subId, 3);
  assert.equal(
    dropped.cells.some((cell) => cell.rat === "NR"),
    false,
  );
  assert.ok(dropped.cells.every((cell) => cell.measurementRole === undefined));
});

void test("falls back to the default-data subscription when a DIAG stream has no serving-cell votes", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      jsonEvent(30_000, { event: "subscriptionsChanged", defaultDataSubscriptionId: 20 }),
      lteSubscriptionEvent(1_000_000, { subId: 10, slotId: 0, isDefault: true, mnc: "02", eci: 100 }),
      lteSubscriptionEvent(1_350_000, { subId: 20, slotId: 1, isDefault: false, mnc: "03", eci: 200 }),
      frame(16, 1_400_000, B97F_ONE_CELL),
    ),
  );
  const nr = log.cells.find((cell) => cell.rat === "NR");

  assert.ok(nr);
  assert.equal(nr.subId, 20);
  assert.equal(nr.slotId, 1);
  assert.equal(nr.isDefaultSubscription, false);
});

void test("does not infer an NSA subscription when multiple non-default subscriptions are present", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      lteSubscriptionEvent(1_000_000, { subId: 10, slotId: 0, isDefault: false, mnc: "02", eci: 100 }),
      lteSubscriptionEvent(1_500_000, { subId: 20, slotId: 1, isDefault: false, mnc: "03", eci: 200 }),
      frame(16, 1_400_000, B97F_ONE_CELL),
    ),
  );

  assert.equal(
    log.cells.some((cell) => cell.rat === "NR"),
    false,
  );
  assert.ok(log.cells.every((cell) => cell.measurementRole === undefined));
});

void test("ignores NR packets outside the association window or with unsupported and malformed payloads", () => {
  const unsupported = B97F_ONE_CELL.slice();
  unsupported[12] = 10;
  const malformed = B97F_ONE_CELL.subarray(0, -1);
  const cases = [
    concat(nsgHeader(), timeAnchor(), frame(16, 1, B97F_ONE_CELL), lteEvent(1_000_002)),
    concat(nsgHeader(), timeAnchor(), frame(16, 900_000, unsupported), lteEvent(1_000_000)),
    concat(nsgHeader(), timeAnchor(), frame(16, 900_000, malformed), lteEvent(1_000_000)),
  ];

  for (const bytes of cases) {
    const log = parseRecording(bytes, 1);
    assert.equal(log.cells.filter((cell) => cell.rat === "NR").length, 0);
    assert.equal(log.cells.filter((cell) => cell.rat === "LTE").length, 1);
  }
});
