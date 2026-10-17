import assert from "node:assert/strict";
import test from "node:test";

import type { PermitLabel } from "../../core/sources.ts";
import { parseCompactCoordinate, parseDmsCoordinate } from "../sources/uke/shared/coordinates.ts";
import { parseExcelDate, parseExcelDay, publishedOnFromFileName } from "../sources/uke/shared/dates.ts";
import { labelFromSliceKey, labelSliceKey, parseFileLabel, parseSystemTypeLabel } from "../sources/uke/shared/labels.ts";
import type { SheetValue } from "../sources/uke/shared/sheets.ts";

const NOW = new Date("2026-10-12T14:15:16.789Z");

const DMS_COORDINATES: [published: unknown, degrees: number | null][] = [
  ["18E43'49.2''", 18.730333],
  ["18E43'49''", 18.730278],
  ["18E43'49", 18.730278],
  ["18E43'49\"", 18.730278],
  ["52N13'47''", 52.229722],
  ["  52N13'47''  ", 52.229722],
  ["18W43'49''", -18.730278],
  ["52S13'47''", -52.229722],
  ["0E00'00''", 0],
  ["18E43'49,2''", null],
  ["18e43'49''", null],
  ["18E 43'49''", null],
  ["18E60'00''", null],
  ["18E43'60''", null],
  ["1234E43'49''", null],
  ["18.7303", null],
  ["", null],
  [18.7303, null],
  [null, null],
  [undefined, null],
];

const COMPACT_COORDINATES: [published: string | undefined, hemisphere: "N" | "E", degrees: number | null][] = [
  ["205840", "E", 20.977778],
  ["521347", "N", 52.229722],
  [" 205840 ", "E", 20.977778],
  ["000000", "E", 0],
  ["20584", "E", null],
  ["2058400", "E", null],
  ["20.584", "E", null],
  ["205860", "E", null],
  ["206040", "E", null],
  ["20E584", "E", null],
  ["", "E", null],
  [undefined, "N", null],
];

const EXCEL_DATES: [published: SheetValue, instant: string][] = [
  [46022, "2025-12-31T00:00:00.000Z"],
  [46022.5, "2025-12-31T12:00:00.000Z"],
  [0, "1899-12-30T00:00:00.000Z"],
  ["31-12-2030", "2030-12-31T00:00:00.000Z"],
  ["12-31-2030", "2030-12-31T00:00:00.000Z"],
  ["05-06-2030", "2030-06-05T00:00:00.000Z"],
  ["12-12-2030", "2030-12-12T00:00:00.000Z"],
  ["2030-12-31", "2030-12-31T00:00:00.000Z"],
  ["2030-12-31T10:20:30Z", "2030-12-31T10:20:30.000Z"],
  [true, "1970-01-01T00:00:00.001Z"],
];

const UNREADABLE_EXCEL_DATES: SheetValue[] = [null, undefined, "", "bezterminowo", "13-13-2030", "32-01-2030"];

const FILE_NAME_DATES: [fileName: string, publishedOn: string | null][] = [
  ["2026-09-18_orange.xlsx", "2026-09-18"],
  ["gsm900_-_stan_na_2026-09-25.xlsx", "2026-09-25"],
  ["stan_2026-09-25_poprawka_2026-10-01.xlsx", "2026-09-25"],
  ["2026-02-31_p4.xlsx", "2026-03-03"],
  ["lte800.xlsx", null],
  ["20260918_orange.xlsx", null],
  ["", null],
];

const FILE_LABELS: [linkText: string, label: PermitLabel | null][] = [
  ["gsm900 - stan na 2026-09-25 plik XLSX", { rat: "GSM", mhz: 900, variant: "commercial" }],
  ["GSM-R - stan na 2026-09-25 plik XLSX", { rat: "GSM", mhz: 900, variant: "railway" }],
  ["gsm-r 900 - stan", { rat: "GSM", mhz: 900, variant: "railway" }],
  ["GSM-R1800", { rat: "GSM", mhz: 1800, variant: "railway" }],
  ["5g3600 - stan", { rat: "NR", mhz: 3500, variant: "commercial" }],
  ["5g3500 - stan", { rat: "NR", mhz: 3500, variant: "commercial" }],
  ["5G700 plik XLSX", { rat: "NR", mhz: 700, variant: "commercial" }],
  ["LTE2600-TDD", { rat: "LTE", mhz: 2600, variant: "commercial" }],
  ["lte3600 - stan", { rat: "LTE", mhz: 3600, variant: "commercial" }],
  ["cdma420 - x", { rat: "CDMA", mhz: 420, variant: "commercial" }],
  ["umts2100 plik XLSX", { rat: "UMTS", mhz: 2100, variant: "commercial" }],
  ["  lte800  ", { rat: "LTE", mhz: 800, variant: "commercial" }],
  ["iot800 - stan", null],
  ["lte 800", null],
  ["nr3500", null],
  ["LTE1800_stan", null],
  ["5g26000", null],
  ["lte80", null],
  ["https://bip.uke.gov.pl/download/gsm900_-_stan_na_2026-09-25.xlsx", null],
  ["", null],
];

