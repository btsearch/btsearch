import assert from "node:assert/strict";
import test from "node:test";

import { operatorNameOfLicensee, shortLicenseeName } from "../sources/uke/shared/licensees.ts";

const STRIPPED_NAMES: [publishedName: string, shortName: string][] = [
  ["P4 Sp. z o.o.", "P4"],
  ["Orange Polska S.A.", "Orange Polska"],
  ["T-Mobile Polska S.A.", "T-Mobile Polska"],
  ["POLKOMTEL SP. Z O.O.", "POLKOMTEL"],
  ["Energa-Operator SA", "Energa-Operator"],
  ["Firma Sp.k.", "Firma"],
  ["Firma sp. j.", "Firma"],
  ["SATFILM Sp. z o.o.", "SATFILM"],
  ["Wąsaty Sp. z o.o.", "Wąsaty"],
  ["Spółka z ograniczoną odpowiedzialnością ABC", "ABC"],
  ["ABC spolka z ograniczona odpowiedzialnoscia", "ABC"],
  ["Emitel S. A.", "Emitel"],
  ["Emitel S.A", "Emitel"],
  ["Emitel Sp.z o.o.", "Emitel"],
  ["Emitel sp. z o. o.", "Emitel"],
  ["Emitel sp z o o", "Emitel"],
  ["Emitel SP.J.", "Emitel"],
  ["Emitel sp k", "Emitel"],
  ["S.A. Serwis", "Serwis"],
  ["Sp. z o.o. ABC", "ABC"],
  ["Bank Polski S.A. Oddział w Łodzi", "Bank Polski Oddział w Łodzi"],
  ["ABC Sp. z o.o., Oddział w Łodzi", "ABC Oddział w Łodzi"],
  ["ABC Sp. z o.o. Sp. k.", "ABC"],
  ["ABC S.A. S.A.", "ABC"],
  ["ŻABKA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ", "ŻABKA"],
  ["ŁĄSA Sp. z o.o.", "ŁĄSA"],
  ["ŚWIT S.A.", "ŚWIT"],
  ["Studio 5 S.A.", "Studio 5"],
  ["4SA Sp. z o.o.", "4SA"],
  ["SA2 Sp. z o.o.", "SA2"],
  ["SA-BUD Sp. z o.o.", "SA-BUD"],
  ["ABC - Sp. z o.o.", "ABC"],
  ["Sp. z o.o.", ""],
  ["S.A.", ""],
  ["spółka z ograniczoną odpowiedzialnością", ""],
  ["Sp. z o.o. Sp. k.", ""],
];

const UNTOUCHED_NAMES = [
  "Samodzielny Publiczny Zakład Opieki Zdrowotnej",
  "S.A.T. Serwis",
  "P.S.A. Serwis",
  "Radio S.A.2",
  "Spjot",
  "Saturn",
  "Sałatka",
  "Energa-SA Oddział",
  "Energa-SA",
  "Bank S.A.-Oddział",
  "Hurtownia Sp. komandytowa",
  "Spółki z ograniczoną odpowiedzialnością",
  "Gmina Miasto, Kraków",
  "",
];

const CLEANED_NAMES: [publishedName: string, shortName: string][] = [
  ["Urząd Miasta - Sanok", "Urząd Miasta Sanok"],
  ["  Emitel  S.A.  ", "Emitel"],
  ["Zakład  Usług   Radiowych", "Zakład Usług Radiowych"],
  ["- Gmina Kraków -", "Gmina Kraków"],
  ["Novo Nordisk Pharmaceutical Services Sp. z o.o.", "Nordisk"],
];

const REGISTRY_FILE_KEYS: [fileKey: string, operatorName: string][] = [
  ["orange", "Orange"],
  ["p4", "Play"],
  ["t-mobile", "T-Mobile"],
  ["polkomtel", "Plus"],
];

const COMPANY_NAMES: [publishedName: string, operatorName: string | null][] = [
  ["P4 Sp. z o.o.", "Play"],
  ["Orange Polska S.A.", "Orange"],
  ["T-Mobile Polska S.A.", "T-Mobile"],
  ["POLKOMTEL SP. Z O.O.", "Plus"],
  ["Polkomtel Sp. z o.o.", "Plus"],
  ["PKP Polskie Linie Kolejowe S.A.", "PKP PLK"],
  ["Tatrzańskie Ochotnicze Pogotowie Ratunkowe", "TOPR"],
  ["Energa-Operator SA", "Energa-Operator"],
  ["Novo Nordisk Pharmaceutical Services Sp. z o.o.", "Nordisk"],
  ["SATFILM Sp. z o.o.", "SATFILM"],
  ["Orange", "Orange"],
  ["ORANGE", "ORANGE"],
  ["Orange S.A.", "Orange"],
  ["T-Mobile", "T-Mobile"],
  ["T-MOBILE", "T-MOBILE"],
  ["P4", "Play"],
  ["constructor", "constructor"],
  ["Sp. z o.o.", null],
  ["", null],
];

void test("removes a company form that stands as a whole token", () => {
  for (const [publishedName, shortName] of STRIPPED_NAMES) assert.equal(shortLicenseeName(publishedName), shortName, publishedName);
});

void test("keeps a name in which a company form is only part of a longer token", () => {
  for (const publishedName of UNTOUCHED_NAMES) assert.equal(shortLicenseeName(publishedName), publishedName);
});

void test("drops stray punctuation and spaces, and shortens any Nordisk name", () => {
  for (const [publishedName, shortName] of CLEANED_NAMES) assert.equal(shortLicenseeName(publishedName), shortName, publishedName);
});

void test("a registry file key is its operator, whatever the company rule would say", () => {
  for (const [fileKey, operatorName] of REGISTRY_FILE_KEYS) assert.equal(operatorNameOfLicensee(fileKey), operatorName, fileKey);
});

void test("a company name is stripped, then looked up, and otherwise suggested as it is", () => {
  for (const [publishedName, operatorName] of COMPANY_NAMES) assert.equal(operatorNameOfLicensee(publishedName), operatorName, publishedName);
});
