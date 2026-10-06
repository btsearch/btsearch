import assert from "node:assert/strict";
import test from "node:test";

import { StreamDecoder } from "../../src/lib/nsg-parser/internal/streamDecoder";
import {
  QUALCOMM_NR_CONFIGURATION_INFO_LOG_CODE,
  QUALCOMM_NR_SERVING_CELL_INFO_LOG_CODE,
  decodeQualcommNrConfigurationInfo,
  decodeQualcommNrServingCellInfo,
} from "../../src/lib/nsg-parser/qualcomm";
import { concatBytes as concat } from "./binary";
import { B97F_ONE_CELL, B97F_TWO_CELLS, B97F_V2_10_NO_SERVING, frame, jsonEvent, lteEvent, nsgHeader, timeAnchor } from "./fixtures/nsgContainer";

function parseRecording(bytes: Uint8Array) {
  const parser = new StreamDecoder({ name: "sa-edge-probe.log", size: bytes.length });
  parser.push(bytes);
  return parser.finish();
}

function nrConfiguration(isNrStandalone: boolean): Uint8Array {
  const packet = new Uint8Array(73);
  const view = new DataView(packet.buffer);
  view.setUint16(0, packet.length, true);
  view.setUint16(2, QUALCOMM_NR_CONFIGURATION_INFO_LOG_CODE, true);
  view.setUint32(12, 8, true);
  view.setUint8(16, isNrStandalone ? 7 : 0);
  view.setUint8(17, isNrStandalone ? 1 : 0);
  view.setUint8(18, isNrStandalone ? 2 : 0);
  return packet;
}

function nrServingCell(options: { nci?: bigint; pci?: number; tac?: number; band?: number } = {}): Uint8Array {
  const packet = new Uint8Array(50);
  const view = new DataView(packet.buffer);
  view.setUint16(0, packet.length, true);
  view.setUint16(2, QUALCOMM_NR_SERVING_CELL_INFO_LOG_CODE, true);
  view.setUint32(12, 4, true);
  view.setUint16(16, options.pci ?? 947, true);
  view.setUint32(18, 649_920, true);
  view.setUint32(22, 649_920, true);
  view.setUint16(26, 100, true);
  view.setUint16(28, 100, true);
  view.setBigUint64(30, options.nci ?? 6_461_599_761n, true);
  view.setUint16(38, 310, true);
  view.setUint8(40, 3);
  view.setUint8(41, 26);
  view.setUint8(42, 1);
  view.setUint32(44, options.tac ?? 23_290, true);
  view.setUint16(48, options.band ?? 78, true);
  return packet;
}

function nrEvent(
  elapsedUs: number,
  options: { nci?: number; pci?: number; tac?: number; arfcn?: number; band?: number; subId?: number; slotId?: number; mnc?: string } = {},
) {
  return jsonEvent(elapsedUs, {
    event: "ScheduleCellInfo",
    subId: options.subId ?? 2,
    slotId: options.slotId ?? 0,
    default: true,
    cells: [
      {
        type: "nr5g",
        registered: true,
        mcc: "505",
        mnc: options.mnc ?? "02",
        nci: options.nci ?? 6_461_599_761,
        tac: options.tac ?? 111,
        pci: options.pci ?? 947,
        arfcn: options.arfcn ?? 649_920,
        bands: [options.band ?? 40],
        "ss-rsrp": -90,
        "ss-rsrq": -9,
        "ss-sinr": 8,
      },
    ],
  });
}

void test("a negative B825 clears positive SA state and lets later B97F use NSA", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      frame(16, 100_000, nrConfiguration(true)),
      nrEvent(200_000),
      frame(16, 300_000, nrConfiguration(false)),
      frame(16, 400_000, B97F_ONE_CELL),
      lteEvent(450_000),
    ),
  );
  const nr = log.cells.filter((cell) => cell.rat === "NR");
  const lte = log.cells.find((cell) => cell.rat === "LTE");

  assert.deepEqual(
    nr.map((cell) => cell.nrMode),
    ["SA", "NSA"],
  );
  assert.equal(nr[0].raw.diagConfigurationElapsedUs, 100_000);
  assert.equal(nr[1].raw.diagElapsedUs, 400_000);
  assert.equal(lte?.measurementRole, "lte-secondary");
});

