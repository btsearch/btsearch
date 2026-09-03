import type { RawRadioLineData } from "../types.js";
import { convertDMSToDD, parseExcelDate, stripCompanySuffixForName } from "../utils.js";
import type { RadiolineEquipmentIds } from "./equipment.js";
import type { UkeRadiolineInsert } from "./types.js";

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

export function prepareRadiolineRecords(
  rows: RawRadioLineData[],
  equipmentIds: RadiolineEquipmentIds,
  operatorIdByName: Map<string, number>,
  fileDate: Date,
): UkeRadiolineInsert[] {
  return rows.map((row) => {
    const transmitterLongitude = convertDMSToDD(row.Dl_geo_Tx) ?? 0;
    const transmitterLatitude = convertDMSToDD(row.Sz_geo_Tx) ?? 0;
    const receiverLongitude = convertDMSToDD(row.Dl_geo_Rx) ?? 0;
    const receiverLatitude = convertDMSToDD(row.Sz_geo_Rx) ?? 0;
    const frequencyGhz = Number.parseFloat(String(row["f [GHz]"] || ""));
    const frequency = Math.round((Number.isFinite(frequencyGhz) ? frequencyGhz : 0) * 1000);
    const channelNumber = Number(row.Nr_kan) || null;
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

    return {
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
      plan_symbol: String(row.Symbol_planu || "").trim() || null,
      ch_width: Number(String(row["Szer_kan [MHz]"] || "")) || null,
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
      createdAt: fileDate,
      updatedAt: fileDate,
    };
  });
}
