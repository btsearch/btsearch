import assert from "node:assert/strict";
import test from "node:test";

import { EventProcessor, type EventProcessorSink } from "../../src/lib/nsg-parser/internal/eventProcessor";
import { StreamDecoder } from "../../src/lib/nsg-parser/internal/streamDecoder";
import type { NsgEvent, NsgJsonObject } from "../../src/lib/nsg-parser/model";
import { concatBytes as concat } from "./binary";
import { EPOCH_US, jsonEvent, mixedRecordingBytes, nsgHeader, timeAnchor } from "./fixtures/nsgContainer";

function parseRecording(bytes: Uint8Array, chunkSize = bytes.length) {
  const parser = new StreamDecoder({ name: "synthetic.log", size: bytes.length });
  for (let start = 0; start < bytes.length; start += chunkSize) parser.push(bytes.subarray(start, start + chunkSize));
  return parser.finish();
}

function processorEvent(id: number, elapsedUs: number, data: NsgJsonObject): NsgEvent {
  return {
    id,
    name: String(data.event),
    marker: 0x42,
    recordOffset: 0,
    streamIndex: 0,
    elapsedUs,
    timestampUs: (EPOCH_US + BigInt(elapsedUs)).toString(),
    timestampMs: Number((EPOCH_US + BigInt(elapsedUs)) / 1000n),
    data,
  };
}

void test("normalizes a combined UMTS CI without changing the raw event", () => {
  const ci = 56 * 0x10000 + 34;
  const bytes = concat(
    nsgHeader(),
    timeAnchor(),
    jsonEvent(1_000_000, {
      event: "ScheduleCellInfo",
      cells: [{ type: "umts", mcc: "260", mnc: "02", lac: 12, ci, psc: 7, uarfcn: 0, dbm: -75, ecno: 0, registered: false }],
    }),
  );

  const cell = parseRecording(bytes).cells[0];
  assert.equal(cell.rat, "UMTS");
  assert.equal(cell.rnc, 56);
  assert.equal(cell.cid, 34);
  assert.equal(cell.ecno, 0);
  assert.equal(cell.raw.ci, ci);
  assert.equal(cell.raw.ecno, 0);
  assert.equal("rnc" in cell.raw, false);
  assert.equal("cid" in cell.raw, false);
});

void test("normalizes Android NR SA identity and SS measurements without inventing an LTE anchor", () => {
  const serving = {
    type: "nr5g",
    mcc: "001",
    mnc: "01",
    arfcn: 640_000,
    pci: 0,
    nci: 4_886_718_345,
    tac: 144_470,
    bands: [78],
    dbm: -98,
    "ss-rsrp": -98,
    "ss-rsrq": -11,
    "ss-sinr": 8,
    "csi-sinr": 0,
    registered: true,
  } satisfies NsgJsonObject;
  const neighbor = {
    type: "nr5g",
    arfcn: 640_032,
    pci: 729,
    nci: 0,
    tac: 0,
    bands: [78],
    dbm: -84,
    "ss-rsrp": -84,
    "ss-rsrq": -10,
    "ss-sinr": 17,
  } satisfies NsgJsonObject;
  const bytes = concat(
    nsgHeader(),
    timeAnchor(),
    jsonEvent(1_000_000, { event: "ScheduleCellInfo", subId: 7, slotId: 0, default: true, cells: [serving, neighbor] }),
    jsonEvent(1_010_000, {
      event: "ScheduleCellInfo",
      subId: 8,
      slotId: 1,
      default: false,
      cells: [{ type: "lte", registered: true, eci: 123, pci: 4, earfcn: 1300 }],
    }),
  );

  const log = parseRecording(bytes, 1);
  assert.equal(log.cells.length, 3);
  assert.equal(log.servingCellCount, 2);
  assert.equal(log.inputTruncated, false);
  assert.deepEqual(
    log.cells.slice(0, 2).map((cell) => ({
      rat: cell.rat,
      registered: cell.registered,
      nrMode: cell.nrMode,
      sources: cell.sources,
      subId: cell.subId,
      slotId: cell.slotId,
      nci: cell.nci,
      gnbid: cell.gnbid,
      gnbidLength: cell.gnbidLength,
      clid: cell.clid,
      nrIdentitySource: cell.nrIdentitySource,
      tac: cell.tac,
      pci: cell.pci,
      arfcn: cell.arfcn,
      bands: cell.bands,
      dbm: cell.dbm,
      rsrp: cell.rsrp,
      rsrq: cell.rsrq,
      sinr: cell.sinr,
    })),
    [
      {
        rat: "NR",
        registered: true,
        nrMode: "SA",
        sources: ["android-telephony"],
        subId: 7,
        slotId: 0,
        nci: 4_886_718_345,
        gnbid: 1_193_046,
        gnbidLength: 24,
        clid: 1_929,
        nrIdentitySource: "derived-default-24",
        tac: 144_470,
        pci: 0,
        arfcn: 640_000,
        bands: [78],
        dbm: -98,
        rsrp: -98,
        rsrq: -11,
        sinr: 8,
      },
      {
        rat: "NR",
        registered: null,
        nrMode: "SA",
        sources: ["android-telephony"],
        subId: 7,
        slotId: 0,
        nci: 0,
        gnbid: null,
        gnbidLength: null,
        clid: null,
        nrIdentitySource: null,
        tac: 0,
        pci: 729,
        arfcn: 640_032,
        bands: [78],
        dbm: -84,
        rsrp: -84,
        rsrq: -10,
        sinr: 17,
      },
    ],
  );
  assert.equal(log.cells[2].rat, "LTE");
  assert.equal(log.cells[2].nrMode, null);
  assert.deepEqual(log.cells[0].raw, serving);
  assert.equal("rsrp" in serving, false);
  assert.equal(serving["ss-rsrp"], -98);
});

