import { locations, operators, regions, stations } from "@openbts/drizzle";
import { db } from "@openbts/drizzle/db";
import { type SQL, and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { type AuditEntryInput, runAuditedOperation, systemAuditContext } from "../../features/audit/index.js";
import type { StructureValues } from "../../features/locations/structure.js";
import type { LocationRow } from "../../features/locations/write.js";
import type { DbTx } from "../../types/global.js";
import type { AddressStrip } from "./addressStrip.js";
import type { LocationOperator } from "./ownTower.js";

type StoredLocation = Pick<LocationRow, "id" | "address"> & StructureValues;
type FilledStructure = Pick<LocationRow, "id"> & StructureValues;
type RewrittenAddress = Pick<LocationRow, "id" | "address">;
export type LocationFill = Pick<LocationRow, "id" | "address"> & { values: StructureValues };

export function isUnfilled(location: StoredLocation): boolean {
  return location.structure_type === null && location.structure_owner_id === null && location.structure_note === null;
}

function unfilledCondition(): SQL | undefined {
  return and(isNull(locations.structure_type), isNull(locations.structure_owner_id), isNull(locations.structure_note));
}

export async function loadLocations(countryCode: string): Promise<StoredLocation[]> {
  return db
    .select({
      id: locations.id,
      address: locations.address,
      structure_type: locations.structure_type,
      structure_owner_id: locations.structure_owner_id,
      structure_note: locations.structure_note,
    })
    .from(locations)
    .innerJoin(regions, eq(regions.id, locations.region_id))
    .where(eq(regions.countryCode, countryCode))
    .orderBy(asc(locations.id));
}

export async function loadOperatorsByLocation(): Promise<Map<number, LocationOperator[]>> {
  const rows = await db
    .selectDistinctOn([stations.location_id, stations.operator_id], {
      locationId: stations.location_id,
      mnc: operators.mnc,
      oldestStationAt: stations.createdAt,
    })
    .from(stations)
    .innerJoin(operators, eq(operators.id, stations.operator_id))
    .where(isNotNull(stations.location_id))
    .orderBy(stations.location_id, stations.operator_id, asc(stations.createdAt));

  const operatorsByLocation = new Map<number, LocationOperator[]>();
  for (const { locationId, mnc, oldestStationAt } of rows) {
    if (locationId === null) continue;

    const operatorsThere = operatorsByLocation.get(locationId) ?? [];
    operatorsThere.push({ mnc, oldestStationAt });
    operatorsByLocation.set(locationId, operatorsThere);
  }
  return operatorsByLocation;
}

async function writeStructures(tx: DbTx, structures: readonly FilledStructure[]): Promise<void> {
  await tx.execute(sql`
    UPDATE locations
    SET structure_type = change.structure_type::structure_type,
        structure_owner_id = change.structure_owner_id,
        structure_note = change.structure_note,
        "updatedAt" = now()
    FROM jsonb_to_recordset(${JSON.stringify(structures)}::text::jsonb)
      AS change (id integer, structure_type text, structure_owner_id integer, structure_note text)
    WHERE locations.id = change.id
  `);
}

async function writeAddresses(tx: DbTx, addresses: readonly RewrittenAddress[]): Promise<void> {
  await tx.execute(sql`
    UPDATE locations
    SET address = change.address,
        "updatedAt" = now()
    FROM jsonb_to_recordset(${JSON.stringify(addresses)}::text::jsonb) AS change (id integer, address text)
    WHERE locations.id = change.id
  `);
}

async function changeEntries(tx: DbTx, rowsBefore: readonly LocationRow[]): Promise<AuditEntryInput[]> {
  const ids = rowsBefore.map((row) => row.id);
  const rowsAfter = await tx.select().from(locations).where(inArray(locations.id, ids));
  const afterById = new Map(rowsAfter.map((row) => [row.id, row]));

  return rowsBefore.map((row) => {
    const changed = afterById.get(row.id);
    if (changed === undefined) throw new Error(`Location ${row.id} disappeared while it was being changed`);
    if (changed.region_id !== row.region_id) {
      throw new Error(`Changing location ${row.id} also moved it from region ${row.region_id} to ${changed.region_id}, so its batch was not written`);
    }

    return { entity: "locations", op: "update", recordId: row.id, old: row, new: changed };
  });
}

export async function fillLocations(fills: readonly LocationFill[]): Promise<number> {
  const fillsById = new Map(fills.map((fill) => [fill.id, fill]));

  return runAuditedOperation(systemAuditContext(), { kind: "location.edit" }, async (tx, audit) => {
    const rows = await tx
      .select()
      .from(locations)
      .where(and(inArray(locations.id, [...fillsById.keys()]), unfilledCondition()))
      .orderBy(asc(locations.id))
      .for("update");
    const filled = rows.flatMap((row) => {
      const fill = fillsById.get(row.id);
      return fill !== undefined && fill.address === row.address ? [{ row, structure: { id: row.id, ...fill.values } }] : [];
    });
    if (filled.length === 0) return 0;

    const structures = filled.map(({ structure }) => structure);
    const rowsBefore = filled.map(({ row }) => row);
    await writeStructures(tx, structures);
    await audit.logMany(await changeEntries(tx, rowsBefore));
    return filled.length;
  });
}

export async function stripAddresses(strips: readonly AddressStrip[], structuresById: ReadonlyMap<number, StructureValues>): Promise<number> {
  const stripsById = new Map(strips.map((strip) => [strip.id, strip]));

  return runAuditedOperation(systemAuditContext(), { kind: "location.edit" }, async (tx, audit) => {
    const rows = await tx
      .select()
      .from(locations)
      .where(inArray(locations.id, [...stripsById.keys()]))
      .orderBy(asc(locations.id))
      .for("update");
    const rewritten = rows.flatMap((row) => {
      const strip = stripsById.get(row.id);
      const structure = structuresById.get(row.id);
      if (strip === undefined || structure === undefined || strip.address !== row.address) return [];

      const isAsPlanned =
        row.structure_type === structure.structure_type &&
        row.structure_owner_id === structure.structure_owner_id &&
        row.structure_note === structure.structure_note;
      return isAsPlanned ? [{ row, address: { id: row.id, address: strip.addressAfter } }] : [];
    });
    if (rewritten.length === 0) return 0;

    const addresses = rewritten.map(({ address }) => address);
    const rowsBefore = rewritten.map(({ row }) => row);
    await writeAddresses(tx, addresses);
    await audit.logMany(await changeEntries(tx, rowsBefore));
    return rewritten.length;
  });
}
