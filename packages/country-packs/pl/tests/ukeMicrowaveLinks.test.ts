import assert from "node:assert/strict";
import test from "node:test";

import { type LocalFile, type MicrowaveLinkRecord, WHOLE_DATASET_SLICE } from "../../core/sources.ts";
import { parseMicrowaveLinks } from "../sources/uke/microwave-links/parse.ts";
import { type Reading, collect, releaseCovering, startReading, writeWorkbook } from "./sourceFixtures.ts";

const FILE_NAME = "linie_radiowe_-_stan_na_2026-09-25.xlsx";

const LINK: Record<string, unknown> = {
  "L.p.": 1,
  Dl_geo_Tx: "21E00'44''",
  Sz_geo_Tx: "52N13'47''",
  "H_t_Tx [m npm]": 110,
  "Miejscowość Tx": " Warszawa ",
  "Województwo Tx": "mazowieckie",
  "Ulica Tx": "Prosta 1",
  "Opis położenia Tx": "dach",
  Dl_geo_Rx: "21E30'00''",
  Sz_geo_Rx: "52N18'00''",
  "H_t_Rx [m npm]": "95",
  "Miejscowość Rx": "Marki",
  "Województwo Rx": "mazowieckie",
  "Ulica Rx": null,
  "Opis położenia Rx": "maszt",
  "f [GHz]": 23.058,
  Nr_kan: 5,
  Symbol_planu: " 23A28 ",
  "Szer_kan [MHz]": 28,
  Polaryzacja: " H ",
  "Rodz_modu-lacji": " 128QAM ",
  "Przepływność [Mb/s]": 155,
  "EIRP [dBm]": 48.5,
  "Tłum_ant_odb_Rx [dB]": 1.5,
  Typ_nad: " RTN 950 ",
  Prod_nad: " Huawei ",
  "Liczba_szum_Rx [dB]": 6,
  "Tłum_ATPC [dB]": 10,
  Typ_ant_Tx: "VHLP2-23",
  Prod_ant_Tx: "Andrew",
  "Zysk_ant_Tx [dBi]": 40.2,
  "H_ant_Tx [m npt]": 32,
  Typ_ant_Rx: "A23S06HAC",
  Prod_ant_Rx: null,
  "Zysk_ant_Rx [dBi]": "35.5",
  "H_ant_Rx [m npt]": 28.5,
  Operator: "  Orange Polska S.A. ",
  "Nr_pozw/dec": " RRL/A/0001/2025 ",
  Rodz_dec: "zmP",
  Data_wydania: 45658,
  "Data_ważn_pozw/dec": "31-12-2030",
};

const HEADER = Object.keys(LINK);

const TECHNICAL_FIELD_COLUMNS: [field: keyof MicrowaveLinkRecord["technical"], column: string][] = [
  ["modulationType", "Rodz_modu-lacji"],
  ["bandwidth", "Przepływność [Mb/s]"],
  ["txAntennaAttenuation", "Tłum_ant_odb_Rx [dB]"],
  ["transmitter", "Typ_nad"],
  ["txAntenna", "Typ_ant_Tx"],
  ["txAntennaGain", "Zysk_ant_Tx [dBi]"],
  ["rxAntenna", "Typ_ant_Rx"],
  ["rxAntennaGain", "Zysk_ant_Rx [dBi]"],
  ["rxNoiseFigure", "Liczba_szum_Rx [dB]"],
  ["rxAtpcAttenuation", "Tłum_ATPC [dB]"],
];
const MANUFACTURER_COLUMNS = new Set(["Prod_nad", "Prod_ant_Tx", "Prod_ant_Rx"]);
const REQUIRED_COLUMNS = HEADER.filter(
  (header) => !MANUFACTURER_COLUMNS.has(header) && TECHNICAL_FIELD_COLUMNS.every(([, column]) => column !== header),
);

function linksFile(links: readonly Record<string, unknown>[], header: readonly string[] = HEADER): LocalFile {
  return writeWorkbook(FILE_NAME, [[header, ...links.map((link) => header.map((column) => link[column]))]]);
}

async function readLinks(
  links: readonly Record<string, unknown>[],
  header: readonly string[] = HEADER,
): Promise<{ records: MicrowaveLinkRecord[]; reading: Reading }> {
  const reading = startReading();
  const file = linksFile(links, header);

  return { records: await collect(parseMicrowaveLinks(reading.ctx, releaseCovering(WHOLE_DATASET_SLICE, file), [file])), reading };
}

