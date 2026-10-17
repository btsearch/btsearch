import assert from "node:assert/strict";
import test from "node:test";

import { WHOLE_DATASET_SLICE } from "../../core/sources.ts";
import { discoverDeviceRegistry } from "../sources/uke/device-registry/discover.ts";
import { discoverMicrowaveLinks } from "../sources/uke/microwave-links/discover.ts";
import { discoverPermits } from "../sources/uke/permits/discover.ts";
import { filesPage, startReading } from "./sourceFixtures.ts";

const PERMITS_PAGE = "https://bip.uke.gov.pl/pozwolenia-radiowe/wykaz-pozwolen-radiowych-tresci/stacje-gsm-umts-lte-5gnr-oraz-cdma,12,0.html";
const DEVICE_REGISTRY_PAGE = "https://bip.uke.gov.pl/pozwolenia-radiowe/rejestr-urzadzen/";
const MICROWAVE_LINKS_PAGE = "https://bip.uke.gov.pl/pozwolenia-radiowe/wykaz-pozwolen-radiowych-tresci/linie-radiowe,7.html";
const DOWNLOADS = "https://bip.uke.gov.pl/download/gfx/bip/pl/defaultaktualnosci/12/1/1";

const DISCOVERERS = [discoverPermits, discoverDeviceRegistry, discoverMicrowaveLinks];

void test("permits: one release per file, its band label read from the link text", async () => {
  const reading = startReading({
    html: filesPage([
      ["/download/gfx/bip/pl/defaultaktualnosci/12/1/1/gsm900_-_stan_na_2026-09-25.xlsx", "  gsm900 - stan na 2026-09-25 plik XLSX  "],
      [`${DOWNLOADS}/5g3600_-_stan_na_2026-09-25.XLSX`, "5g3600 - stan na 2026-09-25 plik XLSX"],
      ["gsm-r.xlsx", "GSM-R - stan na 2026-09-25 plik XLSX"],
      ["/download/opis.pdf", "lte800 - opis pliku"],
      ["/download/iot800_-_stan_na_2026-09-25.xlsx", "  iot800 - stan na 2026-09-25 plik XLSX  "],
      ["/download/lte800_-_stan_na_2026-09-25.xlsx", ""],
    ]),
  });

  assert.deepEqual(await discoverPermits(reading.ctx), [
    {
      coveredSlices: ["GSM:900:commercial"],
      files: [{ url: `${DOWNLOADS}/gsm900_-_stan_na_2026-09-25.xlsx`, fileName: "gsm900_-_stan_na_2026-09-25.xlsx" }],
      publishedOn: "2026-09-25",
    },
    {
      coveredSlices: ["NR:3500:commercial"],
      files: [{ url: `${DOWNLOADS}/5g3600_-_stan_na_2026-09-25.XLSX`, fileName: "5g3600_-_stan_na_2026-09-25.XLSX" }],
      publishedOn: "2026-09-25",
    },
    {
      coveredSlices: ["GSM:900:railway"],
      files: [{ url: "https://bip.uke.gov.pl/pozwolenia-radiowe/wykaz-pozwolen-radiowych-tresci/gsm-r.xlsx", fileName: "gsm-r.xlsx" }],
      publishedOn: null,
    },
  ]);
  assert.deepEqual(reading.logs, [
    "Could not parse band from file label: iot800 - stan na 2026-09-25 plik XLSX",
    "Could not parse band from file label: ",
  ]);
  assert.deepEqual(reading.requests, [{ url: PERMITS_PAGE, signal: reading.ctx.signal }]);
});

