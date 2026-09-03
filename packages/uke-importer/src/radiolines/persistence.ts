import { deletedEntries, ukeRadiolines } from "@openbts/drizzle";
import { eq, inArray } from "drizzle-orm";
/* eslint-disable no-await-in-loop */

import { BATCH_SIZE } from "../config.js";
import { db } from "../database.js";
import { chunk } from "../utils.js";
import { buildAuthorizationKey } from "./records.js";
import type { UkeRadiolineInsert, UkeRadiolineSelect } from "./types.js";

const radiolineComparisonFields = [
  "tx_longitude",
  "tx_latitude",
  "tx_height",
  "tx_city",
  "tx_province",
  "tx_street",
  "tx_location_description",
  "rx_longitude",
  "rx_latitude",
  "rx_height",
  "rx_city",
  "rx_province",
  "rx_street",
  "rx_location_description",
  "freq",
  "ch_num",
  "plan_symbol",
  "ch_width",
  "polarization",
  "modulation_type",
  "bandwidth",
  "tx_eirp",
  "tx_antenna_attenuation",
  "tx_transmitter_type_id",
  "tx_antenna_type_id",
  "tx_antenna_gain",
  "tx_antenna_height",
  "rx_antenna_type_id",
  "rx_antenna_gain",
  "rx_antenna_height",
  "rx_noise_figure",
  "rx_atpc_attenuation",
  "operator_id",
  "physical_key",
  "permit_number",
  "decision_type",
  "issue_date",
  "expiry_date",
] as const satisfies readonly (keyof UkeRadiolineInsert & keyof UkeRadiolineSelect)[];

export interface RadiolineChanges {
  toInsert: UkeRadiolineInsert[];
  toUpdate: Array<{ id: number; value: UkeRadiolineInsert }>;
  staleRadiolines: UkeRadiolineSelect[];
}

function compareValue(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  if (value === undefined) return null;
  return value;
}

function hasRadiolineChanges(existing: UkeRadiolineSelect, next: UkeRadiolineInsert): boolean {
  return radiolineComparisonFields.some((field) => compareValue(existing[field]) !== compareValue(next[field]));
}

function toRadiolineUpdate(value: UkeRadiolineInsert): Partial<UkeRadiolineInsert> {
  return {
    tx_longitude: value.tx_longitude,
    tx_latitude: value.tx_latitude,
    tx_height: value.tx_height,
    tx_city: value.tx_city,
    tx_province: value.tx_province,
    tx_street: value.tx_street,
    tx_location_description: value.tx_location_description,
    rx_longitude: value.rx_longitude,
    rx_latitude: value.rx_latitude,
    rx_height: value.rx_height,
    rx_city: value.rx_city,
    rx_province: value.rx_province,
    rx_street: value.rx_street,
    rx_location_description: value.rx_location_description,
    freq: value.freq,
    ch_num: value.ch_num,
    plan_symbol: value.plan_symbol,
    ch_width: value.ch_width,
    polarization: value.polarization,
    modulation_type: value.modulation_type,
    bandwidth: value.bandwidth,
    tx_eirp: value.tx_eirp,
    tx_antenna_attenuation: value.tx_antenna_attenuation,
    tx_transmitter_type_id: value.tx_transmitter_type_id,
    tx_antenna_type_id: value.tx_antenna_type_id,
    tx_antenna_gain: value.tx_antenna_gain,
    tx_antenna_height: value.tx_antenna_height,
    rx_antenna_type_id: value.rx_antenna_type_id,
    rx_antenna_gain: value.rx_antenna_gain,
    rx_antenna_height: value.rx_antenna_height,
    rx_noise_figure: value.rx_noise_figure,
    rx_atpc_attenuation: value.rx_atpc_attenuation,
    operator_id: value.operator_id,
    physical_key: value.physical_key,
    permit_number: value.permit_number,
    decision_type: value.decision_type,
    issue_date: value.issue_date,
    expiry_date: value.expiry_date,
    updatedAt: value.updatedAt,
  };
}

export async function loadRadiolineChanges(values: UkeRadiolineInsert[]): Promise<RadiolineChanges> {
  const existingRadiolines = await db.select().from(ukeRadiolines);
  const existingByKey = new Map<string, UkeRadiolineSelect>();

  for (const row of existingRadiolines) {
    const key = buildAuthorizationKey(row);
    if (!existingByKey.has(key)) existingByKey.set(key, row);
  }

  const seenExistingIds = new Set<number>();
  const toInsert: UkeRadiolineInsert[] = [];
  const toUpdate: Array<{ id: number; value: UkeRadiolineInsert }> = [];

  for (const value of values) {
    const existing = existingByKey.get(buildAuthorizationKey(value));
    if (!existing) {
      toInsert.push(value);
      continue;
    }

    seenExistingIds.add(existing.id);
    if (hasRadiolineChanges(existing, value)) toUpdate.push({ id: existing.id, value });
  }

  const staleRadiolines = existingRadiolines.filter((row) => !seenExistingIds.has(row.id));
  return { toInsert, toUpdate, staleRadiolines };
}

export async function insertRadiolines(values: UkeRadiolineInsert[]): Promise<void> {
  for (const group of chunk(values, BATCH_SIZE)) {
    if (group.length) await db.insert(ukeRadiolines).values(group);
  }
}

export async function updateRadiolines(updates: Array<{ id: number; value: UkeRadiolineInsert }>): Promise<void> {
  for (const item of updates) {
    await db.update(ukeRadiolines).set(toRadiolineUpdate(item.value)).where(eq(ukeRadiolines.id, item.id));
  }
}

export async function archiveAndDeleteRadiolines(staleRadiolines: UkeRadiolineSelect[], importMetadataId: number): Promise<void> {
  if (staleRadiolines.length === 0) return;

  for (const group of chunk(staleRadiolines, BATCH_SIZE)) {
    await db.insert(deletedEntries).values(
      group.map((row) => ({
        source_table: "uke_radiolines",
        source_id: row.id,
        source_type: "radiolines",
        data: row,
        import_id: importMetadataId,
      })),
    );
  }

  for (const group of chunk(staleRadiolines, BATCH_SIZE)) {
    await db.delete(ukeRadiolines).where(
      inArray(
        ukeRadiolines.id,
        group.map((row) => row.id),
      ),
    );
  }
}
