import { strToU8, zipSync } from "fflate";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { LocalFile, SiteRecord } from "../../core/sources.ts";
import { collect, startReading } from "../../pl/tests/sourceFixtures.ts";
import { readCsvRows } from "../sources/anfr/csv.ts";
import { DEPARTMENT_SLICES, departmentOf, regionIsoCodeOf } from "../sources/anfr/departments.ts";
import { discoverRadioInstallations } from "../sources/anfr/discover.ts";
import { operatorNameOfLicensee, shortLicenseeName } from "../sources/anfr/licensees.ts";
import { labelOfSystem, parseRadioInstallations } from "../sources/anfr/parse.ts";

const FIXTURE_DIRECTORY = new URL("fixtures/anfr-5w/", import.meta.url);
const REFERENCE_TABLES = new Set(["SUP_EXPLOITANT.txt"]);
const SUPPORT_HEADER =
  "SUP_ID;STA_NM_ANFR;NAT_ID;COR_NB_DG_LAT;COR_NB_MN_LAT;COR_NB_SC_LAT;COR_CD_NS_LAT;COR_NB_DG_LON;COR_NB_MN_LON;COR_NB_SC_LON;COR_CD_EW_LON;" +
  "SUP_NM_HAUT;TPO_ID;ADR_LB_LIEU;ADR_LB_ADD1;ADR_LB_ADD2;ADR_LB_ADD3;ADR_NM_CP;COM_CD_INSEE";
const archiveDirectory = mkdtempSync(join(tmpdir(), "anfr-5w-"));

type Tables = Readonly<Record<string, string | Uint8Array>>;

function zipOf(fileName: string, entries: Tables): LocalFile {
  const path = join(archiveDirectory, fileName);
  writeFileSync(
    path,
    zipSync(Object.fromEntries(Object.entries(entries).map(([name, text]) => [name, typeof text === "string" ? strToU8(text) : text]))),
  );
  return { url: `https://static.data.gouv.fr/resources/${fileName}`, fileName, path };
}

async function readRecords(tables: Tables) {
  const reading = startReading();
  const entries = Object.entries(tables);
  const files = [
    zipOf("20260930-export-etalab-data.zip", Object.fromEntries(entries.filter(([name]) => !REFERENCE_TABLES.has(name)))),
    zipOf("20260930-export-etalab-ref.zip", Object.fromEntries(entries.filter(([name]) => REFERENCE_TABLES.has(name)))),
  ];
  const release = { coveredSlices: DEPARTMENT_SLICES, files, publishedOn: "2026-09-30" };
  const records = await collect(parseRadioInstallations(reading.ctx, release, files));
  return { records, skips: reading.skips };
}

function fixtureTables(): Tables {
  return Object.fromEntries(readdirSync(FIXTURE_DIRECTORY).map((name) => [name, readFileSync(new URL(name, FIXTURE_DIRECTORY), "utf8")]));
}

function syntheticTables(overrides: Tables = {}): Tables {
  return {
    "SUP_EXPLOITANT.txt": "ADM_ID;ADM_LB_NOM\r\n23;ORANGE\r\n",
    "SUP_STATION.txt": "STA_NM_ANFR;ADM_ID\r\n0750000001;23\r\n0750000002;23\r\n0750000003;999\r\n",
    "SUP_SUPPORT.txt": `${SUPPORT_HEADER}\r\n1;0750000001;0;48;51;27;X;2;22;4;E;0;0;;;;;;\r\n3;0750000003;0;48;51;27;N;2;22;4;E;0;0;;;;;;\r\n`,
    "SUP_ANTENNE.txt": "STA_NM_ANFR;AER_ID;AER_FG_RAYON;AER_NB_AZIMUT;AER_NB_ALT_BAS\r\n",
    "SUP_EMETTEUR.txt":
      "EMR_ID;EMR_LB_SYSTEME;STA_NM_ANFR;AER_ID;EMR_DT_SERVICE\r\n1;LTE 800;0750000001;1;\r\n2;LTE 800;0750000002;2;\r\n3;LTE 800;0750000003;3;\r\n",
    ...overrides,
  };
}

