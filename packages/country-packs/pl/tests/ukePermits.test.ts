import assert from "node:assert/strict";
import test from "node:test";

import type { LocalFile, SiteRecord } from "../../core/sources.ts";
import { parsePermits } from "../sources/uke/permits/parse.ts";
import { type SheetCells, collect, releaseCovering, startReading, writeWorkbook } from "./sourceFixtures.ts";

const SLICE = "LTE:800:commercial";
const FILE_NAME = "lte800_-_stan_na_2026-09-25.xlsx";
const HEADER = [
  "Nazwa Operatora",
  "Nr Decyzji",
  "Rodzaj decyzji",
  "Data ważności",
  "Dł geogr stacji",
  "Szer geogr stacji",
  "Miejscowość",
  "Lokalizacja",
  "IdStacji",
  "TERYT",
];
const ROW = ["P4 Sp. z o.o.", "BT/1/2025", "P", 46022, "21E00'44''", "52N13'47''", "Warszawa", "ul. Prosta 1", "WAW0001", "1465011"];

function rowWith(changes: Record<string, unknown>): unknown[] {
  return HEADER.map((header, index) => (header in changes ? changes[header] : ROW[index]));
}

function permitFile(rows: SheetCells, header: readonly string[] = HEADER): LocalFile {
  return writeWorkbook(FILE_NAME, [[header, ...rows]]);
}

async function readPermits(rows: SheetCells): Promise<{ records: SiteRecord[]; skips: string[] }> {
  const reading = startReading();
  const file = permitFile(rows);
  const records = await collect(parsePermits(reading.ctx, releaseCovering(SLICE, file), [file]));

  assert.ok(reading.skips.every(([slice]) => slice === SLICE));
  return { records, skips: reading.skips.map(([, reason]) => reason) };
}

void test("permits: a row is one site record without sectors", async () => {
  const { records, skips } = await readPermits([ROW]);

  assert.deepEqual(records, [
    {
      slice: SLICE,
      location: { longitude: 21.012222, latitude: 52.229722, city: "Warszawa", address: "ul. Prosta 1", regionIsoCode: "PL-14" },
      site: { siteId: "WAW0001", licensee: "P4 Sp. z o.o.", name: null },
      permit: {
        label: { rat: "LTE", mhz: 800, variant: "commercial" },
        number: "BT/1/2025",
        decisionType: "permit",
        expiresOn: "2025-12-31",
      },
      sectors: [],
    },
  ]);
  assert.deepEqual(skips, []);
});

void test("permits: the label comes from the release's slice", async () => {
  const reading = startReading();
  const file = permitFile([ROW]);
  const [record] = await collect(parsePermits(reading.ctx, releaseCovering("GSM:900:railway", file), [file]));

  assert.equal(record?.slice, "GSM:900:railway");
  assert.deepEqual(record?.permit.label, { rat: "GSM", mhz: 900, variant: "railway" });
  await assert.rejects(collect(parsePermits(reading.ctx, releaseCovering("orange", file), [file])), { message: '"orange" is not a permit label' });
  await assert.rejects(collect(parsePermits(reading.ctx, { coveredSlices: [], files: [], publishedOn: null }, [file])), /covers one band label/);
});

void test("permits: texts keep the importer's trimming and emptiness", async () => {
  const { records } = await readPermits([
    rowWith({ "Nazwa Operatora": "  Orange Polska S.A.  ", "Nr Decyzji": "  BT/2/2025 ", Miejscowość: " Łódź ", Lokalizacja: " maszt " }),
    rowWith({ "Nr Decyzji": null, Miejscowość: null, Lokalizacja: "" }),
    rowWith({ "Nr Decyzji": 1234, Miejscowość: 5, Lokalizacja: 0 }),
  ]);
  const texts = records.map((record) => [record.site.licensee, record.permit.number, record.location.city, record.location.address]);

  assert.deepEqual(texts, [
    ["Orange Polska S.A.", "BT/2/2025", " Łódź ", " maszt "],
    ["P4 Sp. z o.o.", "", null, null],
    ["P4 Sp. z o.o.", "1234", "5", null],
  ]);
});

void test("permits: the site id loses its padding, and a numeric cell is its digits", async () => {
  const { records, skips } = await readPermits([
    rowWith({ IdStacji: "0123" }),
    rowWith({ IdStacji: "0000" }),
    rowWith({ IdStacji: " BT12345 " }),
    rowWith({ IdStacji: "0A12" }),
    rowWith({ IdStacji: 4567 }),
  ]);
  const siteIds = records.map((record) => record.site.siteId);

  assert.deepEqual(siteIds, ["123", "0", "BT12345", "0A12", "4567"]);
  assert.deepEqual(skips, []);
});