void test("B97F observed during positive SA stays unattributed without positive stream-to-subscription evidence", () => {
  const log = parseRecording(
    concat(nsgHeader(), timeAnchor(), frame(16, 100_000, nrConfiguration(true)), frame(16, 200_000, B97F_ONE_CELL), lteEvent(250_000)),
  );

  const nr = log.cells.find((cell) => cell.rat === "NR");
  assert.ok(nr);
  assert.equal(nr.nrMode, "SA");
  assert.deepEqual(nr.sources, ["qualcomm-diag"]);
  assert.equal(nr.subId, null);
  assert.equal(nr.slotId, null);
  assert.equal(nr.mcc, null);
  assert.equal(nr.mnc, null);
  assert.equal(nr.operatorName, null);
  assert.equal(nr.pci, 947);
  assert.equal(nr.arfcn, 649_920);
  assert.equal(nr.raw.diagMeasurementLogCode, "0xB97F");
  assert.equal(log.cells.find((cell) => cell.rat === "LTE")?.measurementRole, undefined);
});

void test("ScheduleCellInfo-proven SA consumes an exact nearby B97F match without B825", () => {
  const log = parseRecording(concat(nsgHeader(), timeAnchor(), nrEvent(200_000), frame(16, 250_000, B97F_ONE_CELL), lteEvent(300_000)));
  const nr = log.cells.filter((cell) => cell.rat === "NR");

  assert.equal(nr.length, 1);
  assert.equal(nr[0].nrMode, "SA");
  assert.deepEqual(nr[0].sources, ["qualcomm-diag", "android-telephony"]);
  assert.equal(nr[0].raw.diagMeasurementLogCode, "0xB97F");
  assert.equal(nr[0].rsrp, -126.984375);
  assert.equal(log.cells.find((cell) => cell.rat === "LTE")?.measurementRole, undefined);
});

void test("a nearby future positive B825 confirms a pre-configuration B97F exact Schedule SA pair", () => {
  const log = parseRecording(
    concat(nsgHeader(), timeAnchor(), frame(16, 100_000, B97F_ONE_CELL), frame(16, 150_000, nrConfiguration(true)), nrEvent(200_000)),
  );
  const nr = log.cells.filter((cell) => cell.rat === "NR");

  assert.equal(nr.length, 1);
  assert.deepEqual(nr[0].sources, ["qualcomm-diag", "android-telephony"]);
  assert.equal(nr[0].raw.diagConfigurationElapsedUs, 150_000);
  assert.equal(nr[0].raw.diagMeasurementElapsedUs, 100_000);
  assert.equal(nr[0].rsrp, -126.984375);
});

void test("a nearby future positive B825 confirms a pre-configuration B823 exact Schedule SA NCI", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      frame(16, 100_000, nrServingCell({ pci: 321, tac: 222, band: 78 })),
      frame(16, 150_000, nrConfiguration(true)),
      nrEvent(200_000, { pci: 12, tac: 111, band: 40 }),
    ),
  );
  const nr = log.cells.filter((cell) => cell.rat === "NR");

  assert.equal(nr.length, 1);
  assert.deepEqual(nr[0].sources, ["qualcomm-diag", "android-telephony"]);
  assert.equal(nr[0].raw.diagConfigurationElapsedUs, 150_000);
  assert.equal(nr[0].raw.diagServingCellElapsedUs, 100_000);
  assert.equal(nr[0].pci, 321);
  assert.equal(nr[0].tac, 222);
  assert.deepEqual(nr[0].bands, [78]);
});

void test("B823 then exact Schedule SA NCI then nearby positive B825 associates in source order", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      frame(16, 100_000, nrServingCell({ pci: 321, tac: 222, band: 78 })),
      nrEvent(150_000, { pci: 12, tac: 111, band: 40 }),
      frame(16, 200_000, nrConfiguration(true)),
    ),
  );
  const nr = log.cells.filter((cell) => cell.rat === "NR");

  assert.equal(nr.length, 1);
  assert.deepEqual(nr[0].sources, ["qualcomm-diag", "android-telephony"]);
  assert.equal(nr[0].raw.diagServingCellElapsedUs, 100_000);
  assert.equal(nr[0].raw.diagConfigurationElapsedUs, 200_000);
  assert.equal(nr[0].nci, 6_461_599_761);
  assert.equal(nr[0].pci, 321);
  assert.equal(nr[0].tac, 222);
  assert.deepEqual(nr[0].bands, [78]);
});

