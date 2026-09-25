import type { RawRadioLineData } from "../types.js";
import { convertDMSToDD, parseExcelDate, stripCompanySuffixForName } from "../utils.js";
import type { RadiolineEquipmentIds } from "./equipment.js";
import type { UkeRadiolineInsert } from "./types.js";
import type { TechnicalRadiolineColumn } from "./workbook.js";

const TECHNICAL_FIELD_COLUMNS = {
  modulation_type: "Rodz_modu-lacji",
  bandwidth: "Przepływność [Mb/s]",
  tx_antenna_attenuation: "Tłum_ant_odb_Rx [dB]",
  tx_transmitter_type_id: "Typ_nad",
  tx_antenna_type_id: "Typ_ant_Tx",
  tx_antenna_gain: "Zysk_ant_Tx [dBi]",
  rx_antenna_type_id: "Typ_ant_Rx",
  rx_antenna_gain: "Zysk_ant_Rx [dBi]",
  rx_noise_figure: "Liczba_szum_Rx [dB]",
  rx_atpc_attenuation: "Tłum_ATPC [dB]",
} as const satisfies Partial<Record<keyof UkeRadiolineInsert, TechnicalRadiolineColumn>>;

type TechnicalField = keyof typeof TECHNICAL_FIELD_COLUMNS;

