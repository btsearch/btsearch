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

interface RadiolineUpdate {
  id: number;
  value: UkeRadiolineInsert;
}

export interface RadiolineChanges {
  toInsert: UkeRadiolineInsert[];
  toUpdate: RadiolineUpdate[];
  toRenew: RadiolineUpdate[];
  staleRadiolines: UkeRadiolineSelect[];
}

function compareValue(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  if (value === undefined) return null;
  return value;
}

function hasRadiolineChanges(existing: UkeRadiolineSelect, next: UkeRadiolineInsert): boolean {
  return radiolineComparisonFields.some((field) => next[field] !== undefined && compareValue(existing[field]) !== compareValue(next[field]));
}

function groupByPhysicalKey<T extends { physical_key: string }>(values: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const group = groups.get(value.physical_key);
    if (group) group.push(value);
    else groups.set(value.physical_key, [value]);
  }
  return groups;
}

function matchRenewedRadiolines(toInsert: UkeRadiolineInsert[], staleRadiolines: UkeRadiolineSelect[]): RadiolineUpdate[] {
  const staleByPhysicalKey = groupByPhysicalKey(staleRadiolines);
  const renewals: RadiolineUpdate[] = [];

  for (const [physicalKey, values] of groupByPhysicalKey(toInsert)) {
    const stale = staleByPhysicalKey.get(physicalKey);
    const [value] = values;
    const [existing] = stale ?? [];
    if (values.length !== 1 || stale?.length !== 1 || !value || !existing) continue;
    if (value.ch_width === existing.ch_width) renewals.push({ id: existing.id, value });
  }

  return renewals;
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
    specs_date: value.specs_date,
    updatedAt: value.updatedAt,
  };
}

export async function loadRadiolineChanges(values: UkeRadiolineInsert[]): Promise<RadiolineChanges> {
  return diffRadiolines(await db.select().from(ukeRadiolines), values);
}

export function diffRadiolines(existingRadiolines: UkeRadiolineSelect[], values: UkeRadiolineInsert[]): RadiolineChanges {
  const existingByKey = new Map<string, UkeRadiolineSelect>();

  for (const row of existingRadiolines) {
    const key = buildAuthorizationKey(row);
    if (!existingByKey.has(key)) existingByKey.set(key, row);
  }

  const seenExistingIds = new Set<number>();
  const newValues: UkeRadiolineInsert[] = [];
  const toUpdate: RadiolineUpdate[] = [];

  for (const value of values) {
    const existing = existingByKey.get(buildAuthorizationKey(value));
    if (!existing) {
      newValues.push(value);
      continue;
    }

    seenExistingIds.add(existing.id);
    if (hasRadiolineChanges(existing, value)) toUpdate.push({ id: existing.id, value });
  }

  const unmatchedRadiolines = existingRadiolines.filter((row) => !seenExistingIds.has(row.id));
  const toRenew = matchRenewedRadiolines(newValues, unmatchedRadiolines);
  const renewedIds = new Set(toRenew.map((renewal) => renewal.id));
  const renewedValues = new Set(toRenew.map((renewal) => renewal.value));

  return {
    toInsert: newValues.filter((value) => !renewedValues.has(value)),
    toUpdate,
    toRenew,
    staleRadiolines: unmatchedRadiolines.filter((row) => !renewedIds.has(row.id)),
  };
}

export async function insertRadiolines(values: UkeRadiolineInsert[]): Promise<void> {
  for (const group of chunk(values, BATCH_SIZE)) {
    if (group.length) await db.insert(ukeRadiolines).values(group);
  }
}

export async function updateRadiolines(updates: RadiolineUpdate[]): Promise<void> {
  for (const item of updates) {
    await db.update(ukeRadiolines).set(toRadiolineUpdate(item.value)).where(eq(ukeRadiolines.id, item.id));
  }
}

export async function updateRadiolinesSpecsDate(specsDate: Date): Promise<void> {
  await db.update(ukeRadiolines).set({ specs_date: specsDate });
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