void test("prior non-SA state blocks B823 then Schedule then positive B825 look-ahead", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      frame(16, 50_000, nrConfiguration(false)),
      frame(16, 100_000, nrServingCell({ pci: 321, tac: 222, band: 78 })),
      nrEvent(150_000),
      frame(16, 200_000, nrConfiguration(true)),
    ),
  );
  const nr = log.cells.find((cell) => cell.rat === "NR");

  assert.ok(nr);
  assert.deepEqual(nr.sources, ["android-telephony"]);
  assert.equal(nr.raw.diagServingCellLogCode, undefined);
  assert.equal(nr.raw.diagConfigurationLogCode, undefined);
  assert.equal(nr.pci, 947);
});

void test("ambiguous subscriptions block B823 then Schedule then positive B825 attribution", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      frame(16, 100_000, nrServingCell()),
      nrEvent(140_000, { subId: 2, slotId: 0 }),
      nrEvent(150_000, { subId: 3, slotId: 1 }),
      frame(16, 200_000, nrConfiguration(true)),
    ),
  );
  const nr = log.cells.filter((cell) => cell.rat === "NR");

  assert.equal(nr.length, 2);
  assert.ok(nr.every((cell) => cell.sources.length === 1 && cell.sources[0] === "android-telephony"));
  assert.ok(nr.every((cell) => cell.raw.diagServingCellLogCode === undefined));
  assert.ok(nr.every((cell) => cell.raw.diagConfigurationLogCode === undefined));
});

void test("an explicit prior non-SA B825 blocks future-state look-ahead for B97F and B823", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      frame(16, 50_000, nrConfiguration(false)),
      frame(16, 100_000, B97F_ONE_CELL),
      frame(16, 110_000, nrServingCell({ pci: 321, tac: 222, band: 78 })),
      frame(16, 150_000, nrConfiguration(true)),
      nrEvent(200_000),
      lteEvent(250_000),
    ),
  );
  const nrStandaloneCell = log.cells.find((cell) => cell.rat === "NR" && cell.nrMode === "SA");
  const nrNonStandaloneCell = log.cells.find((cell) => cell.rat === "NR" && cell.nrMode === "NSA");

  assert.ok(nrStandaloneCell);
  assert.ok(nrNonStandaloneCell);
  assert.equal(nrStandaloneCell.raw.diagServingCellLogCode, undefined);
  assert.equal(nrStandaloneCell.raw.diagMeasurementLogCode, undefined);
  assert.equal(nrStandaloneCell.pci, 947);
  assert.equal(nrNonStandaloneCell.raw.diagElapsedUs, 100_000);
});

void test("ambiguous Schedule SA subscriptions block future B825 attribution for B97F and B823", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      frame(16, 100_000, B97F_ONE_CELL),
      frame(16, 110_000, nrServingCell()),
      frame(16, 150_000, nrConfiguration(true)),
      nrEvent(200_000, { subId: 2, slotId: 0 }),
      nrEvent(210_000, { subId: 3, slotId: 1 }),
    ),
  );
  const nr = log.cells.filter((cell) => cell.rat === "NR");

  assert.equal(nr.length, 2);
  assert.ok(nr.every((cell) => cell.sources.length === 1 && cell.sources[0] === "android-telephony"));
  assert.ok(nr.every((cell) => cell.raw.diagConfigurationLogCode === undefined));
  assert.ok(nr.every((cell) => cell.raw.diagServingCellLogCode === undefined));
  assert.ok(nr.every((cell) => cell.raw.diagMeasurementLogCode === undefined));
});

