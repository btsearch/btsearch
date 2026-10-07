import assert from "node:assert/strict";
import test from "node:test";

import {
  findClosestRouteLocation,
  getLocationTimeMs,
  getLocationTimeUs,
  prepareRouteLocations,
} from "../../src/features/nsg-explorer/map/routeLocations";
import type { NsgLocation } from "../../src/lib/nsg-parser/model";

const EPOCH_MS = 1_700_000_000_000;

function location(id: number, fixMs: number, provider: string, overrides: Partial<NsgLocation> = {}): NsgLocation {
  return {
    eventIndex: id,
    elapsedUs: fixMs * 1000,
    timestampMs: EPOCH_MS + fixMs,
    timestampUs: String(BigInt(EPOCH_MS + fixMs) * 1000n),
    fixTimestampMs: EPOCH_MS + fixMs,
    latitude: 52 + fixMs / 100_000_000,
    longitude: 21,
    provider,
    accuracy: provider === "network" ? 300 : 4,
    altitude: null,
    speed: null,
    ...overrides,
  };
}

void test("removes coarse network triangle spurs while preserving original precise fixes", () => {
  const before = location(1, 1000, "gps");
  const fused = location(2, 1950, "fused", { timestampMs: EPOCH_MS + 2000 });
  const network = location(3, 1600, "network", { latitude: 51.95, longitude: 20.86, timestampMs: EPOCH_MS + 2200 });
  const after = location(4, 2000, "gps", { timestampMs: EPOCH_MS + 2300 });
  const recorded = [before, fused, network, after];
  const canonical = prepareRouteLocations(recorded);
  assert.deepEqual(canonical, [before, after]);
  assert.strictEqual(canonical[0], before);
  assert.strictEqual(canonical[1], after);
  assert.equal(recorded.length, 4);
  assert.equal(recorded[2].longitude, 20.86);
});

void test("orders and selects by physical fix time instead of out-of-order delivery times", () => {
  const earlier = location(2, 1000, "gps", { timestampMs: EPOCH_MS + 9000 });
  const later = location(1, 5000, "gps", { timestampMs: EPOCH_MS + 5100 });
  const canonical = prepareRouteLocations([later, earlier]);
  assert.deepEqual(canonical, [earlier, later]);
  assert.strictEqual(findClosestRouteLocation(canonical, EPOCH_MS + 1500), earlier);
  assert.strictEqual(findClosestRouteLocation(canonical, EPOCH_MS + 4500), later);
  assert.strictEqual(findClosestRouteLocation(canonical, EPOCH_MS + 3000), earlier);
});

void test("keeps later fused history and uses coarse fallback only when no nearby precise provider exists", () => {
  const gps = location(1, 0, "gps");
  const fused = location(2, 31_000, "fused");
  const redundantNetwork = location(3, 45_000, "network");
  const coarseFallback = location(4, 80_000, "network");
  const laterFused = location(5, 120_000, "fused");
  assert.deepEqual(prepareRouteLocations([gps, fused, redundantNetwork, coarseFallback, laterFused]), [gps, fused, coarseFallback, laterFused]);
  assert.deepEqual(prepareRouteLocations([coarseFallback]), [coarseFallback]);
  assert.deepEqual(prepareRouteLocations([fused, laterFused]), [fused, laterFused]);
});

void test("deduplicates repeated physical fixes using provider and reported accuracy", () => {
  const fused = location(1, 1000, "fused");
  const inaccurateGps = location(2, 1000, "gps", { accuracy: 20 });
  const preciseGps = location(3, 1000, "gps", { accuracy: 3 });
  const repeat = location(4, 1000, "gps", { accuracy: 3 });
  assert.deepEqual(prepareRouteLocations([fused, inaccurateGps, preciseGps, repeat]), [preciseGps]);
});

void test("retains stationary observations at distinct times for history and signal changes", () => {
  const earlier = location(1, 1000, "gps", { latitude: 52, longitude: 21 });
  const later = location(2, 2000, "gps", { latitude: 52, longitude: 21 });
  assert.deepEqual(prepareRouteLocations([earlier, later]), [earlier, later]);
});

void test("rounds epoch conversion noise without discarding valid GPS timestamps", () => {
  const noisy = location(1, 1234, "fused", { fixTimestampMs: EPOCH_MS + 1234 + 0.000244140625 });
  assert.equal(Number.isSafeInteger(noisy.fixTimestampMs! * 1000), false);
  assert.equal(getLocationTimeUs(noisy), BigInt(EPOCH_MS + 1234) * 1000n);
  assert.equal(getLocationTimeMs(noisy), EPOCH_MS + 1234);
  assert.deepEqual(prepareRouteLocations([noisy]), [noisy]);
});

void test("preserves frame-time fallback and excludes invalid coordinates or timestamps", () => {
  const fallback = location(1, 1000, "gps", { fixTimestampMs: null });
  const invalidTime = location(2, 2000, "gps", { fixTimestampMs: Infinity });
  const invalidCoordinates = location(3, 3000, "gps", { latitude: 91 });
  assert.equal(getLocationTimeMs(fallback), EPOCH_MS + 1000);
  assert.deepEqual(prepareRouteLocations([invalidTime, fallback, invalidCoordinates]), [fallback]);
  assert.equal(findClosestRouteLocation([], EPOCH_MS), null);
});
