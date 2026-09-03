import { radioLinesManufacturers, radiolinesAntennaTypes, radiolinesTransmitterTypes } from "@openbts/drizzle";
/* eslint-disable no-await-in-loop */

import { BATCH_SIZE } from "../config.js";
import { db } from "../database.js";
import type { RawRadioLineData } from "../types.js";
import { chunk } from "../utils.js";

const EQUIPMENT_INSERT_BATCH_SIZE = Math.min(BATCH_SIZE, 250);

interface EquipmentType {
  name: string | undefined;
  manufacturer_id: number | null;
}

type NamedEquipmentType = EquipmentType & { name: string };

export interface RadiolineEquipmentNames {
  manufacturerNames: Set<string>;
  antennaTypeTuples: Set<string>;
  transmitterTypeTuples: Set<string>;
}

export interface RadiolineEquipmentIds {
  antennaTypeIdByName: Map<string, number>;
  transmitterTypeIdByName: Map<string, number>;
}

function isNamedEquipmentType(value: EquipmentType): value is NamedEquipmentType {
  return typeof value.name === "string" && value.name.length > 0;
}

function prepareEquipmentTypes(typeTuples: Set<string>, manufacturerIdByName: Map<string, number>): NamedEquipmentType[] {
  const rawTypes = Array.from(typeTuples).map((tuple): EquipmentType => {
    const [name, manufacturerName] = tuple.split("|");
    return {
      name,
      manufacturer_id: manufacturerName ? (manufacturerIdByName.get(manufacturerName) ?? null) : null,
    };
  });
  const typeByName = new Map<string, NamedEquipmentType>();

  for (const equipmentType of rawTypes.filter(isNamedEquipmentType)) {
    if (!typeByName.has(equipmentType.name)) typeByName.set(equipmentType.name, equipmentType);
  }

  return Array.from(typeByName.values());
}

export function collectRadiolineEquipmentNames(rows: RawRadioLineData[]): RadiolineEquipmentNames {
  const manufacturerNames = new Set<string>();
  const antennaTypeTuples = new Set<string>();
  const transmitterTypeTuples = new Set<string>();

  for (const row of rows) {
    if (row.Prod_ant_Tx) manufacturerNames.add(String(row.Prod_ant_Tx).trim());
    if (row.Prod_ant_Rx) manufacturerNames.add(String(row.Prod_ant_Rx).trim());
    if (row.Prod_nad) manufacturerNames.add(String(row.Prod_nad).trim());
    if (row.Typ_ant_Tx) antennaTypeTuples.add(`${String(row.Typ_ant_Tx).trim()}|${String(row.Prod_ant_Tx || "").trim()}`);
    if (row.Typ_ant_Rx) antennaTypeTuples.add(`${String(row.Typ_ant_Rx).trim()}|${String(row.Prod_ant_Rx || "").trim()}`);
    if (row.Typ_nad) transmitterTypeTuples.add(`${String(row.Typ_nad).trim()}|${String(row.Prod_nad || "").trim()}`);
  }

  return { manufacturerNames, antennaTypeTuples, transmitterTypeTuples };
}

export async function upsertRadiolineManufacturers(manufacturerNames: Set<string>): Promise<Map<string, number>> {
  const names = Array.from(manufacturerNames).filter((name) => name.length > 0);
  const manufacturerIdByName = new Map<string, number>();
  if (!names.length) return manufacturerIdByName;

  const existingManufacturers = await db.query.radioLinesManufacturers.findMany({
    where: { name: { in: names } },
  });
  for (const manufacturer of existingManufacturers) manufacturerIdByName.set(manufacturer.name, manufacturer.id);

  const namesToInsert = names.filter((name) => !manufacturerIdByName.has(name));
  if (namesToInsert.length) {
    for (const group of chunk(namesToInsert, EQUIPMENT_INSERT_BATCH_SIZE)) {
      const insertedManufacturers = await db
        .insert(radioLinesManufacturers)
        .values(group.map((name) => ({ name })))
        .returning({ id: radioLinesManufacturers.id, name: radioLinesManufacturers.name });
      for (const manufacturer of insertedManufacturers) manufacturerIdByName.set(manufacturer.name, manufacturer.id);
    }
  }

  return manufacturerIdByName;
}

export async function upsertRadiolineAntennaTypes(typeTuples: Set<string>, manufacturerIdByName: Map<string, number>): Promise<Map<string, number>> {
  const antennaTypes = prepareEquipmentTypes(typeTuples, manufacturerIdByName);
  const antennaTypeIdByName = new Map<string, number>();
  if (!antennaTypes.length) return antennaTypeIdByName;

  const existingAntennaTypes = await db.query.radiolinesAntennaTypes.findMany({
    where: { name: { in: antennaTypes.map((antennaType) => antennaType.name) } },
  });
  for (const antennaType of existingAntennaTypes) antennaTypeIdByName.set(antennaType.name, antennaType.id);

  const antennaTypesToInsert = antennaTypes.filter((antennaType) => !antennaTypeIdByName.has(antennaType.name));
  if (antennaTypesToInsert.length) {
    for (const group of chunk(antennaTypesToInsert, EQUIPMENT_INSERT_BATCH_SIZE)) {
      const insertedAntennaTypes = await db
        .insert(radiolinesAntennaTypes)
        .values(
          group.map((antennaType) => ({
            name: antennaType.name,
            manufacturer_id: antennaType.manufacturer_id,
          })),
        )
        .returning({ id: radiolinesAntennaTypes.id, name: radiolinesAntennaTypes.name });
      for (const antennaType of insertedAntennaTypes) antennaTypeIdByName.set(antennaType.name, antennaType.id);
    }
  }

  return antennaTypeIdByName;
}

export async function upsertRadiolineTransmitterTypes(
  typeTuples: Set<string>,
  manufacturerIdByName: Map<string, number>,
): Promise<Map<string, number>> {
  const transmitterTypes = prepareEquipmentTypes(typeTuples, manufacturerIdByName);
  const transmitterTypeIdByName = new Map<string, number>();
  if (!transmitterTypes.length) return transmitterTypeIdByName;

  const existingTransmitterTypes = await db.query.radiolinesTransmitterTypes.findMany({
    where: { name: { in: transmitterTypes.map((transmitterType) => transmitterType.name) } },
  });
  for (const transmitterType of existingTransmitterTypes) transmitterTypeIdByName.set(transmitterType.name, transmitterType.id);

  const transmitterTypesToInsert = transmitterTypes.filter((transmitterType) => !transmitterTypeIdByName.has(transmitterType.name));
  if (transmitterTypesToInsert.length) {
    for (const group of chunk(transmitterTypesToInsert, EQUIPMENT_INSERT_BATCH_SIZE)) {
      const insertedTransmitterTypes = await db
        .insert(radiolinesTransmitterTypes)
        .values(
          group.map((transmitterType) => ({
            name: transmitterType.name,
            manufacturer_id: transmitterType.manufacturer_id,
          })),
        )
        .returning({ id: radiolinesTransmitterTypes.id, name: radiolinesTransmitterTypes.name });
      for (const transmitterType of insertedTransmitterTypes) transmitterTypeIdByName.set(transmitterType.name, transmitterType.id);
    }
  }

  return transmitterTypeIdByName;
}