void test("B823 does not attach an explicit B97F neighbor to the serving identity on a reused PCI", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      frame(16, 100_000, nrConfiguration(true)),
      frame(16, 150_000, nrServingCell({ pci: 912 })),
      frame(16, 180_000, B97F_TWO_CELLS),
      nrEvent(200_000, { pci: 912, arfcn: 649_920 }),
    ),
  );
  const serving = log.cells.find((cell) => cell.raw.diagServingCellPci === 912);
  const reusedPciNeighbor = log.cells.find((cell) => cell.raw.diagMeasurementPci === 912);

  assert.ok(serving);
  assert.ok(reusedPciNeighbor);
  assert.equal(serving.registered, true);
  assert.equal(serving.raw.diagMeasurementPci, undefined);
  assert.equal(serving.rsrp, -90);
  assert.equal(reusedPciNeighbor.registered, false);
});

void test("B823 identifies a modem-only SA serving cell when B97F omits its serving flag", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      frame(16, 100_000, nrConfiguration(true)),
      frame(16, 150_000, nrServingCell({ pci: 73 })),
      frame(16, 200_000, B97F_V2_10_NO_SERVING),
    ),
  );
  const nr = log.cells.find((cell) => cell.rat === "NR");

  assert.ok(nr);
  assert.equal(nr.registered, true);
  assert.equal(nr.nrMode, "SA");
  assert.deepEqual(nr.sources, ["qualcomm-diag"]);
  assert.equal(nr.subId, null);
  assert.equal(nr.slotId, null);
  assert.equal(nr.mcc, null);
  assert.equal(nr.mnc, null);
  assert.equal(nr.nci, 6_461_599_761);
  assert.equal(nr.gnbid, 1_577_539);
  assert.equal(nr.gnbidLength, 24);
  assert.equal(nr.clid, 17);
  assert.equal(nr.nrIdentitySource, "derived-default-24");
  assert.equal(nr.pci, 73);
  assert.equal(nr.arfcn, 639_072);
  assert.equal(nr.raw.diagMeasurementServing, false);
  assert.ok(nr.eventIndex >= 0 && nr.eventIndex < log.events.length);
  const event = log.events[nr.eventIndex];
  assert.equal(event.id, nr.eventIndex);
  assert.equal(event.name, "QualcommNrStandalone");
  assert.equal(event.marker, null);
  assert.equal(event.recordOffset, nr.recordOffset);
  assert.equal(event.streamIndex, 0);
  assert.equal(event.data.event, "QualcommNrStandalone");
  assert.equal(event.data.source, "qualcomm-diag");
  assert.equal(log.servingCellCount, 1);
  assert.equal(log.eventTypeCounts.QualcommNrStandalone, 1);
});

void test("preserves a reported zero NCI without deriving gNBID or CLID", () => {
  const log = parseRecording(
    concat(nsgHeader(), timeAnchor(), frame(16, 100_000, nrConfiguration(true)), frame(16, 150_000, nrServingCell({ nci: 0n, pci: 73 }))),
  );
  const nr = log.cells.find((cell) => cell.rat === "NR");

  assert.ok(nr);
  assert.equal(nr.nci, 0);
  assert.equal(nr.gnbid, null);
  assert.equal(nr.gnbidLength, null);
  assert.equal(nr.clid, null);
  assert.equal(nr.nrIdentitySource, null);
});

void test("B823 identity maps an inverted DIAG stream to the correct NR subscription", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      frame(16, 100_000, nrConfiguration(true), 1),
      frame(16, 150_000, nrServingCell(), 1),
      frame(16, 180_000, B97F_ONE_CELL, 1),
      nrEvent(200_000, { subId: 2, slotId: 0, nci: 6_461_599_761, mnc: "02" }),
      nrEvent(210_000, { subId: 3, slotId: 1, nci: 999, pci: 123, mnc: "01" }),
    ),
  );
  const target = log.cells.find((cell) => cell.rat === "NR" && cell.subId === 2);
  const other = log.cells.find((cell) => cell.rat === "NR" && cell.subId === 3);

  assert.ok(target);
  assert.ok(other);
  assert.equal(target.slotId, 0);
  assert.equal(target.raw.diagServingCellStreamIndex, 1);
  assert.equal(target.raw.diagMeasurementStreamIndex, 1);
  assert.deepEqual(target.sources, ["qualcomm-diag", "android-telephony"]);
  assert.equal(other.raw.diagServingCellLogCode, undefined);
  assert.deepEqual(other.sources, ["android-telephony"]);
});

