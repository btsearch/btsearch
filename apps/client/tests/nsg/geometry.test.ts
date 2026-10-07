import assert from "node:assert/strict";
import test from "node:test";

import { ROUTE_MAX_GAP_MS, createRouteGeometry, findClosestRoutePoint } from "../../src/features/nsg-explorer/map/routeGeometry";
import { SIGNAL_UNKNOWN_COLOR, type SignalPoint } from "../../src/features/nsg-explorer/map/signalTrail";
import { isValidLatLng } from "../../src/lib/nsg-parser";

function point(offsetMs: number, longitude: number, latitude: number, provider = "gps"): SignalPoint {
  return {
    location: {
      eventIndex: offsetMs,
      elapsedUs: offsetMs * 1000,
      timestampUs: String(offsetMs * 1000),
      timestampMs: offsetMs,
      fixTimestampMs: offsetMs,
      latitude,
      longitude,
      provider,
      accuracy: null,
      altitude: null,
      speed: null,
    },
    dbm: -90,
    color: "#84cc16",
    status: "available",
    ageMs: 0,
    measurement: null,
    timestampMs: offsetMs,
    timeBasis: "fix",
  };
}

void test("validates finite latitude and longitude bounds inclusively", () => {
  assert.equal(isValidLatLng(90, 180), true);
  assert.equal(isValidLatLng(-90, -180), true);
  for (const [latitude, longitude] of [
    [91, 0],
    [0, -181],
    [Number.NaN, 0],
    [0, Infinity],
  ])
    assert.equal(isValidLatLng(latitude, longitude), false);
});

void test("preserves road corners and repeated positions inside a continuous color run", () => {
  const positions = [
    [16, 54],
    [16.001, 54],
    [16.001, 54.001],
    [16.001, 54.001],
    [16.002, 54.001],
  ];
  const points = positions.map(([longitude, latitude], index) => point(index * 1000, longitude, latitude));
  const original = structuredClone(points);
  const result = createRouteGeometry(points);
  assert.equal(result.features.length, 1);
  assert.deepEqual(result.features[0].geometry.coordinates, positions);
  assert.deepEqual(points, original);
});

void test("retains thirty-second fused cadence and the inclusive sixty-second boundary", () => {
  const points = [point(0, 0, 0, "fused"), point(30_000, 1, 0, "fused"), point(90_000, 1, 1, "fused")];
  const result = createRouteGeometry(points);
  assert.deepEqual(
    result.features.map((feature) => feature.geometry.coordinates),
    [
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    ],
  );
});

void test("a long gap splits equal-colored runs instead of creating a shortcut", () => {
  const afterGap = 30_000 + ROUTE_MAX_GAP_MS + 1;
  const result = createRouteGeometry([point(0, 0, 0), point(30_000, 1, 0), point(afterGap, 20, 20), point(afterGap + 30_000, 21, 20)]);
  assert.deepEqual(
    result.features.map((feature) => feature.geometry.coordinates),
    [
      [
        [0, 0],
        [1, 0],
      ],
      [
        [20, 20],
        [21, 20],
      ],
    ],
  );
});

void test("network fallback stays visible but is disconnected from precise providers", () => {
  const result = createRouteGeometry([
    point(0, 0, 0),
    point(1000, 1, 0),
    point(2000, 20, 20, "network"),
    point(3000, 21, 20, "network"),
    point(4000, 2, 0, "fused"),
    point(5000, 3, 0, "fused"),
  ]);
  assert.deepEqual(
    result.features.map((feature) => feature.geometry.coordinates),
    [
      [
        [0, 0],
        [1, 0],
      ],
      [
        [20, 20],
        [21, 20],
      ],
      [
        [2, 0],
        [3, 0],
      ],
    ],
  );
});

void test("gps and fused handoffs keep valid consecutive geometry", () => {
  const result = createRouteGeometry([point(0, 0, 0, "GPS"), point(1000, 1, 0, "fused"), point(2000, 2, 0)]);
  assert.deepEqual(
    result.features.map((feature) => feature.geometry.coordinates),
    [
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
    ],
  );
});

