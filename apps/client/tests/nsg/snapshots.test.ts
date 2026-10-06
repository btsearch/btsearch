import assert from "node:assert/strict";
import test from "node:test";

import { createSnapshotCollection, findNearestSnapshotIndex, getPrimaryCell } from "../../src/features/nsg-explorer/cells/snapshots";
import type { NsgCell } from "../../src/lib/nsg-parser/model";

function cell(eventIndex: number, timestampMs: number, registered: boolean | null = null): NsgCell {
  return {
    eventIndex,
    timestampMs,
    registered,
    cellIndex: 0,
    recordOffset: 0,
    elapsedUs: timestampMs * 1000,
    timestampUs: String(timestampMs * 1000),
    rat: "LTE",
    nrMode: null,
    sources: ["android-telephony"],
    subId: null,
    slotId: null,
    isDefaultSubscription: null,
    mcc: null,
    mnc: null,
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
    dbm: null,
    rssi: null,
    rsrp: null,
    rsrq: null,
    sinr: null,
    ecno: null,
    ta: null,
    ber: null,
    bands: null,
    raw: {},
  };
}

void test("groups and indexes snapshots in chronological order", () => {
  const first = cell(4, 1000);
  const serving = cell(8, 2000, true);
  const neighbor = cell(8, 2000, false);
  const collection = createSnapshotCollection([serving, first, neighbor]);

  assert.deepEqual(
    collection.snapshots.map((snapshot) => snapshot.eventIndex),
    [4, 8],
  );
  assert.equal(collection.indexByEvent.get(4), 0);
  assert.equal(collection.indexByEvent.get(8), 1);
  assert.strictEqual(getPrimaryCell(collection.snapshots[1].cells), serving);
});

void test("prefers the NR primary while retaining its LTE secondary in one snapshot", () => {
  const lte = { ...cell(8, 2000, true), measurementRole: "lte-secondary" as const };
  const nr: NsgCell = {
    ...cell(8, 2000, null),
    cellIndex: 1,
    rat: "NR",
    measurementRole: "nr-primary",
    pci: 947,
    arfcn: 649920,
    rsrp: -110.8671875,
    raw: { diagTimestampUs: "1999000" },
  };
  const { snapshots } = createSnapshotCollection([lte, nr]);
  const nrSnapshots = createSnapshotCollection([nr]).snapshots;

  assert.equal(snapshots.length, 1);
  assert.deepEqual(snapshots[0].cells, [lte, nr]);
  assert.equal(snapshots[0].timestampMs, nrSnapshots[0].timestampMs);
  assert.strictEqual(getPrimaryCell(snapshots[0].cells), nr);
});

void test("finds the nearest snapshot and resolves a tie toward the earlier sample", () => {
  const { snapshots } = createSnapshotCollection([cell(1, 1000), cell(2, 2000), cell(3, 4000)]);

  assert.equal(findNearestSnapshotIndex(snapshots, null), 0);
  assert.equal(findNearestSnapshotIndex(snapshots, 500), 0);
  assert.equal(findNearestSnapshotIndex(snapshots, 1500), 0);
  assert.equal(findNearestSnapshotIndex(snapshots, 3600), 2);
  assert.equal(findNearestSnapshotIndex(snapshots, 5000), 2);
});
