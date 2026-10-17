import assert from "node:assert/strict";
import test from "node:test";

import { planStationNames, siteNamesByOperator } from "../sources/uke/device-registry/stationNames.ts";

type ExtraIdentifierRow = Parameters<typeof planStationNames>[2][number];

const STORED_AT = new Date("2026-09-18T10:00:00.000Z");
const STATION = { id: 100, station_id: "BT12345" };
const NAME_OF_50 = "N".repeat(50);
const NAME_OF_51 = "N".repeat(51);

function storedRow(id: number, stationId: number, mnoName: string | null, networksId: number | null = null): ExtraIdentifierRow {
  return { id, station_id: stationId, networks_id: networksId, networks_name: null, mno_name: mnoName, createdAt: STORED_AT, updatedAt: STORED_AT };
}

function planFor(name: string, existingRows: readonly ExtraIdentifierRow[]): ReturnType<typeof planStationNames> {
  return planStationNames(new Map([[STATION.station_id, name]]), [STATION], existingRows);
}

void test("a station without a stored row gets one", () => {
  assert.deepEqual(planFor("WARSZAWA CENTRUM", []), { inserts: [{ station_id: 100, mno_name: "WARSZAWA CENTRUM" }], updates: [], skippedCount: 0 });
});

void test("a station whose stored name is the published one is left alone", () => {
  assert.deepEqual(planFor("WARSZAWA CENTRUM", [storedRow(7, 100, "WARSZAWA CENTRUM")]), { inserts: [], updates: [], skippedCount: 0 });
});

void test("another stored name, a differently spelled one and a missing one are replaced", () => {
  for (const storedName of ["WARSZAWA WOLA", "Warszawa Centrum", "WARSZAWA CENTRUM ", "", null]) {
    const row = storedRow(7, 100, storedName, 44021);
    const plan = planFor("WARSZAWA CENTRUM", [row]);

    assert.deepEqual(plan, { inserts: [], updates: [{ row, mnoName: "WARSZAWA CENTRUM" }], skippedCount: 0 }, String(storedName));
  }
});

void test("of several rows of one station only the last one read counts", () => {
  const first = storedRow(7, 100, "WARSZAWA WOLA", 44021);
  const last = storedRow(8, 100, "WARSZAWA CENTRUM", 44022);

  assert.deepEqual(planFor("WARSZAWA CENTRUM", [first, last]), { inserts: [], updates: [], skippedCount: 0 });
  assert.deepEqual(planFor("WARSZAWA CENTRUM", [last, first]).updates, [{ row: first, mnoName: "WARSZAWA CENTRUM" }]);
});

void test("a name longer than the column is skipped and counted, whatever is stored", () => {
  assert.deepEqual(planFor(NAME_OF_50, []), { inserts: [{ station_id: 100, mno_name: NAME_OF_50 }], updates: [], skippedCount: 0 });
  assert.deepEqual(planFor(NAME_OF_51, []), { inserts: [], updates: [], skippedCount: 1 });
  assert.deepEqual(planFor(NAME_OF_51, [storedRow(7, 100, "WARSZAWA WOLA")]), { inserts: [], updates: [], skippedCount: 1 });
  assert.deepEqual(planFor("Ż".repeat(50), []), { inserts: [{ station_id: 100, mno_name: "Ż".repeat(50) }], updates: [], skippedCount: 0 });
});

void test("plans every station of one operator in the order they were found", () => {
  const names = new Map([
    ["BT1", "JEDEN"],
    ["BT2", "DWA"],
    ["BT3", NAME_OF_51],
    ["BT4", "CZTERY"],
    ["BT5", "PIĘĆ"],
    ["BT9", "NOT OURS"],
  ]);
  const stations = [
    { id: 15, station_id: "BT5" },
    { id: 14, station_id: "BT4" },
    { id: 13, station_id: "BT3" },
    { id: 12, station_id: "BT2" },
    { id: 11, station_id: "BT1" },
    { id: 10, station_id: "BT0" },
  ];
  const renamed = storedRow(70, 14, "CZTERY STARE");
  const rows = [storedRow(71, 12, "DWA"), renamed, storedRow(72, 99, "SOMEONE ELSE")];

  assert.deepEqual(planStationNames(names, stations, rows), {
    inserts: [
      { station_id: 15, mno_name: "PIĘĆ" },
      { station_id: 11, mno_name: "JEDEN" },
    ],
    updates: [{ row: renamed, mnoName: "CZTERY" }],
    skippedCount: 1,
  });
});

void test("nothing published, or no station of ours, plans nothing", () => {
  assert.deepEqual(planStationNames(new Map(), [STATION], [storedRow(7, 100, "WARSZAWA WOLA")]), { inserts: [], updates: [], skippedCount: 0 });
  assert.deepEqual(planStationNames(new Map([["BT12345", "WARSZAWA CENTRUM"]]), [], []), { inserts: [], updates: [], skippedCount: 0 });
});

void test("two operators in one call keep their own names for the same site code", () => {
  const byOperator = siteNamesByOperator([
    { operatorId: 3, siteId: "BT12345", name: "WARSZAWA CENTRUM" },
    { operatorId: 7, siteId: "BT12345", name: "WAW_CENTRUM" },
    { operatorId: 3, siteId: "BT20000", name: "KRAKÓW RYNEK" },
    { operatorId: 7, siteId: "KR0044", name: "WAW_WOLA" },
  ]);

  assert.deepEqual(
    [...byOperator].map(([operatorId, names]) => [operatorId, Object.fromEntries(names)]),
    [
      [3, { BT12345: "WARSZAWA CENTRUM", BT20000: "KRAKÓW RYNEK" }],
      [7, { BT12345: "WAW_CENTRUM", KR0044: "WAW_WOLA" }],
    ],
  );

  const stored = storedRow(7, 100, "WARSZAWA CENTRUM");
  const plans = [...byOperator.values()].map((names) => planStationNames(names, [STATION], [stored]));
  assert.deepEqual(plans, [
    { inserts: [], updates: [], skippedCount: 0 },
    { inserts: [], updates: [{ row: stored, mnoName: "WAW_CENTRUM" }], skippedCount: 0 },
  ]);
  assert.deepEqual([...siteNamesByOperator([])], []);
});