void test("microwave links: a row is one record with every published column", async () => {
  const { records, reading } = await readLinks([LINK]);

  assert.deepEqual(records, [
    {
      slice: WHOLE_DATASET_SLICE,
      licensee: "Orange Polska S.A.",
      permitNumber: "RRL/A/0001/2025",
      decisionType: "permit_change",
      issuedOn: "2025-01-01",
      expiresOn: "2030-12-31",
      tx: {
        longitude: 21.012222,
        latitude: 52.229722,
        groundHeight: 110,
        antennaHeight: 32,
        city: "Warszawa",
        province: "mazowieckie",
        street: "Prosta 1",
        locationDescription: "dach",
      },
      rx: {
        longitude: 21.5,
        latitude: 52.3,
        groundHeight: 95,
        antennaHeight: 28.5,
        city: "Marki",
        province: "mazowieckie",
        street: null,
        locationDescription: "maszt",
      },
      freqKhz: 23_058_000,
      channelNumber: 5,
      channelWidthMhz: 28,
      polarization: "H",
      eirpDbm: 48.5,
      technical: {
        modulationType: "128QAM",
        bandwidth: "155",
        txAntennaAttenuation: 1.5,
        transmitter: { type: "RTN 950", manufacturer: "Huawei" },
        txAntenna: { type: "VHLP2-23", manufacturer: "Andrew" },
        txAntennaGain: 40.2,
        rxAntenna: { type: "A23S06HAC", manufacturer: null },
        rxAntennaGain: 35.5,
        rxNoiseFigure: 6,
        rxAtpcAttenuation: 10,
      },
      publishesEveryTechnicalColumn: true,
      planSymbol: "23A28",
    },
  ]);
  assert.deepEqual(reading.logs, []);
  assert.deepEqual(reading.skips, []);
});

void test("microwave links: an unreadable value never drops the row", async () => {
  const empty = Object.fromEntries(HEADER.map((header) => [header, null]));
  const { records, reading } = await readLinks([
    { ...empty, "L.p.": 2 },
    {
      ...LINK,
      Dl_geo_Tx: "21E00'44,5''",
      Sz_geo_Rx: 52.3,
      "H_t_Tx [m npm]": "wysoko",
      "H_ant_Tx [m npt]": 0,
      "f [GHz]": "23,5",
      Nr_kan: "7",
      "Szer_kan [MHz]": 0,
      "EIRP [dBm]": "duże",
      Rodz_dec: "zmP ",
      Operator: "   ",
      "Przepływność [Mb/s]": " 155 ",
      "Zysk_ant_Tx [dBi]": 0,
      Typ_nad: 0,
      Prod_nad: 950,
    },
    { ...LINK, "f [GHz]": "abc", Rodz_dec: "P", Data_wydania: "bezterminowo", "Przepływność [Mb/s]": "" },
  ]);
  const [emptyLink, ...otherLinks] = records;
  const readings = otherLinks.map((record) => [
    record.tx.longitude,
    record.rx.latitude,
    record.tx.groundHeight,
    record.tx.antennaHeight,
    record.freqKhz,
    record.channelNumber,
    record.channelWidthMhz,
    record.eirpDbm,
    record.decisionType,
    record.licensee,
    record.issuedOn,
    record.technical.bandwidth,
    record.technical.txAntennaGain,
    record.technical.transmitter,
  ]);

  assert.deepEqual(emptyLink, {
    slice: WHOLE_DATASET_SLICE,
    licensee: null,
    permitNumber: "",
    decisionType: "permit",
    issuedOn: null,
    expiresOn: null,
    tx: { longitude: 0, latitude: 0, groundHeight: null, antennaHeight: null, city: null, province: null, street: null, locationDescription: null },
    rx: { longitude: 0, latitude: 0, groundHeight: null, antennaHeight: null, city: null, province: null, street: null, locationDescription: null },
    freqKhz: 0,
    channelNumber: null,
    channelWidthMhz: null,
    polarization: null,
    eirpDbm: null,
    technical: {
      modulationType: null,
      bandwidth: null,
      txAntennaAttenuation: null,
      transmitter: { type: null, manufacturer: null },
      txAntenna: { type: null, manufacturer: null },
      txAntennaGain: null,
      rxAntenna: { type: null, manufacturer: null },
      rxAntennaGain: null,
      rxNoiseFigure: null,
      rxAtpcAttenuation: null,
    },
    publishesEveryTechnicalColumn: true,
    planSymbol: null,
  });
  assert.deepEqual(readings, [
    [0, 0, null, null, 23_000_000, 7, null, null, "permit", null, "2025-01-01", " 155 ", null, { type: null, manufacturer: "950" }],
    [21.012222, 52.3, 110, 32, 0, 5, 28, 48.5, "permit", "Orange Polska S.A.", "2026-10-12", "", 40.2, { type: "RTN 950", manufacturer: "Huawei" }],
  ]);
  assert.deepEqual(reading.skips, []);
});

