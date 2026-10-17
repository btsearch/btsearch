import {
  type LocalFile,
  type MicrowaveLinkEnd,
  type MicrowaveLinkEquipment,
  type MicrowaveLinkRecord,
  type MicrowaveLinkTechnicalValues,
  type ReadContext,
  type Release,
  WHOLE_DATASET_SLICE,
} from "../../../../core/sources.ts";
import { parseDmsCoordinate } from "../shared/coordinates.ts";
import { parseExcelDay } from "../shared/dates.ts";
import { type SheetRow, type SheetValue, readFirstSheet, trimmedText, trimmedTextOrNull } from "../shared/sheets.ts";

const REQUIRED_COLUMNS = [
  "L.p.",
  "Dl_geo_Tx",
  "Sz_geo_Tx",
  "H_t_Tx [m npm]",
  "Miejscowość Tx",
  "Województwo Tx",
  "Ulica Tx",
  "Opis położenia Tx",
  "Dl_geo_Rx",
  "Sz_geo_Rx",
  "H_t_Rx [m npm]",
  "Miejscowość Rx",
  "Województwo Rx",
  "Ulica Rx",
  "Opis położenia Rx",
  "f [GHz]",
  "Nr_kan",
  "Symbol_planu",
  "Szer_kan [MHz]",
  "Polaryzacja",
  "EIRP [dBm]",
  "H_ant_Tx [m npt]",
  "H_ant_Rx [m npt]",
  "Operator",
  "Nr_pozw/dec",
  "Rodz_dec",
  "Data_wydania",
  "Data_ważn_pozw/dec",
];

const TECHNICAL_COLUMNS = [
  "Rodz_modu-lacji",
  "Przepływność [Mb/s]",
  "Tłum_ant_odb_Rx [dB]",
  "Typ_nad",
  "Prod_nad",
  "Liczba_szum_Rx [dB]",
  "Tłum_ATPC [dB]",
  "Typ_ant_Tx",
  "Prod_ant_Tx",
  "Zysk_ant_Tx [dBi]",
  "Typ_ant_Rx",
  "Prod_ant_Rx",
  "Zysk_ant_Rx [dBi]",
] as const;

type TechnicalColumn = (typeof TECHNICAL_COLUMNS)[number];
type TechnicalField = keyof MicrowaveLinkTechnicalValues;
type TechnicalCoverage = { omittedFields: readonly TechnicalField[]; publishesEveryColumn: boolean };

const TECHNICAL_FIELD_COLUMNS: readonly (readonly [field: TechnicalField, column: TechnicalColumn])[] = [
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

function nonZeroNumberOrNull(value: SheetValue): number | null {
  return Number(String(value || "")) || null;
}

function parsePlanSymbol(value: SheetValue, freqMhz: number, channelWidthMhz: number | null): string | null | undefined {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value !== "number") return null;

  const is23A56ExportedAsOne = value === 1 && channelWidthMhz === 56 && freqMhz >= 22_000 && freqMhz <= 23_600;
  return is23A56ExportedAsOne ? "23A56" : undefined;
}

function readEnd(row: SheetRow, end: "Tx" | "Rx"): MicrowaveLinkEnd {
  return {
    longitude: parseDmsCoordinate(row[`Dl_geo_${end}`]) ?? 0,
    latitude: parseDmsCoordinate(row[`Sz_geo_${end}`]) ?? 0,
    groundHeight: Number(row[`H_t_${end} [m npm]`]) || 0,
    antennaHeight: Number(row[`H_ant_${end} [m npt]`]) || null,
    city: trimmedTextOrNull(row[`Miejscowość ${end}`]),
    province: trimmedTextOrNull(row[`Województwo ${end}`]),
    street: trimmedTextOrNull(row[`Ulica ${end}`]),
    locationDescription: trimmedTextOrNull(row[`Opis położenia ${end}`]),
  };
}

function readEquipment(row: SheetRow, typeColumn: TechnicalColumn, manufacturerColumn: TechnicalColumn): MicrowaveLinkEquipment {
  return { type: trimmedTextOrNull(row[typeColumn]), manufacturer: trimmedTextOrNull(row[manufacturerColumn]) };
}

