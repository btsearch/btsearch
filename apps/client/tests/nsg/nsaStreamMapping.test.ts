import assert from "node:assert/strict";
import test from "node:test";

import type { LteAnchor } from "../../src/lib/nsg-parser/internal/nonStandalone/model";
import { type TimedLteServingCellInfo, createNrNonStandaloneAnchorResolver } from "../../src/lib/nsg-parser/internal/nonStandalone/streamMapping";
import type { NsgCell } from "../../src/lib/nsg-parser/model";

function anchor(slotId: number, subId: number, eventIndex: number, elapsedUs: number, eci: number, earfcn: number): LteAnchor {
  const cell: NsgCell = {
    eventIndex,
    cellIndex: 0,
    recordOffset: eventIndex,
    elapsedUs,
    timestampUs: String(elapsedUs),
    timestampMs: elapsedUs / 1000,
    rat: "LTE",
    registered: true,
    nrMode: null,
    sources: ["android-telephony"],
    subId,
    slotId,
    isDefaultSubscription: false,
    mcc: "260",
    mnc: "01",
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
    eci,
    pci: 1,
    earfcn,
    arfcn: null,
    uarfcn: null,
    psc: null,
    bsic: null,
    dbm: -90,
    rssi: null,
    rsrp: -100,
    rsrq: -10,
    sinr: null,
    ecno: null,
    ta: null,
    ber: null,
    bands: null,
    raw: {},
  };
  return { cell, derivedCellIndexOffset: 1 };
}

function info(streamIndex: number, elapsedUs: number, cellIdentity: number, earfcn: number): TimedLteServingCellInfo {
  return { streamIndex, elapsedUs, cellIdentity, earfcn, pci: 1, mcc: "999", mnc: "99" };
}

function resolvedSubId(resolver: ReturnType<typeof createNrNonStandaloneAnchorResolver>, streamIndex: number, elapsedUs: number): number | null {
  return resolver(streamIndex, elapsedUs)?.[0]?.cell.subId ?? null;
}

void test("uses the nearest stream vote when the modem mapping changes during a log", () => {
  const anchors = [
    anchor(0, 10, 0, 1_000_000, 100, 1000),
    anchor(0, 10, 1, 4_000_000, 100, 1000),
    anchor(1, 20, 2, 6_000_000, 200, 2000),
    anchor(1, 20, 3, 9_000_000, 200, 2000),
  ];
  const resolver = createNrNonStandaloneAnchorResolver(anchors, [info(7, 1_100_000, 100, 1000), info(7, 8_900_000, 200, 2000)], []);

  assert.equal(resolvedSubId(resolver, 7, 2_000_000), 10);
  assert.equal(resolvedSubId(resolver, 7, 8_000_000), 20);
});

void test("ignores PLMN while requiring a unique ECI and compatible EARFCN vote", () => {
  const anchors = [anchor(0, 10, 0, 1_000_000, 100, 1000), anchor(1, 20, 1, 1_000_000, 200, 2000)];
  const unique = createNrNonStandaloneAnchorResolver(anchors, [info(0, 1_000_000, 100, 1000)], []);
  const wrongEarfcn = createNrNonStandaloneAnchorResolver(anchors, [info(0, 1_000_000, 100, 1001)], []);
  const ambiguousAnchors = [...anchors, anchor(1, 20, 2, 1_100_000, 100, 1000)];
  const ambiguous = createNrNonStandaloneAnchorResolver(ambiguousAnchors, [info(0, 1_000_000, 100, 1000)], []);

  assert.equal(resolvedSubId(unique, 0, 1_000_000), 10);
  assert.equal(resolvedSubId(wrongEarfcn, 0, 1_000_000), null);
  assert.equal(resolvedSubId(ambiguous, 0, 1_000_000), null);
});

void test("uses the active default-data subscription and then the sole-subscription fallback", () => {
  const first = anchor(0, 10, 0, 1_000_000, 100, 1000);
  const second = anchor(1, 20, 1, 1_000_000, 200, 2000);
  const dualSim = createNrNonStandaloneAnchorResolver(
    [first, second],
    [],
    [
      { elapsedUs: 500_000, subId: 10 },
      { elapsedUs: 5_000_000, subId: 20 },
    ],
  );
  const singleSim = createNrNonStandaloneAnchorResolver([first], [], []);

  assert.equal(resolvedSubId(dualSim, 0, 100_000), null);
  assert.equal(resolvedSubId(dualSim, 0, 1_000_000), 10);
  assert.equal(resolvedSubId(dualSim, 0, 6_000_000), 20);
  assert.equal(resolvedSubId(singleSim, 0, 1_000_000), 10);
});

void test("does not create a stream vote from serving-cell evidence outside the matching window", () => {
  const anchors = [anchor(0, 10, 0, 0, 100, 1000), anchor(1, 20, 1, 0, 200, 2000)];
  const resolver = createNrNonStandaloneAnchorResolver(anchors, [info(0, 15_000_001, 100, 1000)], []);

  assert.equal(resolvedSubId(resolver, 0, 15_000_001), null);
});
