import { attachments, auditLogs, auditOperations, locationPhotos, locations, stationSectors, structureOwners, users } from "@openbts/drizzle";
import type {
  StationHistoryItem,
  StationHistoryList,
  StationHistoryLocation,
  StationHistoryPhoto,
  StationHistoryQuery,
  UserRef,
} from "@openbts/shared/contract";
import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { z } from "zod/v4";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import { decodeCursor, encodeCursor } from "../../lib/cursor.js";
import { type AuditReach, getAuditReach, isWithinReach } from "../audit/access.js";
import { type ActiveRevertCoverage, loadActiveRevertCoverageByOperation } from "../audit/revert/revertibility.js";
import type { AuditOperationRow } from "../audit/types.js";
import { loadUnknownBandIds } from "../bands/unknown.js";
import { photoUrls } from "../photos/read.js";
import { type UserRefViewer, loadUserRefViewer, toPublicUserRef } from "../users/userRef.js";
import { type SectorAzimuthsAsOf, isPlainObject, normalize, sectorAzimuthsByOperation } from "./history.js";
import { locationChangeIds, operationChanges, photoChangeIds, structureOwnerChangeIds } from "./historyChanges.js";
import { type AuditRow, type HistoryStation, stationEntryCondition } from "./historyRows.js";
import type { StationRow } from "./serialize.js";

type HistoryReadContext = {
  viewer: UserRefViewer;
  reach: AuditReach;
  liveAzimuths: ReadonlyMap<number, number>;
  unknownBandIds: ReadonlySet<number>;
};

export type HistoryRows = {
  operations: AuditOperationRow[];
  entries: AuditRow[];
  sectorAzimuths: Map<number, SectorAzimuthsAsOf>;
  coverage: Map<number, ActiveRevertCoverage>;
};

export type HistoryPage<T> = { items: T[]; nextBefore: number | null };
export type HistoryBatch<T> = { minSize: number; toOperationId: (item: T) => number };

const MAX_ROUNDS = 3;
const historyCursorSchema = z.object({ before: z.number().int().positive() });

function textOrNull(value: unknown): string | null {
  const normalized = normalize(value);
  return typeof normalized === "string" ? normalized : null;
}

async function loadStoredLocationRefs(locationIds: readonly number[]): Promise<StationHistoryLocation[]> {
  const rows = await db
    .select({ recordId: auditLogs.record_id, oldValues: auditLogs.old_values, newValues: auditLogs.new_values })
    .from(auditLogs)
    .where(and(eq(auditLogs.entity, "locations"), inArray(auditLogs.record_id, locationIds.map(String))))
    .orderBy(desc(auditLogs.id));

  const refs = new Map<number, StationHistoryLocation>();
  for (const row of rows) {
    const id = Number(row.recordId);
    const values = [row.newValues, row.oldValues].find(isPlainObject);
    if (refs.has(id) || values === undefined) continue;
    refs.set(id, { id, city: textOrNull(values.city), address: textOrNull(values.address) });
  }
  return [...refs.values()];
}

async function loadLocationRefs(locationIds: readonly number[]): Promise<Map<number, StationHistoryLocation>> {
  const wanted = [...new Set(locationIds)];
  if (wanted.length === 0) return new Map();

  const rows = await db
    .select({ id: locations.id, city: locations.city, address: locations.address })
    .from(locations)
    .where(inArray(locations.id, wanted));
  const refs = new Map(rows.map((row) => [row.id, row]));
  const missing = wanted.filter((id) => !refs.has(id));
  if (missing.length > 0) for (const ref of await loadStoredLocationRefs(missing)) refs.set(ref.id, ref);
  return refs;
}