function readTechnicalValues(row: SheetRow): MicrowaveLinkTechnicalValues {
  const bandwidth = row["Przepływność [Mb/s]"];

  return {
    modulationType: trimmedTextOrNull(row["Rodz_modu-lacji"]),
    bandwidth: bandwidth === null || bandwidth === undefined ? null : String(bandwidth),
    txAntennaAttenuation: nonZeroNumberOrNull(row["Tłum_ant_odb_Rx [dB]"]),
    transmitter: readEquipment(row, "Typ_nad", "Prod_nad"),
    txAntenna: readEquipment(row, "Typ_ant_Tx", "Prod_ant_Tx"),
    txAntennaGain: nonZeroNumberOrNull(row["Zysk_ant_Tx [dBi]"]),
    rxAntenna: readEquipment(row, "Typ_ant_Rx", "Prod_ant_Rx"),
    rxAntennaGain: nonZeroNumberOrNull(row["Zysk_ant_Rx [dBi]"]),
    rxNoiseFigure: nonZeroNumberOrNull(row["Liczba_szum_Rx [dB]"]),
    rxAtpcAttenuation: nonZeroNumberOrNull(row["Tłum_ATPC [dB]"]),
  };
}

function findTechnicalCoverage(ctx: ReadContext, file: LocalFile, headers: readonly string[]): TechnicalCoverage {
  const missingColumns = TECHNICAL_COLUMNS.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) ctx.log(`Workbook "${file.fileName}" is missing technical columns: ${missingColumns.join(", ")}`);

  return {
    omittedFields: TECHNICAL_FIELD_COLUMNS.filter(([, column]) => missingColumns.includes(column)).map(([field]) => field),
    publishesEveryColumn: missingColumns.length === 0,
  };
}

function readLink(row: SheetRow, technicalCoverage: TechnicalCoverage, now: Date): MicrowaveLinkRecord {
  const freqGhz = Number.parseFloat(String(row["f [GHz]"] || ""));
  const freqMhz = Math.round((Number.isFinite(freqGhz) ? freqGhz : 0) * 1000);
  const channelWidthMhz = nonZeroNumberOrNull(row["Szer_kan [MHz]"]);
  const planSymbol = parsePlanSymbol(row.Symbol_planu, freqMhz, channelWidthMhz);
  const technical: Partial<MicrowaveLinkTechnicalValues> = readTechnicalValues(row);
  for (const field of technicalCoverage.omittedFields) delete technical[field];

  const link: MicrowaveLinkRecord = {
    slice: WHOLE_DATASET_SLICE,
    licensee: trimmedTextOrNull(row.Operator),
    permitNumber: trimmedText(row["Nr_pozw/dec"]),
    decisionType: row.Rodz_dec === "zmP" ? "permit_change" : "permit",
    issuedOn: parseExcelDay(row.Data_wydania, now),
    expiresOn: parseExcelDay(row["Data_ważn_pozw/dec"], now),
    tx: readEnd(row, "Tx"),
    rx: readEnd(row, "Rx"),
    freqMhz,
    channelNumber: Number(row.Nr_kan) || null,
    channelWidthMhz,
    polarization: trimmedTextOrNull(row.Polaryzacja),
    eirpDbm: nonZeroNumberOrNull(row["EIRP [dBm]"]),
    technical,
    publishesEveryTechnicalColumn: technicalCoverage.publishesEveryColumn,
  };
  if (planSymbol !== undefined) link.planSymbol = planSymbol;

  return link;
}

async function* readLinksFile(ctx: ReadContext, file: LocalFile): AsyncGenerator<MicrowaveLinkRecord> {
  const { headers, rows } = await readFirstSheet(file, REQUIRED_COLUMNS, TECHNICAL_COLUMNS);
  const technicalCoverage = findTechnicalCoverage(ctx, file, headers);

  for await (const row of rows) yield readLink(row, technicalCoverage, ctx.now);
}

export async function* parseMicrowaveLinks(ctx: ReadContext, _release: Release, files: readonly LocalFile[]): AsyncIterable<MicrowaveLinkRecord> {
  for (const file of files) yield* readLinksFile(ctx, file);
}
