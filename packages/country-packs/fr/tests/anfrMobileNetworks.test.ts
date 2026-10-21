import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { SiteRecord } from "../../core/sources.ts";
import { collect, startReading, writeArchive } from "../../pl/tests/sourceFixtures.ts";
import { readCsvRows } from "../sources/anfr/csv.ts";
import { DEPARTMENT_SLICES, departmentOf, regionIsoCodeOf } from "../sources/anfr/departments.ts";
import { discoverMobileNetworks } from "../sources/anfr/discover.ts";
import { operatorNameOfLicensee, shortLicenseeName } from "../sources/anfr/licensees.ts";
import { labelOfSystem, parseAzimuths, parseCoordinates, parseMobileNetworks } from "../sources/anfr/parse.ts";

const SAMPLE_PATH = new URL("fixtures/observatoireod-sample.csv", import.meta.url);
const HEADER =
  "id;adm_lb_nom;sup_id;emr_lb_systeme;emr_dt;sta_nm_dpt;code_insee;generation;date_maj;sta_nm_anfr;nat_id;sup_nm_haut;tpo_id;" +
  "adr_lb_lieu;adr_lb_add1;adr_lb_add2;adr_lb_add3;adr_nm_cp;com_cd_insee;coordonnees;coord;statut;list_azimut";