async function loadStoredStructureOwnerNames(ownerIds: readonly number[]): Promise<Map<number, string>> {
  const rows = await db
    .select({ recordId: auditLogs.record_id, oldValues: auditLogs.old_values, newValues: auditLogs.new_values })
    .from(auditLogs)
    .where(and(eq(auditLogs.entity, "structure_owners"), inArray(auditLogs.record_id, ownerIds.map(String))))
    .orderBy(desc(auditLogs.id));

  const names = new Map<number, string>();
  for (const row of rows) {
    const id = Number(row.recordId);
    const name = textOrNull([row.newValues, row.oldValues].find(isPlainObject)?.name);
    if (!names.has(id) && name !== null) names.set(id, name);
  }
  return names;
}

async function loadStructureOwnerNames(ownerIds: readonly number[]): Promise<Map<number, string>> {
  const wanted = [...new Set(ownerIds)];
  if (wanted.length === 0) return new Map();

  const rows = await db
    .select({ id: structureOwners.id, name: structureOwners.name })
    .from(structureOwners)
    .where(inArray(structureOwners.id, wanted));
  const names = new Map(rows.map((row) => [row.id, row.name]));
  const missing = wanted.filter((id) => !names.has(id));
  if (missing.length > 0) for (const [id, name] of await loadStoredStructureOwnerNames(missing)) names.set(id, name);
  return names;
}

async function loadPhotoRefs(photoIds: readonly number[]): Promise<Map<number, StationHistoryPhoto>> {
  const wanted = [...new Set(photoIds)];
  if (wanted.length === 0) return new Map();

  const rows = await db
    .select({ id: locationPhotos.id, fileId: attachments.uuid, hasThumb: attachments.has_thumb, hasFull: attachments.has_full })
    .from(locationPhotos)
    .innerJoin(attachments, eq(attachments.id, locationPhotos.attachment_id))
    .where(inArray(locationPhotos.id, wanted));
  return new Map(rows.map((row) => [row.id, { id: row.fileId, urls: photoUrls(row.fileId, row.hasThumb, row.hasFull) }]));
}

async function loadAuthors(actorIds: readonly (string | null)[], viewer: UserRefViewer): Promise<Map<string, UserRef>> {
  const authorIds = unique(actorIds);
  if (!viewer.isStaff || authorIds.length === 0) return new Map();

  const rows = await db
    .select({ id: users.id, username: users.username, name: users.name, image: users.image, profileVisibility: users.profileVisibility })
    .from(users)
    .where(inArray(users.id, authorIds));
  return new Map(rows.map((row) => [row.id, toPublicUserRef(row, viewer)]));
}

export async function loadHistoryRows(
  station: HistoryStation,
  operationIds: readonly number[],
  liveAzimuths: ReadonlyMap<number, number>,
): Promise<HistoryRows> {
  const oldestOperationId = Math.min(...operationIds);
  const [operationRows, entries, sectorRows, coverage] = await Promise.all([
    db
      .select()
      .from(auditOperations)
      .where(inArray(auditOperations.id, [...operationIds]))
      .orderBy(desc(auditOperations.id)),
    db
      .select()
      .from(auditLogs)
      .where(and(inArray(auditLogs.operation_id, [...operationIds]), stationEntryCondition(station)))
      .orderBy(asc(auditLogs.id)),
    db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entity, "station_sectors"), eq(auditLogs.station_id, station.id), gte(auditLogs.operation_id, oldestOperationId))),
    loadActiveRevertCoverageByOperation(db, operationIds),
  ]);

  return {
    operations: operationRows.map((row) => ({ ...row, metadata: isPlainObject(row.metadata) ? row.metadata : null })),
    entries,
    sectorAzimuths: sectorAzimuthsByOperation(liveAzimuths, sectorRows, operationIds),
    coverage,
  };
}