const sector = (azimuth: number | null, antennaHeight: number) => ({ azimuth, antennaHeight, antennaPlacement: null });

void test("reads real tables: a permit per station and mobile system, with a sector per antenna, approved until a service date", async () => {
  const { records, skips } = await readRecords(fixtureTables());

  assert.deepEqual(
    records.map(({ site, permit }) => [site.ref, `${permit.label?.rat} ${permit.label?.mhz}`, permit.status]),
    [
      ["0062750603", "GSM 900", "in_service"],
      ["0062750603", "UMTS 900", "in_service"],
      ["0062750603", "LTE 2600", "in_service"],
      ["0222290197", "GSM 900", "in_service"],
      ["02A0990273", "UMTS 900", "in_service"],
      ["02A0990273", "LTE 700", "in_service"],
      ["02A0990273", "LTE 800", "approved"],
      ["0750990855", "LTE 1800", "in_service"],
      ["0512700375", "LTE 2100", "in_service"],
      ["0512700375", "LTE 1800", "in_service"],
      ["0512700375", "LTE 700", "in_service"],
      ["0512700375", "LTE 800", "in_service"],
      ["0512700375", "NR 2100", "in_service"],
      ["0512700375", "UMTS 900", "in_service"],
      ["0062751326", "LTE 1800", "in_service"],
      ["0180990320", "LTE 800", "approved"],
    ],
  );
  assert.deepEqual(records[6], {
    slice: "2A",
    location: {
      latitude: 41.963889,
      longitude: 9.191111,
      city: null,
      address: "MAISON FORESTIERE DE ST ANTOINE, 20134",
      regionIsoCode: "FR-COR",
      ref: "595159",
      precisionMeters: 31,
    },
    site: { siteId: null, licensee: "FREE MOBILE", name: null, ref: "02A0990273" },
    permit: { label: { rat: "LTE", mhz: 800, variant: "commercial" }, number: null, decisionType: null, expiresOn: null, status: "approved" },
    sectors: [sector(290, 23)],
  } satisfies SiteRecord);
  assert.deepEqual(skips, [
    ["06", "unknown_system"],
    ["971", "territory_not_imported"],
    ["971", "territory_not_imported"],
    ["971", "territory_not_imported"],
    ["971", "territory_not_imported"],
    ["51", "unknown_system"],
    ["971", "territory_not_imported"],
    ["971", "territory_not_imported"],
    ["01", "unknown_system"],
  ]);
});

void test("takes a sector's height as published, below ground too, and no azimuth for an omnidirectional antenna", async () => {
  const { records } = await readRecords(fixtureTables());
  const sectorsOf = (station: string) => records.find((record) => record.site.ref === station)?.sectors;

  assert.deepEqual(sectorsOf("0750990855"), [sector(350, -4.9)]);
  assert.deepEqual(sectorsOf("0062751326"), [sector(null, 9.5)]);
  assert.deepEqual(sectorsOf("0512700375"), [sector(170, 9.2)]);
});

void test("places a station on its first support, and west of Greenwich at a negative longitude", async () => {
  const { records } = await readRecords(fixtureTables());
  const locationOf = (station: string) => records.find((record) => record.site.ref === station)?.location;

  assert.equal(locationOf("0062750603")?.ref, "465774");
  assert.deepEqual(locationOf("0222290197"), {
    latitude: 48.486667,
    longitude: -2.9025,
    city: null,
    address: "Les Iles, zi, Société SIFDDA, 22170",
    regionIsoCode: "FR-BRE",
    ref: "411406",
    precisionMeters: 31,
  });
});

void test("skips a station whose support has broken coordinates, or that has no support or no known licensee", async () => {
  const { records, skips } = await readRecords(syntheticTables());

  assert.deepEqual(records, []);
  assert.deepEqual(skips, [
    ["75", "bad_coordinates"],
    ["75", "missing_identity"],
    ["75", "missing_identity"],
  ]);
});

void test("refuses a table without the columns it needs, naming the table and the columns", async () => {
  await assert.rejects(readRecords(syntheticTables({ "SUP_STATION.txt": "STA_NM_ANFR\r\n0750000001\r\n" })), /SUP_STATION\.txt has no column ADM_ID/);
});

