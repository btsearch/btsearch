import assert from "node:assert/strict";
import test from "node:test";

import { formatDecibelValue, formatTimeWithMilliseconds } from "../../src/components/nsg/display";

void test("formats recorded decibel values with exactly one fractional digit", () => {
  assert.equal(formatDecibelValue(-69.3125), "-69.3");
  assert.equal(formatDecibelValue(-10.421875), "-10.4");
  assert.equal(formatDecibelValue(-70), "-70.0");
  assert.equal(formatDecibelValue(0), "0.0");
  assert.equal(formatDecibelValue(null), "-");
  assert.equal(formatDecibelValue(Number.POSITIVE_INFINITY), "-");
  assert.equal(formatDecibelValue(2_147_483_647), "-");
});

void test("formats signaling milliseconds with a technical decimal point", () => {
  const timestamp = new Date(2026, 8, 7, 16, 26, 40, 4).getTime();

  assert.equal(formatTimeWithMilliseconds(timestamp), "16:26:40.004");
  assert.equal(formatTimeWithMilliseconds(Number.NaN), "-");
});
