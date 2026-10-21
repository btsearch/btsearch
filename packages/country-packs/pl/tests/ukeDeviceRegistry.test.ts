import assert from "node:assert/strict";
import test from "node:test";

import type { LocalFile, SiteRecord } from "../../core/sources.ts";
import { matchRegistryColumns } from "../sources/uke/device-registry/columns.ts";
import { parseDeviceRegistry } from "../sources/uke/device-registry/parse.ts";
import { type SheetCells, collect, releaseCovering, startReading, writeWorkbook } from "./sourceFixtures.ts";

const FILE_NAME = "2026-09-18_orange.xlsx";
const HEADER = [
  "Nr alternatywny",
  "Rodzaj wniosku",
  "Id stacji",
  "Nazwa stacji",
  "Miejscowość",
  "Ulica",
  "Nr domu",
  "Dł geogr.",
  "Szer. geogr.",
  "Rodzaj systemu komórki",
  "Typ komórki",
  "Azymut",
  "Elewacja",
  "Dodatkowy opis lokalizacji",
  "H anteny",
];
const LINE = ["ALT/1/2025", "N", "0123", "WAW_CENTRUM", "Warszawa", "Prosta", "1", "210044", "521347", "LTE800", "z", 120, -2, "dach", 32.5];
const COVER_SHEET = [["Rejestr urządzeń"], ["stan na 2026-09-18"]];
const REQUIRED_HEADERS = ["Nr alternatywny", "Id stacji", "Dł geogr.", "Szer. geogr.", "Rodzaj systemu komórki"];

const HEADER_ALIASES: [headerCells: string[], columns: Record<string, number>][] = [
  [
    HEADER,
    {
      alternativeNumber: 0,
      applicationType: 1,
      stationId: 2,
      stationName: 3,
      city: 4,
      street: 5,
      houseNumber: 6,
      longitude: 7,
      latitude: 8,
      systemType: 9,
      cellType: 10,
      azimuth: 11,
      locationDescription: 13,
      antennaHeight: 14,
    },
  ],
  [
    ["\uFEFFNr alternatywny", "  ID STACJI  ", "Dl geogr.", "Szer geogr.", "Rodzaj systemu komorki"],
    { alternativeNumber: 0, stationId: 1, longitude: 2, latitude: 3, systemType: 4 },
  ],
  [["dł geogr", "dl geogr", "szer. geogr", "szer geogr", "miejscowosc", "typ komorki"], { longitude: 1, latitude: 3, city: 4, cellType: 5 }],
  [["Nr alternatywny", "Nr alternatywny", "Id stacji", "Id stacji", "Azymut", "Azymut"], { alternativeNumber: 0, stationId: 3, azimuth: 5 }],
  [["Nr alternatywny wniosku", "Kod GUS", "H terenu", "Dł geogr. śr.", "Szer. geogr. śr.", "constructor", ""], {}],
];

function lineWith(changes: Record<string, unknown>): unknown[] {
  return HEADER.map((header, index) => (header in changes ? changes[header] : LINE[index]));
}

function registryFile(lines: SheetCells, header: readonly string[] = HEADER): LocalFile {
  return writeWorkbook(FILE_NAME, [COVER_SHEET, [header, ...lines]]);
}

async function readRegistry(lines: SheetCells, header: readonly string[] = HEADER): Promise<{ records: SiteRecord[]; skips: string[] }> {
  const reading = startReading();
  const file = registryFile(lines, header);
  const records = await collect(parseDeviceRegistry(reading.ctx, releaseCovering("orange", file), [file]));

  assert.ok(reading.skips.every(([slice]) => slice === "orange"));
  return { records, skips: reading.skips.map(([, reason]) => reason) };
}

void test("device registry: finds the columns by their header aliases", () => {
  for (const [headerCells, columns] of HEADER_ALIASES) assert.deepEqual(matchRegistryColumns(headerCells), columns, headerCells.join("|"));
});

void test("device registry: a line is one site record with one sector", async () => {
  const { records, skips } = await readRegistry([LINE]);

  assert.deepEqual(records, [
    {
      slice: "orange",
      location: { longitude: 21.012222, latitude: 52.229722, city: "Warszawa", address: "Prosta 1 dach", regionIsoCode: null },
      site: { siteId: "123", licensee: "orange", name: "WAW_CENTRUM" },
      permit: { label: { rat: "LTE", mhz: 800, variant: "commercial" }, number: "ALT/1/2025", decisionType: "permit", expiresOn: null, status: null },
      sectors: [{ azimuth: 120, antennaHeight: 32.5, antennaPlacement: "outdoor" }],
    },
  ]);
  assert.deepEqual(skips, []);
});