function line(values: Partial<Record<string, string>>): string {
  return HEADER.split(";")
    .map((column) => {
      const value = values[column] ?? "";
      return /[;"\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    })
    .join(";");
}

async function* chunksOf(text: string, size: number): AsyncGenerator<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  for (let start = 0; start < bytes.length; start += size) yield bytes.subarray(start, start + size);
}

async function readRecords(csv: string) {
  const reading = startReading();
  const file = writeArchive("observatoireod-20261015-observatoire-2g-3g-4g-5g.zip", { "observatoireod_20261015.csv": csv });
  const release = { coveredSlices: DEPARTMENT_SLICES, files: [{ url: file.url, fileName: file.fileName }], publishedOn: "2026-10-15" };
  const records = await collect(parseMobileNetworks(reading.ctx, release, [file]));
  return { records, skips: reading.skips };
}

void test("reads the real weekly file: a site per station on its first support, a permit per system, overseas rows skipped", async () => {
  const { records, skips } = await readRecords(readFileSync(SAMPLE_PATH, "utf8"));

  assert.equal(records.length, 20);
  assert.deepEqual(
    skips,
    Array.from({ length: 7 }, () => ["974", "territory_not_imported"]),
  );
  assert.deepEqual(records[0], {
    slice: "03",
    location: {
      latitude: 46.1775,
      longitude: 3.374167,
      city: null,
      address: "LE BOUCHEREAUD, rte de vendat, 03110",
      regionIsoCode: "FR-ARA",
      ref: "23444",
      precisionMeters: 31,
    },
    site: { siteId: null, licensee: "BOUYGUES TELECOM", name: null, ref: "0032750221" },
    permit: { label: { rat: "NR", mhz: 2100, variant: "commercial" }, number: null, decisionType: null, expiresOn: null },
    sectors: [{ azimuth: 90, elevation: null, antennaHeight: null, antennaPlacement: null }],
  } satisfies SiteRecord);

  const supportsOfTwiceListedStation = records.filter((record) => record.site.ref === "0342750629").map((record) => record.location.ref);
  assert.deepEqual(new Set(supportsOfTwiceListedStation), new Set(["429597"]));
});

void test("skips bad coordinates, unknown systems, unknown departments and rows without an identity, each under its slice", async () => {
  const rows = [
    line({ adm_lb_nom: "ORANGE", sup_id: "2", emr_lb_systeme: "LTE 800", sta_nm_dpt: "02A", sta_nm_anfr: "0200000001", coordonnees: "x" }),
    line({
      adm_lb_nom: "ORANGE",
      sup_id: "3",
      emr_lb_systeme: "WIMAX 3500",
      sta_nm_dpt: "075",
      sta_nm_anfr: "0750000001",
      coordonnees: "48.8 , 2.3",
    }),
    line({ adm_lb_nom: "SFR", sup_id: "4", emr_lb_systeme: "LTE 800", sta_nm_dpt: "999", sta_nm_anfr: "9990000001", coordonnees: "48.8 , 2.3" }),
    line({ adm_lb_nom: "", sup_id: "5", emr_lb_systeme: "LTE 800", sta_nm_dpt: "075", sta_nm_anfr: "0750000002", coordonnees: "48.8 , 2.3" }),
  ];
  const { records, skips } = await readRecords(`${HEADER}\n${rows.join("\n")}`);

  assert.deepEqual(records, []);
  assert.deepEqual(skips, [
    ["2A", "bad_coordinates"],
    ["75", "unknown_system"],
    ["other", "territory_not_imported"],
    ["75", "missing_identity"],
  ]);
});

void test("refuses a file without the columns it needs, naming them", async () => {
  await assert.rejects(readRecords("id;adm_lb_nom;sup_id\n1;ORANGE;2\n"), /no column emr_lb_systeme, sta_nm_dpt, sta_nm_anfr, coordonnees/);
});

void test("reads quoted fields with separators, doubled quotes and line breaks, across chunk borders", async () => {
  const csv = 'a;b;c\r\n"x;y";"say ""hi""";"two\nlines"\r\nplain;;last';
  const rows = await collect(readCsvRows(chunksOf(csv, 3)));

  assert.deepEqual(rows, [
    ["a", "b", "c"],
    ["x;y", 'say "hi"', "two\nlines"],
    ["plain", "", "last"],
  ]);
});

void test("detects a comma-separated file from its header", async () => {
  const rows = await collect(readCsvRows(chunksOf('sup_id,coordonnees\n1,"46.1 , 3.3"\n', 4)));

  assert.deepEqual(rows, [
    ["sup_id", "coordonnees"],
    ["1", "46.1 , 3.3"],
  ]);
});

void test("reads each technology of the file's systems, 5G NR as NR, and nothing else", () => {
  assert.deepEqual(["GSM 900", "UMTS 2100", "LTE 700", "5G NR 3500", "FH 18 GHz"].map(labelOfSystem), [
    { rat: "GSM", mhz: 900, variant: "commercial" },
    { rat: "UMTS", mhz: 2100, variant: "commercial" },
    { rat: "LTE", mhz: 700, variant: "commercial" },
    { rat: "NR", mhz: 3500, variant: "commercial" },
    null,
  ]);
});

void test("parses coordinates, azimuth lists and departments as the file writes them", () => {
  assert.deepEqual(parseCoordinates("-21.019166666666667 , 55.30416666666667"), { latitude: -21.019167, longitude: 55.304167 });
  assert.equal(parseCoordinates("46.1"), null);
  assert.equal(parseCoordinates("91 , 3"), null);
  assert.deepEqual(
    parseAzimuths("0|120|240|").map((sector) => sector.azimuth),
    [0, 120, 240],
  );
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

void test("finds the newest weekly file in the data.gouv.fr dataset", async () => {
  const resources = [
    { url: "https://static.data.gouv.fr/resources/donnees-sur-les-reseaux-mobiles/20261008-1/observatoireod-20261008-observatoire-2g-3g-4g-5g.zip" },
    { url: "https://static.data.gouv.fr/resources/donnees-sur-les-reseaux-mobiles/20261015-1/observatoireod-20261015-observatoire-2g-3g-4g-5g.zip" },
    { url: "https://static.data.gouv.fr/resources/donnees-sur-les-reseaux-mobiles/20261015-2/notice.pdf" },
  ];
  const reading = startReading({ html: JSON.stringify({ resources }) });

  assert.deepEqual(await discoverMobileNetworks(reading.ctx), [
    {
      coveredSlices: DEPARTMENT_SLICES,
      files: [{ url: resources[1]!.url, fileName: "observatoireod-20261015-observatoire-2g-3g-4g-5g.zip" }],
      publishedOn: "2026-10-15",
    },
  ]);
  assert.deepEqual(
    reading.requests.map((request) => request.url),
    ["https://www.data.gouv.fr/api/1/datasets/donnees-sur-les-reseaux-mobiles/"],
  );
});