void test("microwave links: the plan symbol is a text, the 23A56 exported as 1, or left alone", async () => {
  const exportedAsOne = { ...LINK, Symbol_planu: 1, "Szer_kan [MHz]": 56 };
  const { records } = await readLinks([
    { ...LINK, Symbol_planu: " 18A55 " },
    { ...LINK, Symbol_planu: "   " },
    { ...LINK, Symbol_planu: null },
    { ...LINK, Symbol_planu: true },
    { ...exportedAsOne, "f [GHz]": 22 },
    { ...exportedAsOne, "f [GHz]": 23.6 },
    { ...exportedAsOne, "f [GHz]": 21.999 },
    { ...exportedAsOne, "f [GHz]": 23.601 },
    { ...exportedAsOne, "Szer_kan [MHz]": 28 },
    { ...exportedAsOne, Symbol_planu: 2 },
  ]);
  const planSymbols = records.map((record) => ("planSymbol" in record ? record.planSymbol : "left alone"));

  assert.deepEqual(planSymbols, ["18A55", null, null, null, "23A56", "23A56", "left alone", "left alone", "left alone", "left alone"]);
});

void test("microwave links: a missing technical column leaves its field out and is logged", async () => {
  const cases = TECHNICAL_FIELD_COLUMNS.map(async ([field, column]) => {
    const { records, reading } = await readLinks(
      [LINK],
      HEADER.filter((header) => header !== column),
    );
    const [record] = records;
    const remainingFields = TECHNICAL_FIELD_COLUMNS.map(([remainingField]) => remainingField).filter((remainingField) => remainingField !== field);

    assert.deepEqual(Object.keys(record?.technical ?? {}), remainingFields, column);
    assert.equal(record?.publishesEveryTechnicalColumn, false, column);
    assert.deepEqual(reading.logs, [`Workbook "${FILE_NAME}" is missing technical columns: ${column}`]);
  });

  await Promise.all(cases);
});

void test("microwave links: a missing manufacturer column keeps the equipment's type and clears the flag", async () => {
  const { records, reading } = await readLinks(
    [LINK],
    HEADER.filter((header) => !MANUFACTURER_COLUMNS.has(header)),
  );
  const [record] = records;

  assert.equal(Object.keys(record?.technical ?? {}).length, TECHNICAL_FIELD_COLUMNS.length);
  assert.deepEqual(record?.technical.transmitter, { type: "RTN 950", manufacturer: null });
  assert.deepEqual(record?.technical.txAntenna, { type: "VHLP2-23", manufacturer: null });
  assert.deepEqual(record?.technical.rxAntenna, { type: "A23S06HAC", manufacturer: null });
  assert.equal(record?.publishesEveryTechnicalColumn, false);
  assert.deepEqual(reading.logs, [`Workbook "${FILE_NAME}" is missing technical columns: Prod_nad, Prod_ant_Tx, Prod_ant_Rx`]);
});

void test("microwave links: a file without any technical column still gives every link", async () => {
  const { records, reading } = await readLinks([LINK, LINK], REQUIRED_COLUMNS);
  const readings = records.map((record) => [record.permitNumber, record.technical, record.publishesEveryTechnicalColumn]);

  assert.deepEqual(readings, [
    ["RRL/A/0001/2025", {}, false],
    ["RRL/A/0001/2025", {}, false],
  ]);
  assert.equal(reading.logs.length, 1);
});

void test("microwave links: a file without a required column fails, naming the file and the column", async () => {
  assert.equal(REQUIRED_COLUMNS.length, 28);

  const reading = startReading();
  const withoutColumns = linksFile(
    [LINK],
    HEADER.filter((header) => header !== "L.p." && header !== "Data_ważn_pozw/dec"),
  );
  const empty = writeWorkbook("linie_radiowe_puste.xlsx", [[]]);

  await assert.rejects(collect(parseMicrowaveLinks(reading.ctx, releaseCovering(WHOLE_DATASET_SLICE, withoutColumns), [withoutColumns])), {
    message: `Workbook "${FILE_NAME}" is missing required columns: "L.p.", "Data_ważn_pozw/dec"`,
  });
  await assert.rejects(collect(parseMicrowaveLinks(reading.ctx, releaseCovering(WHOLE_DATASET_SLICE, empty), [empty])), {
    message: `Workbook "linie_radiowe_puste.xlsx" is missing required columns: ${REQUIRED_COLUMNS.map((column) => `"${column}"`).join(", ")}`,
  });
});