const SYSTEM_TYPES: [systemType: string | undefined, label: PermitLabel | null][] = [
  ["LTE800", { rat: "LTE", mhz: 800, variant: "commercial" }],
  ["lte800", { rat: "LTE", mhz: 800, variant: "commercial" }],
  [" 5G3600 ", { rat: "NR", mhz: 3500, variant: "commercial" }],
  ["5G3500", { rat: "NR", mhz: 3500, variant: "commercial" }],
  ["IOT800", { rat: "IOT", mhz: 800, variant: "commercial" }],
  ["GSM900", { rat: "GSM", mhz: 900, variant: "commercial" }],
  ["UMTS2100", { rat: "UMTS", mhz: 2100, variant: "commercial" }],
  ["CDMA450", null],
  ["NR3500", null],
  ["GSM-R900", null],
  ["LTE 800", null],
  ["LTE80", null],
  ["LTE26000", null],
  ["", null],
  [undefined, null],
];

const SLICE_KEYS: [label: PermitLabel, sliceKey: string][] = [
  [{ rat: "LTE", mhz: 800, variant: "commercial" }, "LTE:800:commercial"],
  [{ rat: "GSM", mhz: 900, variant: "railway" }, "GSM:900:railway"],
  [{ rat: "NR", mhz: 3500, variant: "commercial" }, "NR:3500:commercial"],
  [{ rat: "IOT", mhz: 800, variant: "commercial" }, "IOT:800:commercial"],
];

const NOT_SLICE_KEYS = ["", "LTE", "LTE:800", "LTE:x:commercial", "LTE:0:commercial", "LTE:800:military", "WIFI:2400:commercial"];

void test("reads degrees, minutes and seconds to six decimals", () => {
  for (const [published, degrees] of DMS_COORDINATES) assert.equal(parseDmsCoordinate(published), degrees, JSON.stringify(published));
});

void test("reads the registry's six characters as degrees, minutes and seconds", () => {
  for (const [published, hemisphere, degrees] of COMPACT_COORDINATES) {
    assert.equal(parseCompactCoordinate(published, hemisphere), degrees, JSON.stringify(published));
  }
});

void test("reads a date from a serial number, a dashed date or an ISO text", () => {
  for (const [published, instant] of EXCEL_DATES) assert.equal(parseExcelDate(published, NOW).toISOString(), instant, JSON.stringify(published));
});

void test("an empty or unreadable date is the moment of the run", () => {
  for (const published of UNREADABLE_EXCEL_DATES) {
    const date = parseExcelDate(published, NOW);

    assert.equal(date.getTime(), NOW.getTime(), JSON.stringify(published));
    assert.notEqual(date, NOW);
  }
});

void test("a day is the UTC day of the date, and the day of the run when the date is empty or unreadable", () => {
  const days = [46022.5, "31-12-2030", "2030-12-31T23:30:00-02:00", "bezterminowo", null].map((published) => parseExcelDay(published, NOW));

  assert.deepEqual(days, ["2025-12-31", "2030-12-31", "2031-01-01", "2026-10-12", "2026-10-12"]);
});

void test("finds the first date in a file name", () => {
  for (const [fileName, publishedOn] of FILE_NAME_DATES) assert.equal(publishedOnFromFileName(fileName), publishedOn, fileName);
});

void test("reads a permit file's label from its link text", () => {
  for (const [linkText, label] of FILE_LABELS) assert.deepEqual(parseFileLabel(linkText), label, linkText);
});

void test("reads the registry's label from the cell's system type", () => {
  for (const [systemType, label] of SYSTEM_TYPES) assert.deepEqual(parseSystemTypeLabel(systemType), label, JSON.stringify(systemType));
});

void test("writes a label's slice key and reads it back", () => {
  for (const [label, sliceKey] of SLICE_KEYS) {
    assert.equal(labelSliceKey(label), sliceKey);
    assert.deepEqual(labelFromSliceKey(sliceKey), label);
  }
});

void test("refuses a slice key that is not a label", () => {
  for (const sliceKey of NOT_SLICE_KEYS) assert.throws(() => labelFromSliceKey(sliceKey), /is not a permit label/, JSON.stringify(sliceKey));
});