function identityPart(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function buildPhysicalKey(
  value: Pick<
    UkeRadiolineInsert,
    "operator_id" | "tx_longitude" | "tx_latitude" | "rx_longitude" | "rx_latitude" | "freq" | "polarization" | "ch_num"
  >,
): string {
  return [
    value.operator_id,
    value.tx_longitude,
    value.tx_latitude,
    value.rx_longitude,
    value.rx_latitude,
    value.freq,
    value.polarization,
    value.ch_num,
  ]
    .map(identityPart)
    .join("|");
}

export function buildAuthorizationKey(value: Pick<UkeRadiolineInsert, "permit_number" | "physical_key">): string {
  return `${value.permit_number}|${value.physical_key}`;
}

export function collectRadiolineOperatorNames(rows: RawRadioLineData[]): string[] {
  return Array.from(new Set(rows.map((row) => String(row.Operator || "").trim()).filter((name) => name.length > 0)));
}

function getOmittedTechnicalFields(missingColumns: readonly TechnicalRadiolineColumn[]): TechnicalField[] {
  const missing = new Set(missingColumns);
  return (Object.keys(TECHNICAL_FIELD_COLUMNS) as TechnicalField[]).filter((field) => missing.has(TECHNICAL_FIELD_COLUMNS[field]));
}

//* Every "23A56" plan symbol (23 GHz band, 56 MHz channels) exported as the number 1
function parsePlanSymbol(value: unknown, frequency: number, channelWidth: number | null): string | null | undefined {
  if (typeof value === "number") return value === 1 && channelWidth === 56 && frequency >= 22_000 && frequency <= 23_600 ? "23A56" : undefined;
  return String(value || "").trim() || null;
}

export function prepareRadiolineRecords(
  rows: RawRadioLineData[],
  equipmentIds: RadiolineEquipmentIds,
  operatorIdByName: Map<string, number>,
  fileDate: Date,
  missingTechnicalColumns: readonly TechnicalRadiolineColumn[],
): UkeRadiolineInsert[] {
  const omittedFields = getOmittedTechnicalFields(missingTechnicalColumns);
  const specsDate = missingTechnicalColumns.length === 0 ? fileDate : undefined;

  return rows.map((row) => {
    const transmitterLongitude = convertDMSToDD(row.Dl_geo_Tx) ?? 0;
    const transmitterLatitude = convertDMSToDD(row.Sz_geo_Tx) ?? 0;
    const receiverLongitude = convertDMSToDD(row.Dl_geo_Rx) ?? 0;
    const receiverLatitude = convertDMSToDD(row.Sz_geo_Rx) ?? 0;
    const frequencyGhz = Number.parseFloat(String(row["f [GHz]"] || ""));
    const frequency = Math.round((Number.isFinite(frequencyGhz) ? frequencyGhz : 0) * 1000);
    const channelNumber = Number(row.Nr_kan) || null;
    const channelWidth = Number(String(row["Szer_kan [MHz]"] || "")) || null;
    const polarization = String(row.Polaryzacja || "").trim() || null;
    const operatorId = operatorIdByName.get(stripCompanySuffixForName(String(row.Operator || "").trim())) ?? null;
    const physicalKey = buildPhysicalKey({
      operator_id: operatorId,
      tx_longitude: transmitterLongitude,
      tx_latitude: transmitterLatitude,
      rx_longitude: receiverLongitude,
      rx_latitude: receiverLatitude,
      freq: frequency,
      polarization,
      ch_num: channelNumber,
    });

    const record: UkeRadiolineInsert = {
      tx_longitude: transmitterLongitude,
      tx_latitude: transmitterLatitude,
      tx_height: Number(row["H_t_Tx [m npm]"]) || 0,
      tx_city: String(row["Miejscowość Tx"] || "").trim() || null,
      tx_province: String(row["Województwo Tx"] || "").trim() || null,
      tx_street: String(row["Ulica Tx"] || "").trim() || null,
      tx_location_description: String(row["Opis położenia Tx"] || "").trim() || null,

      rx_longitude: receiverLongitude,
      rx_latitude: receiverLatitude,
      rx_height: Number(row["H_t_Rx [m npm]"]) || 0,
      rx_city: String(row["Miejscowość Rx"] || "").trim() || null,
      rx_province: String(row["Województwo Rx"] || "").trim() || null,
      rx_street: String(row["Ulica Rx"] || "").trim() || null,
      rx_location_description: String(row["Opis położenia Rx"] || "").trim() || null,

      freq: frequency,
      ch_num: channelNumber,
      plan_symbol: parsePlanSymbol(row.Symbol_planu, frequency, channelWidth),
      ch_width: channelWidth,
      polarization,
      modulation_type: String(row["Rodz_modu-lacji"] || "").trim() || null,
      bandwidth: row["Przepływność [Mb/s]"] === null || row["Przepływność [Mb/s]"] === undefined ? null : String(row["Przepływność [Mb/s]"]),

      tx_eirp: Number(String(row["EIRP [dBm]"] || "")) || null,
      tx_antenna_attenuation: Number(String(row["Tłum_ant_odb_Rx [dB]"] || "")) || null,
      tx_transmitter_type_id: equipmentIds.transmitterTypeIdByName.get(String(row.Typ_nad || "").trim()) ?? null,
      tx_antenna_type_id: equipmentIds.antennaTypeIdByName.get(String(row.Typ_ant_Tx || "").trim()) ?? null,
      tx_antenna_gain: Number(String(row["Zysk_ant_Tx [dBi]"] || "")) || null,
      tx_antenna_height: Number(row["H_ant_Tx [m npt]"]) || null,

      rx_antenna_type_id: equipmentIds.antennaTypeIdByName.get(String(row.Typ_ant_Rx || "").trim()) ?? null,
      rx_antenna_gain: Number(String(row["Zysk_ant_Rx [dBi]"] || "")) || null,
      rx_antenna_height: Number(row["H_ant_Rx [m npt]"]) || null,
      rx_noise_figure: Number(String(row["Liczba_szum_Rx [dB]"] || "")) || null,
      rx_atpc_attenuation: Number(String(row["Tłum_ATPC [dB]"] || "")) || null,

      operator_id: operatorId,
      physical_key: physicalKey,
      permit_number: String(row["Nr_pozw/dec"] || "").trim(),
      decision_type: row.Rodz_dec === "zmP" ? "zmP" : "P",
      issue_date: parseExcelDate(row.Data_wydania),
      expiry_date: parseExcelDate(row["Data_ważn_pozw/dec"]),
      specs_date: specsDate,
      createdAt: fileDate,
      updatedAt: fileDate,
    };

    for (const field of omittedFields) record[field] = undefined;
    return record;
  });
}
