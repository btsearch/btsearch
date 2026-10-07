import assert from "node:assert/strict";
import test from "node:test";

import { getMapFilterKeybindUpdater, getMapVisibilityKeybind } from "../src/features/map/filterKeybinds";

void test("maps unshifted station and azimuth visibility keys centrally", () => {
  assert.equal(getMapVisibilityKeybind("S", false), "stations");
  assert.equal(getMapVisibilityKeybind("a", false), "azimuths");
  assert.equal(getMapVisibilityKeybind("s", true), undefined);
  assert.equal(getMapVisibilityKeybind("x", false), undefined);
});

void test("keeps visibility toggles out of station filter keybind updates", () => {
  assert.equal(getMapFilterKeybindUpdater("s", false), undefined);
  assert.equal(getMapFilterKeybindUpdater("a", false), undefined);
});