void test("device registry: one release per file, its operator read from the file name", async () => {
  const reading = startReading({
    html: filesPage([
      [`${DOWNLOADS}/2026-09-18_orange.xlsx`, "Orange plik XLSX"],
      ["2026-09-19_T-Mobile.xlsx", "T-Mobile plik XLSX"],
      ["2026-09-18_p4.xlsx", ""],
      ["2026-09-18_polkomtel.xlsx", "Polkomtel plik XLSX"],
      ["2026-09-18_aero2.xlsx", "Aero2 plik XLSX"],
      ["orange.xlsx", "Orange plik XLSX"],
      ["2026-09-18_orange.pdf", "Orange opis"],
    ]),
  });

  assert.deepEqual(await discoverDeviceRegistry(reading.ctx), [
    {
      coveredSlices: ["orange"],
      files: [{ url: `${DOWNLOADS}/2026-09-18_orange.xlsx`, fileName: "2026-09-18_orange.xlsx" }],
      publishedOn: "2026-09-18",
    },
    {
      coveredSlices: ["t-mobile"],
      files: [{ url: `${DEVICE_REGISTRY_PAGE}2026-09-19_T-Mobile.xlsx`, fileName: "2026-09-19_T-Mobile.xlsx" }],
      publishedOn: "2026-09-19",
    },
    {
      coveredSlices: ["p4"],
      files: [{ url: `${DEVICE_REGISTRY_PAGE}2026-09-18_p4.xlsx`, fileName: "2026-09-18_p4.xlsx" }],
      publishedOn: "2026-09-18",
    },
    {
      coveredSlices: ["polkomtel"],
      files: [{ url: `${DEVICE_REGISTRY_PAGE}2026-09-18_polkomtel.xlsx`, fileName: "2026-09-18_polkomtel.xlsx" }],
      publishedOn: "2026-09-18",
    },
  ]);
  assert.deepEqual(reading.logs, [
    'Unknown operator key "aero2" in file name: 2026-09-18_aero2.xlsx',
    'Unknown operator key "" in file name: orange.xlsx',
  ]);
  assert.deepEqual(reading.requests, [{ url: DEVICE_REGISTRY_PAGE, signal: reading.ctx.signal }]);
});

void test("microwave links: one release, the file with the newest date in its name", async () => {
  const reading = startReading({
    html: filesPage([
      ["/download/linie_radiowe_-_stan_na_2026-08-25.xlsx", "Linie radiowe - stan na 2026-08-25 plik XLSX"],
      ["/download/linie_radiowe_-_stan_na_2026-09-25.xlsx", "Linie radiowe - stan na 2026-09-25 plik XLSX"],
      ["/download/linie_radiowe.xlsx", "Linie radiowe plik XLSX"],
      ["/download/linie_radiowe_-_kopia_2026-09-25.xlsx", "Linie radiowe - kopia plik XLSX"],
    ]),
  });

  assert.deepEqual(await discoverMicrowaveLinks(reading.ctx), [
    {
      coveredSlices: [WHOLE_DATASET_SLICE],
      files: [
        { url: "https://bip.uke.gov.pl/download/linie_radiowe_-_stan_na_2026-09-25.xlsx", fileName: "linie_radiowe_-_stan_na_2026-09-25.xlsx" },
      ],
      publishedOn: "2026-09-25",
    },
  ]);
  assert.deepEqual(reading.requests, [{ url: MICROWAVE_LINKS_PAGE, signal: reading.ctx.signal }]);
});

void test("microwave links: the first listed file when no name has a date", async () => {
  const reading = startReading({
    html: filesPage([
      ["/download/linie_radiowe.xlsx", "Linie radiowe"],
      ["/download/starsze.xlsx", "Starsze"],
    ]),
  });

  assert.deepEqual(await discoverMicrowaveLinks(reading.ctx), [
    {
      coveredSlices: [WHOLE_DATASET_SLICE],
      files: [{ url: "https://bip.uke.gov.pl/download/linie_radiowe.xlsx", fileName: "linie_radiowe.xlsx" }],
      publishedOn: null,
    },
  ]);
});

void test("a page that does not answer 2xx fails the discovery", async () => {
  const attempts = DISCOVERERS.flatMap((discover) => [404, 500, 503].map((status) => ({ discover, status })));

  await Promise.all(
    attempts.map(({ discover, status }) => {
      const reading = startReading({ html: filesPage([["2026-09-18_orange.xlsx", "lte800 - stan"]]), status });

      return assert.rejects(discover(reading.ctx), new RegExp(`answered HTTP ${status}`), `${discover.name} ${status}`);
    }),
  );
});

void test("a page without a usable file fails the discovery", async () => {
  const withoutLinks = [filesPage([]), "", filesPage([["/download/opis.pdf", "lte800 - opis"]])];
  const withoutUsableLinks = [...withoutLinks, filesPage([["/download/plik.xlsx", "plik XLSX"]])];
  const attempts = [
    ...withoutUsableLinks.map((html) => ({ discover: discoverPermits, html })),
    ...withoutUsableLinks.map((html) => ({ discover: discoverDeviceRegistry, html })),
    ...withoutLinks.map((html) => ({ discover: discoverMicrowaveLinks, html })),
  ];

  await Promise.all(
    attempts.map(({ discover, html }) => assert.rejects(discover(startReading({ html }).ctx), /lists no usable file/, discover.name)),
  );
});