export async function readHistoryPage<T>(
  station: HistoryStation,
  limit: number,
  cursor: number | null,
  loadItems: (operationIds: readonly number[]) => Promise<T[]>,
  batch?: HistoryBatch<T>,
): Promise<HistoryPage<T>> {
  const items: T[] = [];
  let before = cursor;
  let hasMore = true;
  /* eslint-disable no-await-in-loop */
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const needed = limit - items.length;
    if (!hasMore || needed <= 0) break;

    const batchSize = batch === undefined ? needed : Math.max(needed, batch.minSize);
    const idRows = await db
      .selectDistinct({ id: auditLogs.operation_id })
      .from(auditLogs)
      .where(and(stationEntryCondition(station), before === null ? undefined : lt(auditLogs.operation_id, before)))
      .orderBy(desc(auditLogs.operation_id))
      .limit(batchSize + 1);
    const operationIds = idRows.slice(0, batchSize).map((row) => row.id);
    if (operationIds.length === 0) {
      hasMore = false;
      break;
    }

    const batchItems = await loadItems(operationIds);
    const fitting = batch === undefined ? batchItems : batchItems.slice(0, needed);
    items.push(...fitting);
    const lastFitting = fitting.at(-1);
    if (batch !== undefined && lastFitting !== undefined && fitting.length < batchItems.length) {
      before = batch.toOperationId(lastFitting);
      break;
    }

    before = Math.min(...operationIds);
    hasMore = idRows.length > batchSize;
  }
  /* eslint-enable no-await-in-loop */

  return { items, nextBefore: hasMore ? before : null };
}

async function loadHistoryItems(
  station: StationRow,
  operationIds: readonly number[],
  { viewer, reach, liveAzimuths, unknownBandIds }: HistoryReadContext,
): Promise<StationHistoryItem[]> {
  const { operations, entries, sectorAzimuths, coverage } = await loadHistoryRows(station, operationIds, liveAzimuths);
  const [locationRefs, structureOwnerNames, photoRefs, authors] = await Promise.all([
    loadLocationRefs(entries.flatMap(locationChangeIds)),
    loadStructureOwnerNames(entries.flatMap(structureOwnerChangeIds)),
    loadPhotoRefs(entries.flatMap(photoChangeIds)),
    loadAuthors(
      operations.map((operation) => operation.actor_id),
      viewer,
    ),
  ]);
  const entriesByOperation = Map.groupBy(entries, (row) => row.operation_id);

  return operations.flatMap((operation): StationHistoryItem[] => {
    const context = {
      locations: locationRefs,
      structureOwnerNames,
      photos: photoRefs,
      unknownBandIds,
      sectorAzimuths: sectorAzimuths.get(operation.id),
    };
    const revert = { canRevert: isWithinReach(reach, operation.country_code), coverage: coverage.get(operation.id) };
    const changes = operationChanges(entriesByOperation.get(operation.id) ?? [], operation, context, revert);
    if (changes.length === 0) return [];

    const author = operation.actor_id === null ? null : (authors.get(operation.actor_id) ?? null);
    return [
      {
        id: operation.id,
        createdAt: operation.createdAt.toISOString(),
        source: operation.source,
        author,
        isRevert: operation.kind === "revert",
        changes,
      },
    ];
  });
}

export async function readStationHistory(req: FastifyRequest, station: StationRow, query: StationHistoryQuery): Promise<StationHistoryList> {
  const before = query.cursor === undefined ? null : decodeCursor(query.cursor, historyCursorSchema).before;
  const [viewer, reach, liveSectors, unknownBandIds] = await Promise.all([
    loadUserRefViewer(req),
    getAuditReach(req, "revert"),
    db.select({ id: stationSectors.id, azimuth: stationSectors.azimuth }).from(stationSectors).where(eq(stationSectors.station_id, station.id)),
    loadUnknownBandIds(),
  ]);
  const liveAzimuths = new Map(liveSectors.map((sector) => [sector.id, sector.azimuth]));
  const context: HistoryReadContext = { viewer, reach, liveAzimuths, unknownBandIds };

  const page = await readHistoryPage(station, query.limit, before, (operationIds) => loadHistoryItems(station, operationIds, context));
  const nextCursor = page.nextBefore === null ? null : encodeCursor({ before: page.nextBefore });
  return { data: page.items, paging: { limit: query.limit, nextCursor } };
}
