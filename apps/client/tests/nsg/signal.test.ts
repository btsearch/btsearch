import assert from "node:assert/strict";
import test from "node:test";

import { MAX_SIGNAL_AGE_MS } from "../../src/features/nsg-explorer/cells/servingTimeline";
import {
  SIGNAL_BANDS,
  SIGNAL_UNKNOWN_COLOR,
  createSignalTrail,
  getReplaySignal,
  getSignalColor,
} from "../../src/features/nsg-explorer/map/signalTrail";
import type { NsgCell, NsgLocation } from "../../src/lib/nsg-parser/model";

const EPOCH_MS = 1_788_614_058_000;
const SIM = { slotId: 0, subId: 2 };

function timestamp(offsetMs: number) {
  return {
    elapsedUs: Math.round(offsetMs * 1000),
    timestampUs: (BigInt(EPOCH_MS) * 1000n + BigInt(Math.round(offsetMs * 1000))).toString(),
    timestampMs: EPOCH_MS + Math.floor(offsetMs),
  };
}

function cell(offsetMs: number, overrides: Partial<NsgCell> = {}): NsgCell {
  return {
    ...timestamp(offsetMs),
    eventIndex: Math.floor(offsetMs),
    cellIndex: 0,
    recordOffset: 0,
    rat: "LTE",
    registered: true,
    nrMode: null,
    sources: ["android-telephony"],
    ...SIM,
    isDefaultSubscription: false,
    mcc: "260",
    mnc: "03",
    operatorName: null,
    lac: null,
    rnc: null,
    cid: null,
    tac: null,
    nci: null,
    gnbid: null,
    gnbidLength: null,
    clid: null,
    nrIdentitySource: null,
    eci: null,
    pci: null,
    earfcn: null,
    arfcn: null,
    uarfcn: null,
    psc: null,
    bsic: null,
    dbm: -90,
    rssi: null,
    rsrp: null,
    rsrq: null,
    sinr: null,
    ecno: null,
    ta: null,
    ber: null,
    bands: null,
    raw: {},
    ...overrides,
  };
}

function location(recordOffsetMs: number, fixOffsetMs: number | null = recordOffsetMs): NsgLocation {
  return {
    ...timestamp(recordOffsetMs),
    eventIndex: recordOffsetMs,
    latitude: 0,
    longitude: 0,
    accuracy: 0,
    altitude: 0,
    speed: 0,
    provider: "gps",
    fixTimestampMs: fixOffsetMs === null ? null : EPOCH_MS + fixOffsetMs,
  };
}

void test("uses physical GPS fix time and never a future signal, including sub-millisecond frames", () => {
  const cells = [cell(999, { dbm: -110 }), cell(1000.001, { eventIndex: 1001, dbm: -60 })];
  const points = createSignalTrail([location(5000, 998), location(5000, 1000), location(5000, 1001)], cells, SIM).points;
  assert.equal(points[0].dbm, null);
  assert.equal(points[0].status, "missing");
  assert.equal(points[1].dbm, -110);
  assert.equal(points[1].ageMs, 1);
  assert.equal(points[1].timeBasis, "fix");
  assert.equal(points[2].dbm, -60);
  assert.equal(points[2].ageMs, 0.999);
});

void test("replay uses the current measurement between GPS fixes while leaving the recorded trail unchanged", () => {
  const before = cell(0, { dbm: -110 });
  const current = cell(2000, { dbm: -60 });
  const points = createSignalTrail([location(0), location(6000)], [before, current], SIM).points;
  assert.equal(points[0].dbm, -110);
  const original = structuredClone(current);
  const replay = getReplaySignal([current], EPOCH_MS + 5000);
  assert.strictEqual(replay.measurement, current);
  assert.equal(replay.dbm, -60);
  assert.equal(replay.color, getSignalColor(-60));
  assert.deepEqual(current, original);
  assert.equal(points[0].dbm, -110);
});

void test("replay signal rejects future timestamps and expires after the existing ten-second limit", () => {
  const current = cell(2000.001);
  assert.equal(getReplaySignal([current], EPOCH_MS + 2000).measurement, null);
  assert.equal(getReplaySignal([cell(0)], EPOCH_MS + MAX_SIGNAL_AGE_MS).dbm, -90);
  assert.equal(getReplaySignal([cell(0)], EPOCH_MS + MAX_SIGNAL_AGE_MS + 0.001).dbm, null);
  assert.equal(getReplaySignal([cell(0, { timestampUs: "invalid" })], EPOCH_MS).dbm, null);
  assert.equal(getReplaySignal([cell(0)], Number.NaN).dbm, null);
});

