import assert from "node:assert/strict";
import test from "node:test";

import { createStationsQueryScope, isStationsQueryScope, retainStationsPlaceholder } from "../../src/features/nsg-explorer/stations/queryScope";

const RESPONSE = { data: [{ id: 1 }], totalCount: 1 };

void test("recognizes only NSG station query scopes", () => {
  assert.equal(isStationsQueryScope(createStationsQueryScope("log-a", [26001])), true);
  assert.equal(isStationsQueryScope({ scope: "nsg-stations" }), false);
  assert.equal(isStationsQueryScope({ scope: "map", identity: "log-a" }), false);
  assert.equal(isStationsQueryScope(null), false);
});

void test("retains NSG station data across bounds and azimuth query changes for the same log and operators", () => {
  const scope = createStationsQueryScope("log-a", [26006, 26001]);
  const previousKey = ["locations", "old-bounds", {}, 1000, false, undefined, createStationsQueryScope("log-a", [26001, 26006])];

  assert.equal(retainStationsPlaceholder(RESPONSE, previousKey, scope), RESPONSE);
});

void test("does not retain NSG station data across logs, operator sets, or the main map query", () => {
  const scope = createStationsQueryScope("log-b", [26001]);
  const previousLogKey = ["locations", "bounds", {}, 1000, true, undefined, createStationsQueryScope("log-a", [26001])];
  const previousOperatorsKey = ["locations", "bounds", {}, 1000, true, undefined, createStationsQueryScope("log-b", [26006])];
  const mainMapKey = ["locations", "bounds", {}, 1000, true, undefined];

  assert.equal(retainStationsPlaceholder(RESPONSE, previousLogKey, scope), undefined);
  assert.equal(retainStationsPlaceholder(RESPONSE, previousOperatorsKey, scope), undefined);
  assert.equal(retainStationsPlaceholder(RESPONSE, mainMapKey, scope), undefined);
});
