import XLSX from "xlsx";

import type { RawRadioLineData } from "../types.js";

export const REQUIRED_RADIOLINE_COLUMNS = [
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
] as const satisfies readonly (keyof RawRadioLineData)[];

export const TECHNICAL_RADIOLINE_COLUMNS = [
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
] as const satisfies readonly (keyof RawRadioLineData)[];

export type TechnicalRadiolineColumn = (typeof TECHNICAL_RADIOLINE_COLUMNS)[number];

export interface RadiolineWorkbook {
  rows: RawRadioLineData[];
  missingTechnicalColumns: TechnicalRadiolineColumn[];
}

function readFirstRow(sheet: XLSX.WorkSheet): string[] {
  const ref = sheet["!ref"];
  if (!ref) return [];

  const range = XLSX.utils.decode_range(ref);
  range.e.r = range.s.r;
  const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(sheet, {
    header: 1,
    range,
    blankrows: false,
    raw: false,
    defval: "",
  });

  return (rows[0] ?? []).map((cell) => String(cell ?? ""));
}

function getMissingColumns<T extends string>(headers: readonly string[], columns: readonly T[]): T[] {
  const headerSet = new Set(headers);
  return columns.filter((column) => !headerSet.has(column));
}

export function getMissingRadiolineColumns(headers: readonly string[]): (typeof REQUIRED_RADIOLINE_COLUMNS)[number][] {
  return getMissingColumns(headers, REQUIRED_RADIOLINE_COLUMNS);
}

export function readRadiolineWorkbook(filePath: string): RadiolineWorkbook {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error(`Microwave links workbook "${filePath}" does not contain a worksheet`);

  const headers = readFirstRow(sheet);
  const missingColumns = getMissingRadiolineColumns(headers);
  if (missingColumns.length > 0)
    throw new Error(
      `Microwave links workbook "${filePath}" is missing required columns: ${missingColumns.map((column) => `"${column}"`).join(", ")}`,
    );

  return {
    rows: XLSX.utils.sheet_to_json<RawRadioLineData>(sheet, { raw: true, defval: null }),
    missingTechnicalColumns: getMissingColumns(headers, TECHNICAL_RADIOLINE_COLUMNS),
  };
}
