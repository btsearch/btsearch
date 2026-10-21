import type { MicrowaveLinkEquipment, MicrowaveLinkRecord } from "@openbts/country-packs/sources";
import { microwaveLinks } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

const linkSelectSchema = createSelectSchema(microwaveLinks);

type TechnicalColumn =
  | "modulation_type"
  | "bandwidth"
  | "tx_antenna_attenuation"
  | "tx_transmitter_type_id"
  | "tx_antenna_type_id"
  | "tx_antenna_gain"
  | "rx_antenna_type_id"
  | "rx_antenna_gain"
  | "rx_noise_figure"
  | "rx_atpc_attenuation";
type UnpublishedColumn = "id" | "dataset_id" | "source_ref" | "specs_date" | "updatedAt" | "createdAt";

export type StoredLink = z.infer<typeof linkSelectSchema>;
export type LinkValues = Omit<StoredLink, UnpublishedColumn | TechnicalColumn | "plan_symbol"> &
  Partial<Pick<StoredLink, TechnicalColumn | "plan_symbol">>;
export type EquipmentIds = { transmitterTypeIds: ReadonlyMap<string, number>; antennaTypeIds: ReadonlyMap<string, number> };

function typeIdOf(equipment: MicrowaveLinkEquipment, typeIds: ReadonlyMap<string, number>): number | null {
  return equipment.type === null ? null : (typeIds.get(equipment.type) ?? null);
}

export function toLinkValues(record: MicrowaveLinkRecord, licenseeId: number | null, equipment: EquipmentIds): LinkValues {
  const { tx, rx, technical } = record;
  const values: LinkValues = {
    tx_longitude: tx.longitude,
    tx_latitude: tx.latitude,
    tx_height: tx.groundHeight,
    tx_city: tx.city,
    tx_province: tx.province,
    tx_street: tx.street,
    tx_location_description: tx.locationDescription,
    rx_longitude: rx.longitude,
    rx_latitude: rx.latitude,
    rx_height: rx.groundHeight,
    rx_city: rx.city,
    rx_province: rx.province,
    rx_street: rx.street,
    rx_location_description: rx.locationDescription,
    freq_khz: record.freqKhz,
    ch_num: record.channelNumber,
    ch_width: record.channelWidthMhz,
    polarization: record.polarization,
    tx_eirp: record.eirpDbm,
    tx_antenna_height: tx.antennaHeight,
    rx_antenna_height: rx.antennaHeight,
    operator_id: licenseeId,
    permit_number: record.permitNumber,
    decision_type: record.decisionType,
    issue_date: record.issuedOn,
    expiry_date: record.expiresOn,
  };

  if (record.planSymbol !== undefined) values.plan_symbol = record.planSymbol;
  if (technical.modulationType !== undefined) values.modulation_type = technical.modulationType;
  if (technical.bandwidth !== undefined) values.bandwidth = technical.bandwidth;
  if (technical.txAntennaAttenuation !== undefined) values.tx_antenna_attenuation = technical.txAntennaAttenuation;
  if (technical.transmitter !== undefined) values.tx_transmitter_type_id = typeIdOf(technical.transmitter, equipment.transmitterTypeIds);
  if (technical.txAntenna !== undefined) values.tx_antenna_type_id = typeIdOf(technical.txAntenna, equipment.antennaTypeIds);
  if (technical.txAntennaGain !== undefined) values.tx_antenna_gain = technical.txAntennaGain;
  if (technical.rxAntenna !== undefined) values.rx_antenna_type_id = typeIdOf(technical.rxAntenna, equipment.antennaTypeIds);
  if (technical.rxAntennaGain !== undefined) values.rx_antenna_gain = technical.rxAntennaGain;
  if (technical.rxNoiseFigure !== undefined) values.rx_noise_figure = technical.rxNoiseFigure;
  if (technical.rxAtpcAttenuation !== undefined) values.rx_atpc_attenuation = technical.rxAtpcAttenuation;

  return values;
}
