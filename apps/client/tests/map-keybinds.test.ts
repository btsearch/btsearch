import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_MAP_FILTERS } from "../src/features/map/data/mapFilters";
import { type MapFilterKeybindContext, getMapFilterKeybindUpdater, getMapVisibilityKeybind } from "../src/features/map/filterKeybinds";

const NO_CAPABILITIES: MapFilterKeybindContext = { operatorIds: [], capabilities: { official: false, microwaveLinks: false } };

void test("maps unshifted station and azimuth visibility keys centrally", () => {
  assert.equal(getMapVisibilityKeybind("S", false), "stations");
  assert.equal(getMapVisibilityKeybind("a", false), "azimuths");
  assert.equal(getMapVisibilityKeybind("s", true), undefined);
  assert.equal(getMapVisibilityKeybind("x", false), undefined);
});

void test("keeps visibility toggles out of station filter keybind updates", () => {
  assert.equal(getMapFilterKeybindUpdater("s", false, NO_CAPABILITIES), undefined);
  assert.equal(getMapFilterKeybindUpdater("a", false, NO_CAPABILITIES), undefined);
});

void test("gates the microwave links and source keys by their own capability", () => {
  const linksOnly: MapFilterKeybindContext = { operatorIds: [], capabilities: { official: false, microwaveLinks: true } };
  const officialOnly: MapFilterKeybindContext = { operatorIds: [], capabilities: { official: true, microwaveLinks: false } };

  assert.equal(getMapFilterKeybindUpdater("r", false, NO_CAPABILITIES), undefined);
  assert.equal(getMapFilterKeybindUpdater("z", false, NO_CAPABILITIES), undefined);
  assert.equal(getMapFilterKeybindUpdater("z", false, linksOnly), undefined);
  assert.equal(getMapFilterKeybindUpdater("r", false, officialOnly), undefined);
  assert.equal(getMapFilterKeybindUpdater("r", false, linksOnly)?.(DEFAULT_MAP_FILTERS).showRadiolines, true);
  assert.equal(getMapFilterKeybindUpdater("z", false, officialOnly)?.(DEFAULT_MAP_FILTERS).source, "official");
});
