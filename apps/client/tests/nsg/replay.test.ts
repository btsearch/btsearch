import assert from "node:assert/strict";
import test from "node:test";

import { advanceReplayClock, findReplayLocationIndex } from "../../src/features/nsg-explorer/replay/replayClock";
import type { NsgLocation } from "../../src/lib/nsg-parser/model";

function snapshots(...timestamps: number[]) {
  return timestamps.map((timestampMs) => ({ timestampMs }));
}

void test("advances continuously at five times actual elapsed wall time across irregular frames", () => {
  const history = snapshots(0, 100, 250, 500, 1000, 1500);
  const elapsedFrames = [16, 19, 9, 83, 120];
  const expectedIndices = [0, 1, 1, 3, 4];
  let playheadMs = 0;
  let wallElapsedMs = 0;
  elapsedFrames.forEach((elapsedMs, frameIndex) => {
    wallElapsedMs += elapsedMs;
    const frame = advanceReplayClock(history, playheadMs, elapsedMs);
    assert.equal(frame.playheadMs, wallElapsedMs * 5);
    assert.equal(frame.index, expectedIndices[frameIndex]);
    assert.equal(frame.finished, false);
    playheadMs = frame.playheadMs;
  });
  assert.equal(playheadMs, 1235);
  assert.deepEqual(advanceReplayClock(history, playheadMs, 53), { index: 5, playheadMs: 1500, finished: true });
});

void test("retains an advancing clock through sparse gaps without jumping ahead or becoming stuck", () => {
  const history = snapshots(0, 60000);
  let playheadMs = 0;
  let wallElapsedMs = 0;
  for (const elapsedMs of [17, 83, 150, 750, 1000, 10000]) {
    wallElapsedMs += elapsedMs;
    const frame = advanceReplayClock(history, playheadMs, elapsedMs);
    assert.equal(frame.playheadMs, wallElapsedMs * 5);
    assert.equal(frame.index, wallElapsedMs === 12000 ? 1 : 0);
    assert.equal(frame.finished, wallElapsedMs === 12000);
    playheadMs = frame.playheadMs;
  }
});

void test("uses the last measurement at duplicate timestamps and reaches the final sample", () => {
  const history = snapshots(0, 5000, 5000, 10000, 10000);
  assert.deepEqual(advanceReplayClock(history, 0, 1000), { index: 2, playheadMs: 5000, finished: false });
  assert.deepEqual(advanceReplayClock(history, 5000, 2000), { index: 4, playheadMs: 10000, finished: true });
  assert.deepEqual(advanceReplayClock(history, 10000, 16), { index: 4, playheadMs: 10000, finished: true });
});

void test("resumes from a saved playhead and can restart from a newly selected filtered sample", () => {
  const history = snapshots(1000, 9000, 15000, 30000);
  const paused = advanceReplayClock(history, 1000, 1234.5);
  assert.deepEqual(paused, { index: 0, playheadMs: 7172.5, finished: false });
  assert.deepEqual(advanceReplayClock(history, paused.playheadMs, 0), paused);
  assert.deepEqual(advanceReplayClock(history, paused.playheadMs, 16.25), { index: 0, playheadMs: 7253.75, finished: false });
  assert.deepEqual(advanceReplayClock(snapshots(9000, 30000), 9000, 16), { index: 0, playheadMs: 9080, finished: false });
  assert.deepEqual(advanceReplayClock(history, 1000, 16), { index: 0, playheadMs: 1080, finished: false });
});

void test("finishes empty and single-sample histories without an invalid selection", () => {
  assert.deepEqual(advanceReplayClock([], 123, 16), { index: -1, playheadMs: 123, finished: true });
  assert.deepEqual(advanceReplayClock(snapshots(0), 0, 16), { index: 0, playheadMs: 0, finished: true });
});

void test("invalid or negative elapsed time cannot reverse or poison the playback clock", () => {
  const history = snapshots(0, 100, 250, 500);
  for (const elapsedMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
    assert.deepEqual(advanceReplayClock(history, 125, elapsedMs), { index: 1, playheadMs: 125, finished: false });
});

void test("selects the latest physical GPS fix without showing future route data during replay", () => {
  const locations: NsgLocation[] = [0, 6000].map((fixTimestampMs, eventIndex) => ({
    elapsedUs: 10_000_000 + eventIndex,
    timestampUs: "10000000",
    timestampMs: 10000,
    eventIndex,
    latitude: 52,
    longitude: 20 + eventIndex / 100,
    accuracy: 3,
    altitude: null,
    speed: null,
    provider: "gps",
    fixTimestampMs,
  }));
  assert.equal(findReplayLocationIndex(locations, -1), -1);
  assert.equal(findReplayLocationIndex(locations, 0), 0);
  assert.equal(findReplayLocationIndex(locations, 5000), 0);
  assert.equal(findReplayLocationIndex(locations, 6000), 1);
  assert.equal(findReplayLocationIndex(locations, 10000), 1);
  assert.equal(findReplayLocationIndex([], 5000), -1);
  assert.equal(findReplayLocationIndex(locations, Number.NaN), -1);
});