void test("refuses a table that is not UTF-8 rather than store garbled addresses", async () => {
  const windows1252 = strToU8(`${SUPPORT_HEADER}\r\n3;0750000003;0;48;51;27;N;2;22;4;E;0;0;Château;;;;;\r\n`, true);

  await assert.rejects(readRecords(syntheticTables({ "SUP_SUPPORT.txt": windows1252 })), /SUP_SUPPORT\.txt is not UTF-8/);
});

void test("reads quoted fields with separators, doubled quotes and line breaks, across chunk borders", async () => {
  async function* chunksOf(text: string, size: number): AsyncGenerator<Uint8Array> {
    const bytes = new TextEncoder().encode(text);
    for (let start = 0; start < bytes.length; start += size) yield bytes.subarray(start, start + size);
  }
  const rows = await collect(readCsvRows(chunksOf('a;b;c\r\n"x;y";"say ""hi""";"two\nlines"\r\nplain;;last', 3)));

  assert.deepEqual(rows, [
    ["a", "b", "c"],
    ["x;y", 'say "hi"', "two\nlines"],
    ["plain", "", "last"],
  ]);
});

void test("reads GSM, UMTS, LTE and 5G NR systems, and none of the others", () => {
  assert.deepEqual(["GSM 900", "UMTS 2100", "LTE 700", "5G NR 3500", "FH", "LTE 2600 P", "5G NR 1400 Expe"].map(labelOfSystem), [
    { rat: "GSM", mhz: 900, variant: "commercial" },
    { rat: "UMTS", mhz: 2100, variant: "commercial" },
    { rat: "LTE", mhz: 700, variant: "commercial" },
    { rat: "NR", mhz: 3500, variant: "commercial" },
    null,
    null,
    null,
  ]);
});

void test("reads a department from a station number's first three characters", () => {
  assert.deepEqual(["003", "02A", "02B", "075", "974"].map(departmentOf), ["03", "2A", "2B", "75", "974"]);
  assert.equal(regionIsoCodeOf("2B"), "FR-COR");
  assert.equal(regionIsoCodeOf("974"), null);
});

void test("maps the four mainland operators and leaves the others unmapped", () => {
  assert.deepEqual(["ORANGE", "SFR", "FREE MOBILE", "BOUYGUES  TELECOM", "SRR"].map(operatorNameOfLicensee), [
    "Orange",
    "SFR",
    "Free",
    "Bouygues Telecom",
    null,
  ]);
  assert.equal(shortLicenseeName(" FREE MOBILE "), "Free");
  assert.equal(shortLicenseeName("DIGICEL"), "DIGICEL");
});

void test("finds the newest monthly export that has both its data and its reference archive", async () => {
  const folder = "https://static.data.gouv.fr/resources/donnees-sur-les-installations-radioelectriques-de-plus-de-5-watts-1";
  const resources = [
    { url: `${folder}/20261106-082445/20261031-export-etalab-data.zip` },
    { url: `${folder}/20261006-082451/20260930-export-etalab-ref.zip` },
    { url: `${folder}/20261006-082445/20260930-export-etalab-data.zip` },
    { url: `${folder}/20260906-082448/20260831-export-etalab-ref.zip` },
    { url: `${folder}/20260906-082442/20260831-export-etalab-data.zip` },
    { url: `${folder}/20190904-044845/2019-08-description-des-tables.pdf` },
  ];
  const reading = startReading({ html: JSON.stringify({ resources }) });

  assert.deepEqual(await discoverRadioInstallations(reading.ctx), [
    {
      coveredSlices: DEPARTMENT_SLICES,
      files: [
        { url: resources[2]!.url, fileName: "20260930-export-etalab-data.zip" },
        { url: resources[1]!.url, fileName: "20260930-export-etalab-ref.zip" },
      ],
      publishedOn: "2026-09-30",
    },
  ]);
  assert.deepEqual(
    reading.requests.map((request) => request.url),
    ["https://www.data.gouv.fr/api/1/datasets/donnees-sur-les-installations-radioelectriques-de-plus-de-5-watts-1/"],
  );
});