void test("unknown signal leaves geometry intact and colors both touching edges neutral", () => {
  const missing = { ...point(1000, 1, 0), status: "missing" as const, dbm: null, color: SIGNAL_UNKNOWN_COLOR };
  const result = createRouteGeometry([point(0, 0, 0), missing, point(2000, 2, 0)]);
  assert.equal(result.features[0].properties.color, SIGNAL_UNKNOWN_COLOR);
  assert.deepEqual(result.features[0].geometry.coordinates, [
    [0, 0],
    [1, 0],
    [2, 0],
  ]);
});

void test("invalid locations or times never leak into geometry or bridge their neighbors", () => {
  const invalidPoints = [
    point(2000, Number.NaN, 0),
    point(2000, 0, Infinity),
    point(2000, 181, 0),
    point(2000, 0, -91),
    { ...point(2000, 20, 20), timestampMs: null },
    { ...point(2000, 20, 20), timestampMs: Infinity },
  ];
  for (const invalid of invalidPoints) {
    const result = createRouteGeometry([point(0, 0, 0), point(1000, 1, 0), invalid, point(3000, 2, 0), point(4000, 3, 0)]);
    assert.deepEqual(
      result.features.map((feature) => feature.geometry.coordinates),
      [
        [
          [0, 0],
          [1, 0],
        ],
        [
          [2, 0],
          [3, 0],
        ],
      ],
    );
  }
});

void test("regressing or simultaneous fix times do not form a connecting edge", () => {
  for (const offsetMs of [500, 1000]) {
    const result = createRouteGeometry([point(0, 0, 0), point(1000, 1, 0), point(offsetMs, 20, 20), point(2000, 21, 20)]);
    assert.deepEqual(
      result.features.map((feature) => feature.geometry.coordinates),
      [
        [
          [0, 0],
          [1, 0],
        ],
        [
          [20, 20],
          [21, 20],
        ],
      ],
    );
  }
});

void test("empty and single-position recordings produce no line", () => {
  assert.deepEqual(createRouteGeometry([]).features, []);
  assert.deepEqual(createRouteGeometry([point(0, 0, 0)]).features, []);
});

void test("selects the nearest route segment when enlarged hitboxes overlap parallel traces", () => {
  const secondTraceTimestamp = 1000 + ROUTE_MAX_GAP_MS + 1;
  const points = [point(0, 0, 0), point(1000, 100, 0), point(secondTraceTimestamp, 49, 8), point(secondTraceTimestamp + 1000, 51, 8)];
  const project = ({ longitude, latitude }: SignalPoint["location"]) => ({ x: longitude, y: latitude });

  assert.equal(findClosestRoutePoint(points, { x: 50, y: 1 }, project), points[0]);
  assert.equal(findClosestRoutePoint(points, { x: 50, y: 7 }, project), points[2]);
});

void test("route selection does not bridge recording gaps", () => {
  const secondTraceTimestamp = 1000 + ROUTE_MAX_GAP_MS + 1;
  const points = [point(0, 0, 0), point(1000, 0, 10), point(secondTraceTimestamp, 10, 0), point(secondTraceTimestamp + 1000, 10, 10)];
  const project = ({ longitude, latitude }: SignalPoint["location"]) => ({ x: longitude, y: latitude });

  assert.equal(findClosestRoutePoint(points, { x: 5, y: 5 }, project), points[0]);
});

void test("route selection ignores non-finite screen projections", () => {
  const points = [point(0, 0, 0), point(1000, 1, 0), point(2000, 2, 0), point(3000, 3, 0)];
  const project = ({ longitude, latitude }: SignalPoint["location"]) =>
    longitude < 2 ? { x: Infinity, y: latitude } : { x: longitude, y: latitude };

  assert.equal(findClosestRoutePoint(points, { x: 2.5, y: 0 }, project), points[2]);
  assert.equal(findClosestRoutePoint(points, { x: Number.NaN, y: 0 }, project), null);
});
