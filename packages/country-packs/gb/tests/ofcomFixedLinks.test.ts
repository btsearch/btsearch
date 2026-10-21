import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { type LocalFile, WHOLE_DATASET_SLICE } from "../../core/sources.ts";
import { collect, startReading } from "../../pl/tests/sourceFixtures.ts";
import { REGISTER_URL, discoverFixedLinks } from "../sources/ofcom/discover.ts";
import { operatorNameOfLicensee, shortLicenseeName } from "../sources/ofcom/licensees.ts";
import { parseFixedLinks } from "../sources/ofcom/parse.ts";

const SAMPLE_PATH = fileURLToPath(new URL("fixtures/wtr-sample.csv", import.meta.url));
const RELEASE = { coveredSlices: [WHOLE_DATASET_SLICE], files: [{ url: REGISTER_URL, fileName: "WTR.csv" }], publishedOn: "2026-10-21" };

function registerFile(path: string): LocalFile {
  return { url: REGISTER_URL, fileName: "WTR.csv", path };
}

async function readLinks(file: LocalFile) {
  const reading = startReading();
  const records = await collect(parseFixedLinks(reading.ctx, RELEASE, [file]));
  return { records, skips: reading.skips };
}

void test("reads a link per direction of each fixed-link licence, pairing a transmitter with the receiver on its frequency", async () => {
  const { records, skips } = await readLinks(registerFile(SAMPLE_PATH));

  assert.deepEqual(
    records.map((record) => [record.permitNumber, record.freqKhz, record.tx.latitude, record.rx.latitude]),
    [
      ["0494479/5", 72_875_000, 51.56119898, 51.54048597],
      ["0494479/5", 82_875_000, 51.54048597, 51.56119898],
      ["1356919/1", 13_171_000, 51.20572533, 51.04185503],
      ["1404243/1", 82_875_000, 53.15893313, 53.18452591],
      ["1404243/1", 72_875_000, 53.18452591, 53.15893313],
    ],
  );
  assert.deepEqual(skips, [[WHOLE_DATASET_SLICE, "bad_coordinates"]]);
});

void test("takes a link's values from its two rows, the power in dBm and no expiry or decision type", async () => {
  const { records } = await readLinks(registerFile(SAMPLE_PATH));

  assert.deepEqual(records[0], {
    slice: WHOLE_DATASET_SLICE,
    licensee: "Vodafone Limited",
    permitNumber: "0494479/5",
    decisionType: null,
    issuedOn: "2006-01-24",
    expiresOn: null,
    tx: {
      longitude: 0.06883625,
      latitude: 51.56119898,
      groundHeight: 3,
      antennaHeight: 25,
      city: null,
      province: null,
      street: null,
      locationDescription: null,
    },
    rx: {
      longitude: 0.08068815,
      latitude: 51.54048597,
      groundHeight: 11,
      antennaHeight: 42,
      city: null,
      province: null,
      street: null,
      locationDescription: null,
    },
    freqKhz: 72_875_000,
    channelNumber: null,
    channelWidthMhz: 500,
    polarization: "V",
    eirpDbm: 59.1,
    technical: {
      txAntenna: { type: "HAE8003_36", manufacturer: null },
      txAntennaGain: 47,
      rxAntenna: { type: "HAE8003_36", manufacturer: null },
      rxAntennaGain: 47,
    },
    publishesEveryTechnicalColumn: false,
  });
  assert.equal(records[2]?.tx.groundHeight, null);
});

void test("skips a transmitter or receiver whose other end the licence does not have", async () => {
  const [header = "", ...rows] = readFileSync(SAMPLE_PATH, "utf8").split("\n");
  const path = join(mkdtempSync(join(tmpdir(), "ofcom-")), "WTR.csv");
  writeFileSync(path, [header, ...rows.filter((row) => row.startsWith("1404243/1") && !row.includes(",72875000000,R,"))].join("\n"));
  const { records, skips } = await readLinks(registerFile(path));

  assert.deepEqual(
    records.map((record) => record.freqKhz),
    [82_875_000],
  );
  assert.deepEqual(skips, [[WHOLE_DATASET_SLICE, "unpaired_link"]]);
});

void test("maps the mobile operators' companies, and shortens every other name to the company without its form", () => {
  assert.deepEqual(["Telefonica UK Limited", "Vodafone Limited", "EE Limited", "Hutchison 3G UK Limited"].map(operatorNameOfLicensee), [
    "O2",
    "Vodafone",
    "EE",
    "Three",
  ]);
  assert.equal(operatorNameOfLicensee("MOBILE BROADBAND NETWORK LIMITED"), null);
  assert.deepEqual(["MOBILE BROADBAND NETWORK LIMITED", "Arqiva  Ltd", "Telefónica UK Limited"].map(shortLicenseeName), [
    "MOBILE BROADBAND NETWORK",
    "Arqiva",
    "O2",
  ]);
});

void test("offers the register as one release, dated by its Last-Modified day", async () => {
  const requests: { url: string; method: string | undefined }[] = [];
  const { ctx } = startReading();
  const releases = await discoverFixedLinks({
    ...ctx,
    fetch: (input, init) => {
      requests.push({ url: input.toString(), method: init?.method });
      return Promise.resolve(new Response(null, { headers: { "last-modified": "Wed, 21 Oct 2026 07:45:03 GMT" } }));
    },
  });

  assert.deepEqual(releases, [RELEASE]);
  assert.deepEqual(requests, [{ url: REGISTER_URL, method: "HEAD" }]);
});
