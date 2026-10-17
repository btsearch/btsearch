import assert from "node:assert/strict";
import test from "node:test";

import { validateAddress } from "../conventions/address.ts";

const REFUSAL = "Address must not contain variants of własny";

const REFUSED = [
  "własny",
  "teren własny",
  "Maszt własny Orange",
  "ul. Własna 3",
  "maszt własnego",
  "własnemu",
  "własnymi",
  "własnych",
  "własnym",
  "własnej",
  "własną",
  "własna",
  "własne",
  "WŁASNEGO",
  "WŁASNĄ",
  "Własnego",
  "(własny)",
  '"własny"',
  "maszt-własny",
  "własny, dz. 5",
  "własny.",
  "5/własny",
  "komin\twłasny",
  "własny1",
  "1własny",
  "_własny_",
  "éwłasny",
  "własną".normalize("NFD"),
];

const ACCEPTED = [
  "",
  "ul. Długa 5",
  "własność",
  "własnościowy",
  "niewłasny",
  "Niewłasna 4",
  "własnyx",
  "własnyż",
  "żwłasny",
  "ŻWŁASNY",
  "wlasny",
  "właśny",
  "własn",
  "własno",
  "własni",
  "własnymy",
  "własnę",
];

void test("refuses an address with a form of the word własny", () => {
  for (const address of REFUSED) assert.equal(validateAddress(address), REFUSAL, JSON.stringify(address));
});

void test("accepts an address without the word, also where it is part of a longer word", () => {
  for (const address of ACCEPTED) assert.equal(validateAddress(address), null, JSON.stringify(address));
});
