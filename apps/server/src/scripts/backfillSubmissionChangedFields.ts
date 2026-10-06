import {
  auditLogs,
  extraIdentificators,
  locations,
  proposedCells,
  proposedLocations,
  proposedSectors,
  proposedStations,
  stationSectors,
  stationUplinks,
  stations,
  submissions,
} from "@openbts/drizzle";
import { sql as connection, db } from "@openbts/drizzle/db";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import {
  type CurrentSector,
  type ProposedLocationChanges,
  type ProposedLocationRow,
  type ProposedSectorChange,
  type ProposedStationChanges,
  type ProposedStationRow,
  changedLocationFields,
  changedStationFields,
  diffProposedLocation,
  diffProposedStation,
  resolveSectorChanges,
} from "../features/submissions/helpers.js";

type AuditedEntity = "stations" | "extra_identificators" | "station_uplinks" | "locations" | "station_sectors";
const proposedSectorSelectSchema = createSelectSchema(proposedSectors);

type ProposedSectorRow = z.infer<typeof proposedSectorSelectSchema>;
type AuditEntry = { op: string; old: unknown };

const apply = process.argv.includes("--apply");

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function fieldsAtWriteTime(entries: AuditEntry[], live: Record<string, unknown> | null): Record<string, unknown> {
  const state: Record<string, unknown> = { ...live };
  for (const entry of [...entries].reverse()) Object.assign(state, asRecord(entry.old));
  return state;
}

function rowAtWriteTime(entries: AuditEntry[], live: Record<string, unknown> | null): Record<string, unknown> | null {
  const first = entries[0];
  if (!first) return live;
  if (first.op === "create") return null;
  return asRecord(first.old) ?? live;
}

async function auditEntriesAfter(
  writtenAt: string,
  entity: AuditedEntity,
  scope: { stationId: number } | { recordId: string },
): Promise<AuditEntry[]> {
  return db
    .select({ op: auditLogs.op, old: auditLogs.old_values })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.entity, entity),
        "stationId" in scope ? eq(auditLogs.station_id, scope.stationId) : eq(auditLogs.record_id, scope.recordId),
        gt(auditLogs.createdAt, sql`${writtenAt}::timestamptz`),
      ),
    )
    .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id));
}

async function stationAtWriteTime(stationId: number, writtenAt: string): Promise<Record<string, unknown>> {
  const [live] = await db.select().from(stations).where(eq(stations.id, stationId)).limit(1);
  return fieldsAtWriteTime(await auditEntriesAfter(writtenAt, "stations", { stationId }), live ?? null);
}

function storedStationInput(row: ProposedStationRow): ProposedStationChanges {
  const hasExtraIdentifiers = row.networks_id !== null || row.networks_name !== null || row.mno_name !== null;
  return {
    station_id: row.station_id,
    operator_id: row.operator_id,
    notes: row.notes,
    ...(hasExtraIdentifiers ? { networks_id: row.networks_id, networks_name: row.networks_name, mno_name: row.mno_name } : {}),
    uplink_type: row.uplink_type,
    uplink_speed: row.uplink_speed,
    uplink_model: row.uplink_model,
  };
}

async function backfillStationProposal(row: ProposedStationRow, stationId: number, writtenAt: string): Promise<ProposedStationChanges> {
  const [liveExtra, liveUplink, extraEntries, uplinkEntries, station] = await Promise.all([
    db.select().from(extraIdentificators).where(eq(extraIdentificators.station_id, stationId)).orderBy(asc(extraIdentificators.id)).limit(1),
    db.select().from(stationUplinks).where(eq(stationUplinks.station_id, stationId)).limit(1),
    auditEntriesAfter(writtenAt, "extra_identificators", { stationId }),
    auditEntriesAfter(writtenAt, "station_uplinks", { stationId }),
    stationAtWriteTime(stationId, writtenAt),
  ]);
  const extra = rowAtWriteTime(extraEntries, liveExtra[0] ?? null);
  const uplink = rowAtWriteTime(uplinkEntries, liveUplink[0] ?? null);
  const uplinkType = text(uplink?.type);

  const changes = diffProposedStation(
    storedStationInput(row),
    { station_id: text(station.station_id), operator_id: num(station.operator_id), notes: text(station.notes) },
    extra && { networks_id: num(extra.networks_id), networks_name: text(extra.networks_name), mno_name: text(extra.mno_name) },
    uplink && uplinkType !== null ? { type: uplinkType, speed: num(uplink.speed), model: text(uplink.model) } : null,
  );

  if (apply)
    await db
      .update(proposedStations)
      .set({
        station_id: changes.station_id ?? null,
        operator_id: changes.operator_id ?? null,
        notes: changes.notes ?? null,
        networks_id: changes.networks_id ?? null,
        networks_name: changes.networks_name ?? null,
        mno_name: changes.mno_name ?? null,
        uplink_type: changes.uplink_type ?? null,
        uplink_speed: changes.uplink_speed ?? null,
        uplink_model: changes.uplink_model ?? null,
        changed_fields: changedStationFields(changes),
      })
      .where(and(eq(proposedStations.id, row.id), isNull(proposedStations.changed_fields)));

  return changes;
}

