import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGeocodedPlace } from "../conventions/geocoding.ts";

const REGIONS: [region: string | null, normalized: string | null][] = [
  ["województwo mazowieckie", "Mazowieckie"],
  ["Województwo Mazowieckie", "Mazowieckie"],
  ["WOJEWÓDZTWO ŚLĄSKIE", "ŚLĄSKIE"],
  ["województwo łódzkie", "Łódzkie"],
  ["województwo  dolnośląskie", "Dolnośląskie"],
  ["województwo świętokrzyskie", "Świętokrzyskie"],
  ["mazowieckie", "Mazowieckie"],
  ["śląskie", "Śląskie"],
  ["łódzkie", "Łódzkie"],
  ["Łódzkie", "Łódzkie"],
  ["województwo", "Województwo"],
  ["wojewodztwo mazowieckie", "Wojewodztwo mazowieckie"],
  ["woj. mazowieckie", "Woj. mazowieckie"],
  ["Bayern", "Bayern"],
  ["île-de-France", "Île-de-France"],
  ["istanbul", "Istanbul"],
  ["1 maja", "1 maja"],
  ["", ""],
  [null, null],
];

const MUNICIPALITIES: [municipality: string | null, normalized: string | null][] = [
  ["gmina Piaseczno", "Piaseczno"],
  ["Gmina Łódź", "Łódź"],
  ["GMINA  Serock", "Serock"],
  ["gmina Ełk", "Ełk"],
  ["gmina wiejska Ełk", "wiejska Ełk"],
  ["gmina gmina Piaseczno", "gmina Piaseczno"],
  ["gminaPiaseczno", "gminaPiaseczno"],
  ["gmina", "gmina"],
  ["Piaseczno", "Piaseczno"],
  [" gmina Piaseczno", " gmina Piaseczno"],
  ["miasto i gmina Serock", "miasto i gmina Serock"],
  ["", ""],
  [null, null],
];

void test("a region loses a leading województwo and starts with a capital letter", () => {
  for (const [region, normalized] of REGIONS) assert.equal(normalizeGeocodedPlace({ region, municipality: null }).region, normalized);
});

void test("a municipality loses a leading gmina", () => {
  for (const [municipality, normalized] of MUNICIPALITIES) {
    assert.equal(normalizeGeocodedPlace({ region: null, municipality }).municipality, normalized);
  }
});