void test("replay requires one explicitly registered valid signal and preserves zero dBm", () => {
  const unavailable = { measurement: null, dbm: null, color: SIGNAL_UNKNOWN_COLOR };
  for (const cells of [[], [cell(0, { registered: null })], [cell(0, { registered: false })], [cell(0), cell(0, { slotId: 1, subId: 3 })]])
    assert.deepEqual(getReplaySignal(cells, EPOCH_MS), unavailable);
  for (const dbm of [null, 2147483647, Number.NaN, -201, 1]) assert.deepEqual(getReplaySignal([cell(0, { dbm })], EPOCH_MS), unavailable);
  assert.equal(getReplaySignal([cell(0, { dbm: 0 })], EPOCH_MS).dbm, 0);
  assert.equal(getReplaySignal([cell(0, { dbm: -200 })], EPOCH_MS).dbm, -200);
});

void test("falls back to frame time only when fix time is absent", () => {
  const missingFix = location(2000, null);
  const invalidFix = { ...location(2000), fixTimestampMs: Infinity };
  const points = createSignalTrail([missingFix, invalidFix], [cell(1000)], SIM).points;
  assert.equal(points[0].dbm, -90);
  assert.equal(points[0].timeBasis, "record");
  assert.equal(points[0].ageMs, 1000);
  assert.equal(points[1].dbm, null);
  assert.equal(points[1].timeBasis, "unavailable");
  assert.equal(points[1].status, "invalid");
});

void test("associates valid physical fixes despite fractional floating-point epoch noise", () => {
  const fix = { ...location(2000), fixTimestampMs: EPOCH_MS + 1234 + 0.000244140625 };
  const point = createSignalTrail([fix], [cell(1000)], SIM).points[0];
  assert.equal(point.dbm, -90);
  assert.equal(point.status, "available");
  assert.equal(point.ageMs, 234);
  assert.equal(point.timeBasis, "fix");
});

void test("keeps SIM histories separate and leaves unidentified context neutral", () => {
  const otherSim = { slotId: 1, subId: 3 };
  const cells = [cell(1000, { dbm: -100 }), cell(1500, { ...otherSim, dbm: -60 })];
  const positions = [location(1600)];
  assert.equal(createSignalTrail(positions, cells, SIM).points[0].dbm, -100);
  assert.equal(createSignalTrail(positions, cells, otherSim).points[0].dbm, -60);
  assert.equal(createSignalTrail(positions, cells, { slotId: 0, subId: 3 }).points[0].dbm, null);
  assert.equal(createSignalTrail(positions, cells, null).points[0].dbm, null);
  assert.equal(createSignalTrail(positions, [cell(1000, { slotId: null, subId: null })], { slotId: null, subId: null }).points[0].dbm, null);
});

void test("latest missing, unregistered or invalid measurements do not carry older valid signal forward", () => {
  for (const latest of [
    cell(1500, { dbm: null }),
    cell(1500, { registered: null, rat: "GSM" }),
    cell(1500, { registered: false }),
    cell(1500, { dbm: 2147483647 }),
  ]) {
    const point = createSignalTrail([location(1600)], [cell(1000), latest], SIM).points[0];
    assert.equal(point.dbm, null);
    assert.equal(point.color, SIGNAL_UNKNOWN_COLOR);
    assert.equal(point.ageMs, 100);
  }
});

void test("expires signal after the explicit ten-second age limit", () => {
  const exact = location(MAX_SIGNAL_AGE_MS, null);
  const expired = location(MAX_SIGNAL_AGE_MS + 0.001, null);
  const trail = createSignalTrail([exact, expired], [cell(0)], SIM);
  assert.equal(trail.points[0].dbm, -90);
  assert.equal(trail.points[0].ageMs, MAX_SIGNAL_AGE_MS);
  assert.equal(trail.points[1].dbm, null);
  assert.equal(trail.points[1].status, "stale");
  assert.equal(trail.points[1].ageMs, MAX_SIGNAL_AGE_MS + 0.001);
  assert.equal(trail.availableCount, 1);
  assert.equal(trail.unknownCount, 1);
  assert.equal(trail.staleCount, 1);
});

