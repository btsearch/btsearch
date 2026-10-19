import assert from "node:assert/strict";
import test from "node:test";

import { defaultConventions } from "../../core/conventions.ts";
import { capabilitiesFor, conventionsFor, countryCodesWith } from "../../core/registry.ts";
import { pl } from "../index.ts";
import { TMOBILE, WITHOUT_PLMN } from "./operators.ts";

const HOOKS = [
  "identifierKinds",
  "formatIdentifier",
  "validateAddress",
  "suggestOperatorName",
  "equivalentEnbids",
  "sharedSite",
  "lteSectorRule",
  "hoistedTac",
  "normalizeGeocodedPlace",
] as const;
const DEFAULT_HOOKS = ["gnbidLength"] as const;

void test("gives Poland its own hook for every convention it changes", () => {
  const conventions = conventionsFor("PL");

  assert.deepEqual(Object.keys(defaultConventions).sort(), [...HOOKS, ...DEFAULT_HOOKS].sort());
  for (const hook of DEFAULT_HOOKS) assert.equal(conventions[hook], defaultConventions[hook], hook);
  for (const hook of HOOKS) {
    assert.equal(conventions[hook], pl.conventions[hook], hook);
    assert.notEqual(conventions[hook], defaultConventions[hook], hook);
  }
  assert.deepEqual(conventions.identifierKinds(TMOBILE), ["networksId", "networksName", "operatorName"]);
  assert.equal(conventions.formatIdentifier("networksId", "12345"), "N!12345");
  assert.equal(conventions.validateAddress("teren własny"), "Address must not contain variants of własny");
  assert.equal(conventions.suggestOperatorName({ operator: TMOBILE, siteId: "12345", city: "Łódź", partnerName: null }), "Lodz_12345");
  assert.deepEqual(conventions.equivalentEnbids(TMOBILE, 57), [17, 27, 37, 47, 57, 67, 77, 87, 97]);
  assert.deepEqual(conventions.sharedSite.copies, ["backhaul", "sectors", "photos"]);
  assert.equal(conventions.lteSectorRule(TMOBILE)?.clidStep, 1);
  assert.equal(conventions.gnbidLength(TMOBILE), 24);
  assert.equal(conventions.hoistedTac, true);
  assert.deepEqual(conventions.normalizeGeocodedPlace({ region: "województwo łódzkie", municipality: "gmina Zgierz" }), {
    region: "Łódzkie",
    municipality: "Zgierz",
  });
});

void test("gives every operator in Great Britain a 22-bit gNB ID and the defaults otherwise", () => {
  const conventions = conventionsFor("GB");

  assert.equal(conventions.gnbidLength(TMOBILE), 22);
  assert.equal(conventions.gnbidLength(WITHOUT_PLMN), 22);
  assert.equal(conventions.lteSectorRule, defaultConventions.lteSectorRule);
  assert.equal(conventions.hoistedTac, false);
  assert.deepEqual(capabilitiesFor("GB"), { official: false, microwaveLinks: false, emf: false, terrainProfiles: null, kmz: false });
});

void test("gives the defaults to a country without a pack and to no country", () => {
  for (const countryCode of ["XX", null]) {
    const conventions = conventionsFor(countryCode);

    assert.equal(conventions, defaultConventions);
    assert.deepEqual(conventions.identifierKinds(TMOBILE), []);
    assert.equal(conventions.formatIdentifier("networksId", "12345"), "12345");
    assert.equal(conventions.validateAddress("teren własny"), null);
    assert.equal(conventions.suggestOperatorName({ operator: TMOBILE, siteId: "12345", city: "Łódź", partnerName: "LODZ_CENTRUM" }), null);
    assert.deepEqual(conventions.equivalentEnbids(TMOBILE, 345678), [345678]);
    assert.deepEqual(conventions.sharedSite.copies, []);
    assert.equal(conventions.lteSectorRule(TMOBILE), null);
    assert.equal(conventions.gnbidLength(TMOBILE), 24);
    assert.equal(conventions.hoistedTac, false);
    assert.deepEqual(conventions.normalizeGeocodedPlace({ region: "województwo łódzkie", municipality: "gmina Zgierz" }), {
      region: "województwo łódzkie",
      municipality: "gmina Zgierz",
    });
  }
});

const TERRAIN_PROFILES = { receiverBounds: { south: 48.8, north: 55.2, west: 13.8, east: 24.5 } };

void test("takes the official layers from the sources and lets KMZ follow the official sites", () => {
  assert.deepEqual(capabilitiesFor("PL", { official: true, microwaveLinks: true }), {
    official: true,
    microwaveLinks: true,
    emf: true,
    terrainProfiles: TERRAIN_PROFILES,
    kmz: true,
  });
  assert.deepEqual(capabilitiesFor("PL", { official: false, microwaveLinks: true }), {
    official: false,
    microwaveLinks: true,
    emf: true,
    terrainProfiles: TERRAIN_PROFILES,
    kmz: false,
  });
  assert.deepEqual(capabilitiesFor("PL"), { official: false, microwaveLinks: false, emf: true, terrainProfiles: TERRAIN_PROFILES, kmz: false });
  assert.equal("official" in pl.capabilities, false);
  assert.equal("microwaveLinks" in pl.capabilities, false);
});

void test("gives a country without a pack only what its sources bring", () => {
  assert.deepEqual(capabilitiesFor("XX", { official: true, microwaveLinks: false }), {
    official: true,
    microwaveLinks: false,
    emf: false,
    terrainProfiles: null,
    kmz: false,
  });
  assert.deepEqual(countryCodesWith("emf"), ["PL"]);
  assert.deepEqual(countryCodesWith("terrainProfiles"), ["PL"]);
});