void test("ambiguous dual-SIM SA data stays modem-only instead of crossing subscriptions", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      frame(16, 100_000, nrConfiguration(true), 0),
      frame(16, 180_000, B97F_ONE_CELL, 0),
      nrEvent(200_000, { subId: 2, slotId: 0, nci: 111, pci: 12, mnc: "02" }),
      nrEvent(210_000, { subId: 3, slotId: 1, nci: 222, pci: 123, mnc: "01" }),
    ),
  );
  const modem = log.cells.find((cell) => cell.rat === "NR" && cell.sources.length === 1 && cell.sources[0] === "qualcomm-diag");

  assert.ok(modem);
  assert.equal(modem.subId, null);
  assert.equal(modem.slotId, null);
  assert.equal(modem.mcc, null);
  assert.equal(modem.mnc, null);
  assert.equal(log.cells.filter((cell) => cell.sources.length === 1 && cell.sources[0] === "android-telephony").length, 2);
});

void test("B823 cannot cross DIAG streams", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      frame(16, 100_000, nrConfiguration(true), 0),
      frame(16, 150_000, nrServingCell(), 1),
      nrEvent(200_000, { nci: 6_461_599_761, pci: 12, tac: 111, band: 40, slotId: 0 }),
    ),
  );
  const nr = log.cells.find((cell) => cell.rat === "NR");

  assert.ok(nr);
  assert.equal(nr.nrMode, "SA");
  assert.equal(nr.pci, 12);
  assert.equal(nr.tac, 111);
  assert.deepEqual(nr.bands, [40]);
  assert.equal(nr.raw.diagServingCellLogCode, undefined);
});

void test("a same-stream B823 identity mismatch preserves ScheduleCellInfo fields", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      frame(16, 100_000, nrConfiguration(true)),
      frame(16, 150_000, nrServingCell({ nci: 999n, pci: 321, tac: 222, band: 78 })),
      nrEvent(200_000, { nci: 123, pci: 12, tac: 111, band: 40 }),
    ),
  );
  const nr = log.cells.find((cell) => cell.rat === "NR" && log.events[cell.eventIndex]?.name === "ScheduleCellInfo");

  assert.ok(nr);
  assert.equal(nr.nci, 123);
  assert.equal(nr.pci, 12);
  assert.equal(nr.tac, 111);
  assert.deepEqual(nr.bands, [40]);
  assert.equal(nr.raw.diagServingCellLogCode, undefined);
});

void test("B823 fuses identity without requiring B97F", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      frame(16, 100_000, nrConfiguration(true)),
      frame(16, 150_000, nrServingCell({ pci: 321, tac: 222, band: 78 })),
      nrEvent(200_000, { pci: 12, tac: 111, band: 40 }),
    ),
  );
  const nr = log.cells.find((cell) => cell.rat === "NR");

  assert.ok(nr);
  assert.equal(nr.nrMode, "SA");
  assert.equal(nr.nci, 6_461_599_761);
  assert.equal(nr.pci, 321);
  assert.equal(nr.tac, 222);
  assert.deepEqual(nr.bands, [78]);
  assert.equal(nr.arfcn, 649_920);
  assert.equal(nr.rsrp, -90);
  assert.equal(nr.raw.diagMeasurementLogCode, undefined);
  assert.equal(nr.raw.diagServingCellLogCode, "0xB823");
});

void test("B823 and B825 reject adjacent versions and inconsistent declared lengths", () => {
  const serving = nrServingCell();
  const configuration = nrConfiguration(true);
  for (const version of [3, 5]) {
    const packet = Uint8Array.from(serving);
    new DataView(packet.buffer).setUint32(12, version, true);
    assert.equal(decodeQualcommNrServingCellInfo(packet), null);
  }
  for (const version of [7, 9]) {
    const packet = Uint8Array.from(configuration);
    new DataView(packet.buffer).setUint32(12, version, true);
    assert.equal(decodeQualcommNrConfigurationInfo(packet), null);
  }
  for (const packet of [serving, configuration]) {
    const tooLong = Uint8Array.from(packet);
    new DataView(tooLong.buffer).setUint16(0, packet.length + 1, true);
    assert.equal(packet === serving ? decodeQualcommNrServingCellInfo(tooLong) : decodeQualcommNrConfigurationInfo(tooLong), null);
  }
});