void test("device registry: the operator is the release's slice", async () => {
  const reading = startReading();
  const file = registryFile([LINE]);
  const [record] = await collect(parseDeviceRegistry(reading.ctx, releaseCovering("p4", file), [file]));

  assert.equal(record?.slice, "p4");
  assert.equal(record?.site.licensee, "p4");
  await assert.rejects(collect(parseDeviceRegistry(reading.ctx, { coveredSlices: [], files: [], publishedOn: null }, [file])), /covers one operator/);
});

void test("device registry: texts keep the importer's trimming and emptiness", async () => {
  const { records } = await readRegistry([
    lineWith({ "Nr alternatywny": "  ALT/2/2025 ", "Nazwa stacji": "  WAW_PROSTA ", Miejscowość: "  Łódź ", Ulica: " Prosta ", "Nr domu": " 1A " }),
    lineWith({
      "Nr alternatywny": null,
      "Nazwa stacji": null,
      Miejscowość: null,
      Ulica: null,
      "Nr domu": null,
      "Dodatkowy opis lokalizacji": null,
    }),
    lineWith({ "Nazwa stacji": "   ", Miejscowość: "   ", Ulica: "   ", "Nr domu": null, "Dodatkowy opis lokalizacji": null }),
    lineWith({ Ulica: null, "Nr domu": 12, "Dodatkowy opis lokalizacji": 'maszt "A", dach' }),
  ]);
  const texts = records.map((record) => [record.permit.number, record.site.name, record.location.city, record.location.address]);

  assert.deepEqual(texts, [
    ["ALT/2/2025", "WAW_PROSTA", "Łódź", "Prosta 1A dach"],
    ["", null, "", null],
    ["ALT/1/2025", null, "", ""],
    ["ALT/1/2025", "WAW_CENTRUM", "Warszawa", '12 maszt "A", dach'],
  ]);
});

void test("device registry: a cell is read as its formatted text", async () => {
  const { records } = await readRegistry([
    lineWith({
      "Id stacji": { t: "n", v: 45, z: "0000" },
      "Dł geogr.": 210044,
      "Szer. geogr.": { t: "n", v: 521347, z: "0" },
      Azymut: { t: "n", v: 12.5, z: "0.00" },
      "H anteny": { t: "n", v: 30, z: "0.0" },
    }),
  ]);
  const [record] = records;

  assert.equal(record?.site.siteId, "45");
  assert.deepEqual(record?.location, { longitude: 21.012222, latitude: 52.229722, city: "Warszawa", address: "Prosta 1 dach", regionIsoCode: null });
  assert.deepEqual(record?.sectors, [{ azimuth: 12.5, antennaHeight: 30, antennaPlacement: "outdoor" }]);
});

void test("device registry: the decision type is a permit change for the application type M and a permit otherwise", async () => {
  const { records } = await readRegistry(["M", " m ", "N", "MM", null].map((applicationType) => lineWith({ "Rodzaj wniosku": applicationType })));
  const decisionTypes = records.map((record) => record.permit.decisionType);

  assert.deepEqual(decisionTypes, ["permit_change", "permit_change", "permit", "permit", "permit"]);
});

void test("device registry: a sector keeps the importer's numbers", async () => {
  const { records } = await readRegistry([
    lineWith({ Azymut: 12.5, "H anteny": "30.25", "Typ komórki": " W " }),
    lineWith({ Azymut: 0, "H anteny": null, "Typ komórki": "Z" }),
    lineWith({ Azymut: "abc", "H anteny": "12,5", "Typ komórki": "x" }),
    lineWith({ Azymut: null, "H anteny": " ", "Typ komórki": null }),
  ]);
  const sectors = records.flatMap((record) => record.sectors);

  assert.deepEqual(sectors, [
    { azimuth: 12.5, antennaHeight: 30.25, antennaPlacement: "indoor" },
    { azimuth: 0, antennaHeight: 0, antennaPlacement: "outdoor" },
    { azimuth: null, antennaHeight: null, antennaPlacement: null },
    { azimuth: null, antennaHeight: 0, antennaPlacement: null },
  ]);
});