async function backfillLocationProposal(row: ProposedLocationRow, stationId: number, writtenAt: string): Promise<ProposedLocationChanges> {
  const locationId = num((await stationAtWriteTime(stationId, writtenAt)).location_id);
  let current: { region_id: number; city: string | null; address: string | null; longitude: number; latitude: number } | null = null;

  if (locationId !== null) {
    const [[live], entries] = await Promise.all([
      db.select().from(locations).where(eq(locations.id, locationId)).limit(1),
      auditEntriesAfter(writtenAt, "locations", { recordId: String(locationId) }),
    ]);
    const location = fieldsAtWriteTime(entries, live ?? null);
    const regionId = num(location.region_id);
    const longitude = num(location.longitude);
    const latitude = num(location.latitude);
    if (regionId !== null && longitude !== null && latitude !== null)
      current = { region_id: regionId, city: text(location.city), address: text(location.address), longitude, latitude };
  }

  const changes = diffProposedLocation(
    { region_id: row.region_id, city: row.city, address: row.address, longitude: row.longitude, latitude: row.latitude },
    current,
  );

  if (apply)
    await db
      .update(proposedLocations)
      .set({
        region_id: changes.region_id ?? null,
        city: changes.city ?? null,
        address: changes.address ?? null,
        longitude: changes.longitude ?? null,
        latitude: changes.latitude ?? null,
        changed_fields: changedLocationFields(changes),
      })
      .where(and(eq(proposedLocations.id, row.id), isNull(proposedLocations.changed_fields)));

  return changes;
}

function sectorList(value: unknown): CurrentSector[] | null {
  if (!Array.isArray(value)) return null;
  const sectors: CurrentSector[] = [];
  for (const item of value) {
    const record = asRecord(item);
    const id = num(record?.id);
    const azimuth = num(record?.azimuth);
    if (id === null || azimuth === null) return null;
    sectors.push({ id, azimuth });
  }
  return sectors;
}

async function sectorsAtWriteTime(stationId: number, writtenAt: string): Promise<CurrentSector[]> {
  const [live, entries] = await Promise.all([
    db
      .select({ id: stationSectors.id, azimuth: stationSectors.azimuth })
      .from(stationSectors)
      .where(eq(stationSectors.station_id, stationId))
      .orderBy(asc(stationSectors.id)),
    auditEntriesAfter(writtenAt, "station_sectors", { stationId }),
  ]);
  const [firstEntry] = entries;
  const writeTimeSectors = firstEntry ? sectorList(firstEntry.old) : null;
  return writeTimeSectors ?? live;
}

function describeSectorChange(change: ProposedSectorChange): string {
  if (change.operation === "add") return `+${change.azimuth}°`;
  if (change.operation === "delete") return `-${change.azimuth}° (#${change.target_sector_id})`;
  return `#${change.target_sector_id} -> ${change.azimuth}°`;
}

