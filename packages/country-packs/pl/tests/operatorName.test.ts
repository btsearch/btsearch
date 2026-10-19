import assert from "node:assert/strict";
import test from "node:test";

import type { OperatorRef } from "../../core/conventions.ts";
import { suggestOperatorName } from "../conventions/operatorName.ts";
import { NETWORKS, ORANGE, PLAY, PLUS, TMOBILE, UNRELATED, WITHOUT_PLMN } from "./operators.ts";

type NameCase = [operator: OperatorRef, siteId: string, city: string | null, partnerName: string | null, suggested: string | null];

const COMPUTED: NameCase[] = [
  [TMOBILE, "12345", "Warszawa", null, "Warszawa_12345"],
  [TMOBILE, "12345", "Łódź", "LODZ_CENTRUM", "Lodz_12345"],
  [TMOBILE, "12345", "ŁÓDŹ", null, "LODZ_12345"],
  [TMOBILE, "12345", "Kraków", null, "Krakow_12345"],
  [TMOBILE, "12345", "Kraków".normalize("NFD"), null, "Krakow_12345"],
  [TMOBILE, "12345", "Świętochłowice", null, "Swietochlowice_12345"],
  [TMOBILE, "12345", "Źrebięta", null, "Zrebieta_12345"],
  [TMOBILE, "12345", "Düsseldorf", null, "Dusseldorf_12345"],
  [TMOBILE, "12345", "Straße", null, "Straße_12345"],
  [TMOBILE, "12345", "Zielona Góra", null, "ZielonaGora_12345"],
  [TMOBILE, "12345", "Nowy Dwór Mazowiecki", null, "NowyDworMazowiecki_12345"],
  [TMOBILE, "12345", "Nowy Sącz", null, "NowySacz_12345"],
  [TMOBILE, "12345", "  Gdańsk  ", null, "Gdansk_12345"],
  [TMOBILE, "12345", "Bielsko-Biała", null, "Bielsko-Biala_12345"],
  [TMOBILE, "12345", "Warszawa - Mokotów", null, "Warszawa_12345"],
  [TMOBILE, "12345", "Warszawa - Praga - Północ", null, "Warszawa_12345"],
  [TMOBILE, "12345", "Warszawa- Mokotów", null, "Warszawa-Mokotow_12345"],
  [TMOBILE, "12345", " - Mokotów", null, "_12345"],
  [TMOBILE, "12345", " ", null, "_12345"],
  [TMOBILE, "n1234", "Warszawa", null, "Warszawa_n1234"],
  [TMOBILE, "1N234", "Warszawa", null, "Warszawa_1N234"],
];

const NOT_COMPUTED: NameCase[] = [
  [TMOBILE, "", "Warszawa", null, null],
  [TMOBILE, "N1234", "Warszawa", "WAW_CENTRUM", null],
  [TMOBILE, "N", "Warszawa", null, null],
  [TMOBILE, "12345", "", "WAW_CENTRUM", null],
  [TMOBILE, "12345", null, "WAW_CENTRUM", null],
];

const COPIED: NameCase[] = [
  [ORANGE, "12345", "Warszawa", "WAW_CENTRUM", "WAW_CENTRUM"],
  [ORANGE, "N1234", "Warszawa", "WAW_CENTRUM", "WAW_CENTRUM"],
  [ORANGE, "12345", null, "WAW_CENTRUM", "WAW_CENTRUM"],
  [ORANGE, "12345", "Warszawa", " ", " "],
  [ORANGE, "12345", "Warszawa", "", null],
  [ORANGE, "12345", "Warszawa", null, null],
  [PLUS, "12345", "Warszawa", "WAW_CENTRUM", "WAW_CENTRUM"],
  [PLAY, "12345", "Warszawa", "WAW_CENTRUM", "WAW_CENTRUM"],
  [NETWORKS, "12345", "Warszawa", "WAW_CENTRUM", "WAW_CENTRUM"],
  [UNRELATED, "12345", "Warszawa", "WAW_CENTRUM", "WAW_CENTRUM"],
  [WITHOUT_PLMN, "12345", "Warszawa", "WAW_CENTRUM", "WAW_CENTRUM"],
  [WITHOUT_PLMN, "12345", "Warszawa", null, null],
];

function assertSuggestions(cases: readonly NameCase[]): void {
  for (const [operator, siteId, city, partnerName, suggested] of cases) {
    assert.equal(
      suggestOperatorName({ operator, siteId, city, partnerName }),
      suggested,
      JSON.stringify([operator.primaryPlmn, siteId, city, partnerName]),
    );
  }
}

void test("T-Mobile's name is the city without diacritics and spaces, then the site id", () => {
  assertSuggestions(COMPUTED);
});

void test("T-Mobile gets no name for a site id starting with N or without a city", () => {
  assertSuggestions(NOT_COMPUTED);
});

void test("every other operator takes the partner's name", () => {
  assertSuggestions(COPIED);
});