void test("device registry: optional columns may be absent", async () => {
  const header = ["Szer. geogr", "Dl geogr", "ID STACJI", "Rodzaj systemu komorki", "Nr alternatywny"];
  const { records, skips } = await readRegistry([["521347", "210044", "BT12345", "UMTS2100", "ALT/9"]], header);

  assert.deepEqual(records, [
    {
      slice: "orange",
      location: { longitude: 21.012222, latitude: 52.229722, city: null, address: null, regionIsoCode: null },
      site: { siteId: "BT12345", licensee: "orange", name: null },
      permit: { label: { rat: "UMTS", mhz: 2100, variant: "commercial" }, number: "ALT/9", decisionType: "permit", expiresOn: null, status: null },
      sectors: [{ azimuth: null, antennaHeight: null, antennaPlacement: null }],
    },
  ]);
  assert.deepEqual(skips, []);
});

void test("device registry: lines the importer dropped are skipped and counted, blank lines are not", async () => {
  const { records, skips } = await readRegistry([
    lineWith({ "Dł geogr.": "21004" }),
    lineWith({ "Szer. geogr.": "5213470" }),
    lineWith({ "Dł geogr.": "000000" }),
    lineWith({ "Dł geogr.": "21E00'44''" }),
    lineWith({ "Szer. geogr.": null }),
    HEADER.map(() => null),
    HEADER.map(() => "  "),
    lineWith({ "Id stacji": null }),
    lineWith({ "Id stacji": "   " }),
    lineWith({ "Rodzaj systemu komórki": "LTE 800" }),
    lineWith({ "Dł geogr.": null, "Id stacji": null, "Rodzaj systemu komórki": null }),
    lineWith({ "Id stacji": null, "Rodzaj systemu komórki": null }),
    LINE,
  ]);

  assert.equal(records.length, 1);
  assert.deepEqual(skips, [
    "bad_coordinates",
    "bad_coordinates",
    "bad_coordinates",
    "bad_coordinates",
    "bad_coordinates",
    "missing_site_id",
    "missing_site_id",
    "unknown_label",
    "bad_coordinates",
    "missing_site_id",
  ]);
});

void test("device registry: a line break inside a cell stays in its cell", async () => {
  const { records, skips } = await readRegistry([lineWith({ "Dodatkowy opis lokalizacji": "dach\nod podwórza" }), LINE]);
  const readings = records.map((record) => [record.location.address, record.sectors[0]?.antennaHeight]);

  assert.deepEqual(readings, [
    ["Prosta 1 dach\nod podwórza", 32.5],
    ["Prosta 1 dach", 32.5],
  ]);
  assert.deepEqual(skips, []);
});

void test("device registry: a file without the second sheet fails, naming the file and the sheet", async () => {
  const reading = startReading();
  const oneSheet = writeWorkbook(FILE_NAME, [[HEADER, LINE]]);
  const emptySheet = writeWorkbook("2026-09-18_p4.xlsx", [COVER_SHEET, []]);

  await assert.rejects(collect(parseDeviceRegistry(reading.ctx, releaseCovering("orange", oneSheet), [oneSheet])), {
    message: `Workbook "${FILE_NAME}" has no sheet at position 2`,
  });
  await assert.rejects(collect(parseDeviceRegistry(reading.ctx, releaseCovering("p4", emptySheet), [emptySheet])), {
    message: `Workbook "2026-09-18_p4.xlsx" is missing required columns: ${REQUIRED_HEADERS.map((header) => `"${header}"`).join(", ")}`,
  });
  assert.deepEqual(reading.skips, []);
});

void test("device registry: a file without a required column fails, naming the file and the column", async () => {
  const reading = startReading();
  const attempts = REQUIRED_HEADERS.map((missingHeader) => {
    const keptColumns = HEADER.map((header) => header !== missingHeader);
    const file = registryFile(
      [LINE.filter((_, index) => keptColumns[index])],
      HEADER.filter((_, index) => keptColumns[index]),
    );

    return assert.rejects(collect(parseDeviceRegistry(reading.ctx, releaseCovering("orange", file), [file])), {
      message: `Workbook "${FILE_NAME}" is missing required columns: "${missingHeader}"`,
    });
  });

  await Promise.all(attempts);
  assert.deepEqual(reading.skips, []);
});
