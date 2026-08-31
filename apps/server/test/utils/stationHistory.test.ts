import assert from "node:assert/strict";
import test from "node:test";

import { transformAuditRow } from "../../src/utils/stationHistory.js";
import type { StationHistoryLookups } from "../../src/utils/stationHistory.js";

type AuditRow = Parameters<typeof transformAuditRow>[0];

const lookups = {
  bands: new Map(),
  operators: new Map(),
  regions: new Map(),
  locations: new Map(),
  sectorAzimuths: new Map(),
} satisfies StationHistoryLookups;

function photoHistoryRow(oldValues: unknown, newValues: unknown): AuditRow {
  return {
    id: 1,
    action: "stations.update",
    table_name: "station_photo_selections",
    record_id: 10,
    old_values: oldValues,
    new_values: newValues,
    metadata: null,
    source: null,
    ip_address: null,
    user_agent: null,
    invoked_by: null,
    createdAt: new Date("2026-08-31T12:00:00Z"),
  };
}

void test("ignores reordered photo selections when membership and primary photo are unchanged", () => {
  const result = transformAuditRow(
    photoHistoryRow(
      [
        { location_photo_id: 101, is_main: true },
        { location_photo_id: 102, is_main: false },
      ],
      [
        { location_photo_id: 102, is_main: false },
        { location_photo_id: 101, is_main: true },
      ],
    ),
    lookups,
  );

  assert.equal(result, null);
});

void test("records a primary-only photo change", () => {
  const result = transformAuditRow(
    photoHistoryRow(
      [
        { location_photo_id: 101, is_main: true },
        { location_photo_id: 102, is_main: false },
      ],
      [
        { location_photo_id: 101, is_main: false },
        { location_photo_id: 102, is_main: true },
      ],
    ),
    lookups,
  );

  assert.equal(result?.kind, "photos");
  assert.equal(result?.action, "update");
  assert.deepEqual(result?.changes, [{ field: "main_photo", from: "#101", to: "#102" }]);
});

void test("records primary-photo boundary transitions", () => {
  const setPrimary = transformAuditRow(photoHistoryRow([{ location_photo_id: 101 }], [{ location_photo_id: 101, is_main: true }]), lookups);
  const clearPrimary = transformAuditRow(
    photoHistoryRow([{ location_photo_id: 101, is_main: true }], [{ location_photo_id: 101, is_main: false }]),
    lookups,
  );

  assert.deepEqual(setPrimary?.changes, [{ field: "main_photo", from: null, to: "#101" }]);
  assert.deepEqual(clearPrimary?.changes, [{ field: "main_photo", from: "#101", to: null }]);
});

void test("keeps membership and primary transitions in the same addition event", () => {
  const result = transformAuditRow(
    photoHistoryRow(
      [{ location_photo_id: 101, is_main: true }],
      [
        { location_photo_id: 102, is_main: true },
        { location_photo_id: 101, is_main: false },
      ],
    ),
    lookups,
  );

  assert.equal(result?.action, "create");
  assert.deepEqual(result?.changes, [
    { field: "photo", from: null, to: "#102" },
    { field: "main_photo", from: "#101", to: "#102" },
  ]);
});

void test("keeps membership and primary transitions in the same deletion event", () => {
  const result = transformAuditRow(
    photoHistoryRow(
      [
        { location_photo_id: 102, is_main: true },
        { location_photo_id: 101, is_main: false },
      ],
      [{ location_photo_id: 101, is_main: true }],
    ),
    lookups,
  );

  assert.equal(result?.action, "delete");
  assert.deepEqual(result?.changes, [
    { field: "photo", from: "#102", to: null },
    { field: "main_photo", from: "#102", to: "#101" },
  ]);
});

void test("sorts photo membership changes and accepts missing primary flags", () => {
  const result = transformAuditRow(
    photoHistoryRow(
      [{ location_photo_id: 20 }, { location_photo_id: 10, is_main: "invalid" }],
      [{ location_photo_id: 40 }, { location_photo_id: 30 }],
    ),
    lookups,
  );

  assert.deepEqual(result?.changes, [
    { field: "photo", from: "#10", to: null },
    { field: "photo", from: "#20", to: null },
    { field: "photo", from: null, to: "#30" },
    { field: "photo", from: null, to: "#40" },
  ]);
});
