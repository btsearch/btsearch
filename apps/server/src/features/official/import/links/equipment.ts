/* eslint-disable no-await-in-loop */
import type { MicrowaveLinkEquipment, MicrowaveLinkRecord } from "@openbts/country-packs/sources";
import { microwaveLinkAntennaTypes, microwaveLinkManufacturers, microwaveLinkTransmitterTypes } from "@openbts/drizzle";

import { chunks } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import { STATEMENT_BATCH_SIZE } from "../config.js";
import type { EquipmentIds } from "./values.js";

type ManufacturerNameByType = Map<string, string | null>;
type PublishedEquipment = { manufacturers: Set<string>; antennaTypes: ManufacturerNameByType; transmitterTypes: ManufacturerNameByType };

function addEquipment(equipment: MicrowaveLinkEquipment | undefined, manufacturers: Set<string>, types: ManufacturerNameByType): void {
  if (equipment === undefined) return;
  if (equipment.manufacturer !== null) manufacturers.add(equipment.manufacturer);
  if (equipment.type !== null && !types.has(equipment.type)) types.set(equipment.type, equipment.manufacturer);
}

export function collectEquipment(records: readonly MicrowaveLinkRecord[]): PublishedEquipment {
  const published: PublishedEquipment = { manufacturers: new Set(), antennaTypes: new Map(), transmitterTypes: new Map() };
  for (const { technical } of records) {
    addEquipment(technical.txAntenna, published.manufacturers, published.antennaTypes);
    addEquipment(technical.rxAntenna, published.manufacturers, published.antennaTypes);
    addEquipment(technical.transmitter, published.manufacturers, published.transmitterTypes);
  }

  return published;
}

function unknownTypes(types: ManufacturerNameByType, known: ReadonlyMap<string, number>, manufacturerIds: ReadonlyMap<string, number>) {
  return [...types]
    .filter(([name]) => !known.has(name))
    .map(([name, manufacturer]) => ({ name, manufacturer_id: manufacturer === null ? null : (manufacturerIds.get(manufacturer) ?? null) }));
}

async function resolveManufacturers(tx: DbTx, names: ReadonlySet<string>): Promise<Map<string, number>> {
  const stored = await tx.select({ id: microwaveLinkManufacturers.id, name: microwaveLinkManufacturers.name }).from(microwaveLinkManufacturers);
  const ids = new Map(stored.map((row) => [row.name, row.id]));

  for (const group of chunks(
    [...names].filter((name) => !ids.has(name)),
    STATEMENT_BATCH_SIZE,
  )) {
    const added = await tx
      .insert(microwaveLinkManufacturers)
      .values(group.map((name) => ({ name })))
      .returning({ id: microwaveLinkManufacturers.id, name: microwaveLinkManufacturers.name });
    for (const row of added) ids.set(row.name, row.id);
  }

  return ids;
}

async function resolveAntennaTypes(
  tx: DbTx,
  types: ManufacturerNameByType,
  manufacturerIds: ReadonlyMap<string, number>,
): Promise<Map<string, number>> {
  const stored = await tx.select({ id: microwaveLinkAntennaTypes.id, name: microwaveLinkAntennaTypes.name }).from(microwaveLinkAntennaTypes);
  const ids = new Map(stored.map((row) => [row.name, row.id]));

  for (const group of chunks(unknownTypes(types, ids, manufacturerIds), STATEMENT_BATCH_SIZE)) {
    const added = await tx
      .insert(microwaveLinkAntennaTypes)
      .values(group)
      .returning({ id: microwaveLinkAntennaTypes.id, name: microwaveLinkAntennaTypes.name });
    for (const row of added) ids.set(row.name, row.id);
  }

  return ids;
}

async function resolveTransmitterTypes(
  tx: DbTx,
  types: ManufacturerNameByType,
  manufacturerIds: ReadonlyMap<string, number>,
): Promise<Map<string, number>> {
  const stored = await tx
    .select({ id: microwaveLinkTransmitterTypes.id, name: microwaveLinkTransmitterTypes.name })
    .from(microwaveLinkTransmitterTypes);
  const ids = new Map(stored.map((row) => [row.name, row.id]));

  for (const group of chunks(unknownTypes(types, ids, manufacturerIds), STATEMENT_BATCH_SIZE)) {
    const added = await tx
      .insert(microwaveLinkTransmitterTypes)
      .values(group)
      .returning({ id: microwaveLinkTransmitterTypes.id, name: microwaveLinkTransmitterTypes.name });
    for (const row of added) ids.set(row.name, row.id);
  }

  return ids;
}

export async function resolveEquipment(tx: DbTx, records: readonly MicrowaveLinkRecord[]): Promise<EquipmentIds> {
  const published = collectEquipment(records);
  const manufacturerIds = await resolveManufacturers(tx, published.manufacturers);

  return {
    antennaTypeIds: await resolveAntennaTypes(tx, published.antennaTypes, manufacturerIds),
    transmitterTypeIds: await resolveTransmitterTypes(tx, published.transmitterTypes, manufacturerIds),
  };
}