void test("permits: the region is the TERYT prefix's ISO code, or nothing for an unknown prefix", async () => {
  const { records, skips } = await readPermits([
    rowWith({ TERYT: "0201011" }),
    rowWith({ TERYT: 3262011 }),
    rowWith({ TERYT: 201011 }),
    rowWith({ TERYT: "9901011" }),
    rowWith({ TERYT: null }),
  ]);
  const regionIsoCodes = records.map((record) => record.location.regionIsoCode);

  assert.deepEqual(regionIsoCodes, ["PL-02", "PL-32", "PL-20", null, null]);
  assert.deepEqual(skips, []);
});

void test("permits: the expiry is the day of a serial number or a dashed date, or the day of the run", async () => {
  const { records } = await readPermits([
    rowWith({ "Data ważności": 46022.5 }),
    rowWith({ "Data ważności": "31-12-2030" }),
    rowWith({ "Data ważności": "12-31-2030" }),
    rowWith({ "Data ważności": null }),
    rowWith({ "Data ważności": "bezterminowo" }),
  ]);
  const expiries = records.map((record) => record.permit.expiresOn);

  assert.deepEqual(expiries, ["2025-12-31", "2030-12-31", "2030-12-31", "2026-10-12", "2026-10-12"]);
});

void test("permits: P is a permit and zmP a permit change, an empty decision type is a permit, and any other text skips the row", async () => {
  const { records, skips } = await readPermits([
    rowWith({ "Rodzaj decyzji": "zmP" }),
    rowWith({ "Rodzaj decyzji": null }),
    rowWith({ "Rodzaj decyzji": "zmP " }),
    rowWith({ "Rodzaj decyzji": "p" }),
    rowWith({ "Rodzaj decyzji": "" }),
    rowWith({ "Rodzaj decyzji": 1 }),
  ]);
  const decisionTypes = records.map((record) => record.permit.decisionType);

  assert.deepEqual(decisionTypes, ["permit_change", "permit"]);
  assert.deepEqual(skips, ["unknown_decision_type", "unknown_decision_type", "unknown_decision_type", "unknown_decision_type"]);
});

void test("permits: rows the importer dropped or crashed on are skipped and counted", async () => {
  const { records, skips } = await readPermits([
    rowWith({ "Dł geogr stacji": "21E00'44,5''" }),
    rowWith({ "Szer geogr stacji": null }),
    rowWith({ "Dł geogr stacji": "0E00'00''" }),
    rowWith({ "Dł geogr stacji": 21.0122 }),
    rowWith({ "Nazwa Operatora": null }),
    rowWith({ "Nazwa Operatora": "   " }),
    rowWith({ IdStacji: null }),
    rowWith({ IdStacji: "  " }),
    rowWith({ IdStacji: 0 }),
    rowWith({ "Szer geogr stacji": "x", "Nazwa Operatora": null, IdStacji: null, "Rodzaj decyzji": "X" }),
    rowWith({ "Nazwa Operatora": null, IdStacji: null, "Rodzaj decyzji": "X" }),
    rowWith({ IdStacji: null, "Rodzaj decyzji": "X" }),
    ROW,
  ]);

  assert.equal(records.length, 1);
  assert.deepEqual(skips, [
    "bad_coordinates",
    "bad_coordinates",
    "bad_coordinates",
    "bad_coordinates",
    "missing_licensee",
    "missing_licensee",
    "missing_site_id",
    "missing_site_id",
    "missing_site_id",
    "bad_coordinates",
    "missing_licensee",
    "missing_site_id",
  ]);
});

void test("permits: a file without a required column fails, naming the file and the column", async () => {
  const reading = startReading();
  const keptColumns = HEADER.map((header) => header !== "TERYT" && header !== "Nr Decyzji");
  const withoutColumns = permitFile(
    [ROW.filter((_, index) => keptColumns[index])],
    HEADER.filter((_, index) => keptColumns[index]),
  );
  const renamed = permitFile(
    [ROW],
    HEADER.map((header) => (header === "IdStacji" ? "Id Stacji" : header)),
  );
  const empty = writeWorkbook("lte800_pusty.xlsx", [[]]);

  await assert.rejects(collect(parsePermits(reading.ctx, releaseCovering(SLICE, withoutColumns), [withoutColumns])), {
    message: `Workbook "${FILE_NAME}" is missing required columns: "Nr Decyzji", "TERYT"`,
  });
  await assert.rejects(collect(parsePermits(reading.ctx, releaseCovering(SLICE, renamed), [renamed])), {
    message: `Workbook "${FILE_NAME}" is missing required columns: "IdStacji"`,
  });
  await assert.rejects(collect(parsePermits(reading.ctx, releaseCovering(SLICE, empty), [empty])), {
    message: `Workbook "lte800_pusty.xlsx" is missing required columns: ${HEADER.map((header) => `"${header}"`).join(", ")}`,
  });
  assert.deepEqual(reading.skips, []);
});