void test("prefers reported NR identity and otherwise uses a valid reported gNB length", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      jsonEvent(1, {
        event: "ScheduleCellInfo",
        cells: [
          { type: "nr5g", nci: 6_461_599_761, gnbid: 77, clid: 4, gnbidLength: 26 },
          { type: "nr5g", nci: 6_461_599_761, gnbIdLength: 28 },
          { type: "nr5g", nci: 6_461_599_761, gnbid: -1, clid: 4, gnbidLength: 21 },
        ],
      }),
    ),
  );

  assert.deepEqual(
    log.cells.map(({ gnbid, gnbidLength, clid, nrIdentitySource }) => ({ gnbid, gnbidLength, clid, nrIdentitySource })),
    [
      { gnbid: 77, gnbidLength: 26, clid: 4, nrIdentitySource: "reported" },
      { gnbid: 25_240_624, gnbidLength: 28, clid: 17, nrIdentitySource: "derived-reported-length" },
      { gnbid: 1_577_539, gnbidLength: 24, clid: 17, nrIdentitySource: "derived-default-24" },
    ],
  );
});

void test("does not derive UMTS identity from malformed or out-of-range CI values", () => {
  for (const ci of [-1, 1.5, 0x10000000, 2147483647, "3670050"])
    assert.deepEqual(
      parseRecording(concat(nsgHeader(), timeAnchor(), jsonEvent(1_000_000, { event: "ScheduleCellInfo", cells: [{ type: "umts", ci }] }))).cells.map(
        (cell) => [cell.rnc, cell.cid],
      ),
      [[null, null]],
      `ci=${ci}`,
    );
});

void test("keeps recording time separate from GPS fix time and excludes geocoder positions", () => {
  const log = parseRecording(mixedRecordingBytes());
  assert.equal(log.locations.length, 1);
  const location = log.locations[0];
  assert.equal(location.latitude, 0);
  assert.equal(location.longitude, 0);
  assert.equal(location.speed, 0);
  assert.equal(location.accuracy, 0);
  assert.equal(location.fixTimestampMs, 1788614050000);
  assert.equal(location.timestampUs, (EPOCH_US + 1200000n).toString());
  assert.equal(location.eventIndex, 1);
});

void test("normalizes the exact UMTS CI bounds while explicit RNC and CID take precedence", () => {
  const log = parseRecording(
    concat(
      nsgHeader(),
      timeAnchor(),
      jsonEvent(1, {
        event: "ScheduleCellInfo",
        cells: [
          { type: "umts", ci: 0 },
          { type: "wcdma", ci: 0x0fffffff },
          { type: "umts", ci: 56 * 0x10000 + 34, rnc: 9, cid: 8 },
        ],
      }),
    ),
  );

  assert.deepEqual(
    log.cells.map(({ rnc, cid }) => [rnc, cid]),
    [
      [0, 0],
      [0xfff, 0xffff],
      [9, 8],
    ],
  );
});

void test("rejects measurement events whose cells field is missing or not an array", () => {
  for (const data of [{ event: "ScheduleCellInfo" }, { event: "ScheduleCellInfo", cells: {} }])
    assert.throws(() => parseRecording(concat(nsgHeader(), timeAnchor(), jsonEvent(1, data))), /Expected a cells array/);
});

void test("retains only safe non-negative default-data subscription IDs in complete mode", () => {
  const retained: { elapsedUs: number; subId: number }[] = [];
  const sink: EventProcessorSink = {
    emitCell() {},
    retainDefaultDataSubscription: (change) => retained.push(change),
    retainLteAnchor() {},
    retainLocation() {},
  };
  const processor = new EventProcessor(new TextDecoder(), (message) => {
    throw new Error(message);
  });
  const invalidIds = [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "2", null];

  invalidIds.forEach((defaultDataSubscriptionId, id) => {
    processor.processEvent(processorEvent(id, id, { event: "subscriptionsChanged", defaultDataSubscriptionId }), "complete", sink);
  });
  processor.processEvent(processorEvent(5, 5, { event: "subscriptionsChanged", defaultDataSubscriptionId: 0 }), "streaming", sink);
  processor.processEvent(processorEvent(6, 6, { event: "subscriptionsChanged", defaultDataSubscriptionId: 0 }), "complete", sink);

  assert.deepEqual(retained, [{ elapsedUs: 6, subId: 0 }]);
});
