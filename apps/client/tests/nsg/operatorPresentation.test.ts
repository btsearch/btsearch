import assert from "node:assert/strict";
import test from "node:test";

import { getOperatorPresentation } from "../../src/features/nsg-explorer/presentation/operator";

const catalogOperators = [
  { name: "TOPR", mnc: null },
  { name: "T-Mobile", mnc: 26002 },
] as const;

void test("does not match an MNC-less catalog entry when operator identity is missing", () => {
  assert.deepEqual(getOperatorPresentation(null, undefined), { label: null, numericPlmn: null });
  assert.deepEqual(getOperatorPresentation(null, catalogOperators), { label: null, numericPlmn: null });
});

void test("prefers an exact catalog PLMN match over the signaling name", () => {
  assert.deepEqual(getOperatorPresentation({ name: "Era", plmn: "26002" }, catalogOperators), {
    label: "T-Mobile",
    numericPlmn: 26002,
  });
});

void test("shows the log operator name when the catalog has no exact PLMN match", () => {
  assert.deepEqual(getOperatorPresentation({ name: "YES OPTUS", plmn: "50502" }, catalogOperators), {
    label: "YES OPTUS",
    numericPlmn: 50502,
  });
});

void test("preserves the signaling name for an unmatched complete PLMN", () => {
  assert.deepEqual(getOperatorPresentation({ name: "Play", plmn: "26006" }, catalogOperators), {
    label: "Play",
    numericPlmn: 26006,
  });
});

void test("falls back to raw PLMN digits without losing leading zeros", () => {
  assert.deepEqual(getOperatorPresentation({ name: null, plmn: "00101" }, catalogOperators), {
    label: "00101",
    numericPlmn: 101,
  });
});

void test("does not confuse five and six digit PLMNs", () => {
  assert.deepEqual(getOperatorPresentation({ name: null, plmn: "260002" }, catalogOperators), {
    label: "260002",
    numericPlmn: 260002,
  });
});