async function backfillSectorProposal(
  submissionId: string,
  stationId: number,
  rows: ProposedSectorRow[],
  writtenAt: string,
): Promise<ProposedSectorChange[]> {
  const { changes, unchangedSectorIdByLocalId } = resolveSectorChanges(rows, await sectorsAtWriteTime(stationId, writtenAt));
  if (!apply) return changes;

  const liveRows = await db.select({ id: stationSectors.id }).from(stationSectors).where(eq(stationSectors.station_id, stationId));
  const liveIds = new Set(liveRows.map((sector) => sector.id));
  const liveTarget = (sectorId: number | null) => (sectorId !== null && liveIds.has(sectorId) ? sectorId : null);

  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(proposedSectors)
      .where(and(eq(proposedSectors.submission_id, submissionId), isNull(proposedSectors.operation)))
      .returning({ id: proposedSectors.id });
    if (deleted.length === 0) return;

    if (changes.length > 0)
      await tx
        .insert(proposedSectors)
        .values(changes.map((change) => ({ ...change, target_sector_id: liveTarget(change.target_sector_id), submission_id: submissionId })));
    await Promise.all(
      [...unchangedSectorIdByLocalId].map(([localId, sectorId]) =>
        tx
          .update(proposedCells)
          .set({ target_sector_id: liveTarget(sectorId), sector_local_id: null })
          .where(and(eq(proposedCells.submission_id, submissionId), eq(proposedCells.sector_local_id, localId))),
      ),
    );
  });

  return changes;
}

async function main() {
  console.log(apply ? "applying changes" : "dry run, pass --apply to write changes");
  const pendingUpdate = and(eq(submissions.status, "pending"), eq(submissions.type, "update"));

  const stationRows = await db
    .select({ row: proposedStations, stationId: submissions.station_id, writtenAt: sql<string>`${proposedStations.createdAt}::text` })
    .from(proposedStations)
    .innerJoin(submissions, eq(submissions.id, proposedStations.submission_id))
    .where(and(pendingUpdate, isNull(proposedStations.changed_fields)));

  const locationRows = await db
    .select({ row: proposedLocations, stationId: submissions.station_id, writtenAt: sql<string>`${proposedLocations.createdAt}::text` })
    .from(proposedLocations)
    .innerJoin(submissions, eq(submissions.id, proposedLocations.submission_id))
    .where(and(pendingUpdate, isNull(proposedLocations.changed_fields)));

  const sectorRows = await db
    .select({ row: proposedSectors, stationId: submissions.station_id, writtenAt: sql<string>`${proposedSectors.createdAt}::text` })
    .from(proposedSectors)
    .innerJoin(submissions, eq(submissions.id, proposedSectors.submission_id))
    .where(and(pendingUpdate, isNull(proposedSectors.operation)))
    .orderBy(asc(proposedSectors.id));
  const sectorRowsBySubmission = new Map<string, typeof sectorRows>();
  for (const entry of sectorRows) {
    if (entry.row.submission_id === null) continue;
    const group = sectorRowsBySubmission.get(entry.row.submission_id) ?? [];
    group.push(entry);
    sectorRowsBySubmission.set(entry.row.submission_id, group);
  }

  let emptied = 0;

  /* eslint-disable no-await-in-loop */
  for (const { row, stationId, writtenAt } of stationRows) {
    if (stationId === null) continue;
    const fields = changedStationFields(await backfillStationProposal(row, stationId, writtenAt));
    if (fields.length === 0) emptied++;
    console.log(`submission ${row.submission_id} station: ${fields.join(", ") || "no changes"}`);
  }

  for (const { row, stationId, writtenAt } of locationRows) {
    if (stationId === null) continue;
    const fields = changedLocationFields(await backfillLocationProposal(row, stationId, writtenAt));
    if (fields.length === 0) emptied++;
    console.log(`submission ${row.submission_id} location: ${fields.join(", ") || "no changes"}`);
  }

  for (const [submissionId, group] of sectorRowsBySubmission) {
    const [first] = group;
    if (!first || first.stationId === null) continue;
    const changes = await backfillSectorProposal(
      submissionId,
      first.stationId,
      group.map(({ row }) => row),
      first.writtenAt,
    );
    if (changes.length === 0) emptied++;
    console.log(`submission ${submissionId} azimuths: ${changes.map(describeSectorChange).join(", ") || "no changes"}`);
  }
  /* eslint-enable no-await-in-loop */

  console.log(
    `${stationRows.length} station, ${locationRows.length} location and ${sectorRowsBySubmission.size} azimuth proposals, ${emptied} with no remaining changes`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await connection.end();
    process.exit();
  });
