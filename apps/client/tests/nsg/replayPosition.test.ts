import assert from "node:assert/strict";
import test from "node:test";

import { getReplayPosition } from "../../src/features/nsg-explorer/map/replayPosition";
import { ROUTE_MAX_GAP_MS } from "../../src/features/nsg-explorer/map/routeGeometry";
import type { NsgLocation } from "../../src/lib/nsg-parser/model";

function location(fixTimestampMs: number, longitude: number, latitude: number, provider = "gps"): NsgLocation {
  return {
    eventIndex: fixTimestampMs,
    elapsedUs: fixTimestampMs * 1000,
    timestampUs: String((fixTimestampMs + 90000) * 1000),
    timestampMs: fixTimestampMs + 90000,
    fixTimestampMs,
    latitude,
    longitude,
    provider,
    accuracy: 4,
    speed: 10,
    altitude: 100,
  };
}

void test("interpolates continuous one-second GPS fixes at the physical-time midpoint without changing telemetry", () => {
  const positions = [location(1000, 16, 54), location(2000, 16.002, 54.002)];
  const original = structuredClone(positions);
  const result = getReplayPosition(positions, 1500);
  assert.ok(result);
  assert.ok(Math.abs(result.longitude - 16.001) < 1e-12);
  assert.ok(Math.abs(result.latitude - 54.001) < 1e-12);
  assert.strictEqual(result?.location, positions[0]);
  assert.deepEqual(positions, original);
  assert.equal(result?.location.speed, 10);
  assert.equal(result?.location.timestampMs, 91000);
});

void test("follows irregular and thirty-second fused fixes without inventing speed or following delivery timestamps", () => {
  const positions = [location(0, 0, 0, "fused"), location(30000, 3, 6, "fused"), location(31000, 4, 8, "gps")];
  assert.deepEqual(getReplayPosition(positions, 7500), { longitude: 0.75, latitude: 1.5, location: positions[0] });
  assert.deepEqual(getReplayPosition(positions, 30500), { longitude: 3.5, latitude: 7, location: positions[1] });
});

void test("returns no future position before the first fix and clamps at exact and final boundaries", () => {
  const positions = [location(1000, 1, 2), location(2000, 3, 4)];
  assert.equal(getReplayPosition([], 1500), null);
  assert.equal(getReplayPosition(positions, 999), null);
  assert.equal(getReplayPosition(positions, Number.NaN), null);
  assert.deepEqual(getReplayPosition(positions, 1000), { longitude: 1, latitude: 2, location: positions[0] });
  assert.deepEqual(getReplayPosition(positions, 2000), { longitude: 3, latitude: 4, location: positions[1] });
  assert.deepEqual(getReplayPosition(positions, 9000), { longitude: 3, latitude: 4, location: positions[1] });
});

void test("holds the preceding fix across the same gap and provider breaks used by route geometry", () => {
  const cases = [
    [location(0, 1, 2), location(ROUTE_MAX_GAP_MS + 1, 20, 30)],
    [location(0, 1, 2, "gps"), location(1000, 20, 30, "network")],
    [location(0, 1, 2, "NETWORK"), location(1000, 20, 30, "fused")],
  ];
  for (const positions of cases) {
    assert.deepEqual(getReplayPosition(positions, 500), { longitude: 1, latitude: 2, location: positions[0] });
    assert.deepEqual(getReplayPosition(positions, positions[1].fixTimestampMs!), { longitude: 20, latitude: 30, location: positions[1] });
  }
  const boundary = [location(0, 0, 0), location(ROUTE_MAX_GAP_MS, 6, 12)];
  assert.deepEqual(getReplayPosition(boundary, 30000), { longitude: 3, latitude: 6, location: boundary[0] });
});

void test("uses the last duplicate at its exact time and leaves stationary fixes stationary", () => {
  const positions = [location(0, 0, 0), location(1000, 1, 2), location(1000, 3, 4), location(2000, 3, 4)];
  assert.deepEqual(getReplayPosition(positions, 1000), { longitude: 3, latitude: 4, location: positions[2] });
  assert.deepEqual(getReplayPosition(positions, 1500), { longitude: 3, latitude: 4, location: positions[2] });
});

void test("never interpolates through invalid coordinates or invalid physical fix times", () => {
  const positions = [location(0, 1, 2), location(1000, Number.NaN, 30), location(2000, 20, 30)];
  assert.deepEqual(getReplayPosition(positions, 500), { longitude: 1, latitude: 2, location: positions[0] });
  assert.equal(getReplayPosition(positions, 1500), null);
  assert.equal(getReplayPosition([location(Number.NaN, 1, 2)], 500), null);
});