void test("handles regressing timestamps without reordering locations or mutating input", () => {
  const positions = [location(3000), location(1000), location(2000)];
  const cells = [cell(2000, { dbm: -70 }), cell(0, { dbm: -120 })];
  const trail = createSignalTrail(positions, cells, SIM);
  assert.deepEqual(
    trail.points.map((point) => point.dbm),
    [-70, -120, -70],
  );
  for (let index = 0; index < positions.length; index++) assert.strictEqual(trail.points[index].location, positions[index]);
  assert.equal(cells[0].dbm, -70);
  const tied = createSignalTrail([location(2000)], [cell(1000, { eventIndex: 10, dbm: -70 }), cell(1000, { eventIndex: 11, dbm: -80 })], SIM);
  assert.equal(tied.points[0].dbm, -80);
});

void test("requires one explicitly registered serving cell in the selected snapshot", () => {
  const serving = cell(1000, { cellIndex: 0 });
  const ambiguous = createSignalTrail([location(2000)], [serving, cell(1000, { cellIndex: 1, dbm: -70 })], SIM);
  assert.equal(ambiguous.points[0].dbm, null);
  assert.equal(ambiguous.points[0].status, "ambiguous");
  const clear = createSignalTrail([location(2000)], [serving, cell(1000, { cellIndex: 1, registered: null, dbm: -70 })], SIM);
  assert.equal(clear.points[0].dbm, -90);
  assert.strictEqual(clear.points[0].measurement, serving);
});

void test("does not treat the NR primary as a second registered LTE signal", () => {
  const lte = cell(1000, { cellIndex: 0 });
  const nr = cell(1000, {
    cellIndex: 1,
    rat: "NR",
    registered: null,
    measurementRole: "nr-primary",
    dbm: null,
    pci: 947,
    arfcn: 649920,
    rsrp: -110.8671875,
  });

  const replay = getReplaySignal([lte, nr], EPOCH_MS + 2000);
  assert.strictEqual(replay.measurement, lte);
  assert.equal(replay.dbm, -90);
  const point = createSignalTrail([location(2000)], [lte, nr], SIM).points[0];
  assert.equal(point.status, "available");
  assert.strictEqual(point.measurement, lte);
  assert.equal(point.dbm, -90);
});

void test("uses raw dBm, preserves zero, and applies stable numeric color boundaries", () => {
  const zero = createSignalTrail([location(1000)], [cell(0, { dbm: 0, rsrp: -120 })], SIM);
  assert.equal(zero.points[0].dbm, 0);
  assert.equal(zero.points[0].color, SIGNAL_BANDS[0].color);
  assert.deepEqual(
    [-80, -90, -100, -110, -111].map(getSignalColor),
    SIGNAL_BANDS.map((band) => band.color),
  );
  for (const value of [null, 1, -201, -2147483648, 2147483647, Infinity, Number.NaN]) assert.equal(getSignalColor(value), SIGNAL_UNKNOWN_COLOR);
  const noFallback = createSignalTrail([location(1000)], [cell(0, { dbm: null, rsrp: -80, rssi: -70 })], SIM);
  assert.equal(noFallback.points[0].dbm, null);
});

void test("uses Qualcomm RSRP for fused registered NR signal with Android dBm as fallback", () => {
  const fused = cell(0, {
    rat: "NR",
    nrMode: "SA",
    sources: ["qualcomm-diag", "android-telephony"],
    dbm: -82,
    rsrp: -110.8671875,
  });
  const replay = getReplaySignal([fused], EPOCH_MS + 1000);
  const point = createSignalTrail([location(1000)], [fused], SIM).points[0];

  assert.equal(replay.dbm, -110.8671875);
  assert.equal(replay.color, getSignalColor(-110.8671875));
  assert.equal(point.dbm, -110.8671875);
  assert.equal(point.color, getSignalColor(-110.8671875));

  const fallback = cell(0, {
    rat: "NR",
    nrMode: "SA",
    sources: ["qualcomm-diag", "android-telephony"],
    dbm: -96,
    rsrp: null,
  });
  assert.equal(getReplaySignal([fallback], EPOCH_MS + 1000).dbm, -96);
});
