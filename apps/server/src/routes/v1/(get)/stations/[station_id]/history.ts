import { attachments, auditLogs, auditOperations, locationPhotos } from "@openbts/drizzle";
import type { AuditEntity } from "@openbts/shared/audit";
import { and, asc, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { getEntryRevertibility, loadActiveRevertCoverageByOperation } from "../../../../../features/audit/revert/revertibility.js";
import type { AuditOperationRow } from "../../../../../features/audit/types.js";
import {
  type StationHistoryAuthor,
  type StationHistoryChange,
  type StationHistoryLookups,
  type StationHistorySection,
  collectLocationSnapshotNames,
  groupRowsByOperation,
  movesCellSector,
  sectorAzimuthsByOperation,
  transformEntry,
} from "../../../../../features/stations/history.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const HISTORY_ENTITIES: readonly AuditEntity[] = [
  "stations",
  "locations",
  "cells",
  "station_sectors",
  "extra_identificators",
  "station_uplinks",
  "station_photo_selections",
];

const historyValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const historyChangeValueSchema = z.union([historyValueSchema, z.array(historyValueSchema), z.record(z.string(), historyValueSchema)]);
const historyChangeSchema = z.object({
  field: z.string(),
  label: z.string().optional(),
  rat: z.string().optional(),
  from: historyChangeValueSchema,
  to: historyChangeValueSchema,
});
const historyAuthorSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  username: z.string(),
  image: z.string().nullable(),
});
const historyPhotoReferenceSchema = z.object({
  id: z.number(),
  attachment_uuid: z.string(),
  has_thumb: z.boolean(),
});
const historyItemSchema = z.object({
  id: z.number(),
  operationId: z.number(),
  createdAt: z.date(),
  author: historyAuthorSchema.nullable().optional(),
  kind: z.enum(["station", "location", "cells", "sectors", "network_ids", "uplink", "photos"]),
  action: z.enum(["create", "update", "delete"]),
  changes: z.array(historyChangeSchema),
  entryIds: z.array(z.number()),
  revertible: z.boolean(),
  revertStatus: z.enum(["none", "partial", "complete"]),
  isRevert: z.boolean(),
  photoReferences: z.array(historyPhotoReferenceSchema),
});

const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>().int(),
  }),
  querystring: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.coerce.number().int().positive().optional(),
  }),
  response: {
    200: z.object({
      data: z.array(historyItemSchema),
      nextCursor: z.number().nullable(),
    }),
  },
};

type ReqParams = { Params: z.infer<typeof schemaRoute.params> };
type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type RequestData = ReqParams & ReqQuery;
type StationHistoryPhotoReference = z.infer<typeof historyPhotoReferenceSchema>;
type StationHistoryItem = StationHistorySection & {
  id: number;
  operationId: number;
  createdAt: Date;
  author?: StationHistoryAuthor | null;
  entryIds: number[];
  revertible: boolean;
  revertStatus: "none" | "partial" | "complete";
  isRevert: boolean;
  photoReferences: StationHistoryPhotoReference[];
};
type ResponseBody = { data: StationHistoryItem[]; nextCursor: number | null };

type AuditRow = typeof auditLogs.$inferSelect;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectLocationIds(rows: AuditRow[], currentLocationId: number | null): Set<number> {
  const ids = new Set<number>();
  if (currentLocationId !== null) ids.add(currentLocationId);
  for (const row of rows) {
    if (row.entity === "locations" && row.record_id !== null) {
      const locationId = Number(row.record_id);
      if (Number.isInteger(locationId)) ids.add(locationId);
    }
    if (row.entity !== "stations") continue;
    for (const values of [row.old_values, row.new_values]) {
      if (!isRecord(values)) continue;
      if (typeof values.location_id === "number") ids.add(values.location_id);
    }
  }
  return ids;
}

async function loadStaticLookups(): Promise<Pick<StationHistoryLookups, "bands" | "operators" | "regions">> {
  const [bandRows, operatorRows, regionRows] = await Promise.all([
    db.query.bands.findMany({ columns: { id: true, name: true } }),
    db.query.operators.findMany({ columns: { id: true, name: true } }),
    db.query.regions.findMany({ columns: { id: true, name: true } }),
  ]);

  return {
    bands: new Map(bandRows.map((band) => [band.id, band.name])),
    operators: new Map(operatorRows.map((operator) => [operator.id, operator.name])),
    regions: new Map(regionRows.map((region) => [region.id, region.name])),
  };
}

async function loadLocationNames(rows: AuditRow[], currentLocationId: number | null): Promise<Map<number, string>> {
  const locationIds = collectLocationIds(rows, currentLocationId);
  const names = new Map<number, string>();
  if (locationIds.size > 0) {
    const locationRows = await db.query.locations.findMany({
      where: { id: { in: [...locationIds] } },
      columns: { id: true, city: true, address: true },
    });
    for (const location of locationRows) names.set(location.id, [location.city, location.address].filter(Boolean).join(", ") || `#${location.id}`);
  }
  collectLocationSnapshotNames(names, rows);
  return names;
}

async function fetchAuthors(rows: Array<typeof auditOperations.$inferSelect>): Promise<Map<string, StationHistoryAuthor>> {
  const authorIds = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => id !== null))];
  const authorRows =
    authorIds.length > 0
      ? await db.query.users.findMany({ where: { id: { in: authorIds } }, columns: { id: true, name: true, username: true, image: true } })
      : [];
  return new Map(
    authorRows.map((user) => [user.id, { id: user.id, name: user.name ?? null, username: user.username ?? "", image: user.image ?? null }]),
  );
}

function parsePhotoId(value: unknown): number | null {
  if (typeof value !== "string" || !value.startsWith("#")) return null;
  const photoId = Number(value.slice(1));
  return Number.isInteger(photoId) && photoId > 0 ? photoId : null;
}

function collectPhotoIds(changes: StationHistoryChange[]): number[] {
  const photoIds = new Set<number>();
  for (const change of changes) {
    if (change.field !== "photo" && change.field !== "main_photo") continue;
    for (const value of [change.from, change.to]) {
      const photoId = parsePhotoId(value);
      if (photoId !== null) photoIds.add(photoId);
    }
  }
  return [...photoIds];
}

async function fetchPhotoReferences(photoIds: ReadonlySet<number>): Promise<Map<number, StationHistoryPhotoReference>> {
  if (photoIds.size === 0) return new Map();

  const rows = await db
    .select({ id: locationPhotos.id, attachment_uuid: attachments.uuid, has_thumb: attachments.has_thumb })
    .from(locationPhotos)
    .innerJoin(attachments, eq(locationPhotos.attachment_id, attachments.id))
    .where(inArray(locationPhotos.id, [...photoIds]));
  return new Map(rows.map((photo) => [photo.id, photo]));
}

function toOperationRow(row: typeof auditOperations.$inferSelect): AuditOperationRow {
  return { ...row, metadata: isRecord(row.metadata) ? row.metadata : null };
}

function entryBelongsToStation(entry: AuditRow, stationId: number, locationId: number | null, stationCreatedAt: Date): boolean {
  if (!HISTORY_ENTITIES.includes(entry.entity)) return false;
  if (entry.station_id === stationId) return true;
  return entry.entity === "locations" && locationId !== null && entry.record_id === String(locationId) && entry.createdAt >= stationCreatedAt;
}

type HistorySectionWithEntries = StationHistorySection & {
  id: number;
  entryIds: number[];
  revertible: boolean;
};

function mergeCellSections(sections: HistorySectionWithEntries[]): HistorySectionWithEntries[] {
  const result: HistorySectionWithEntries[] = [];
  for (const section of sections) {
    if (section.kind !== "cells") {
      result.push(section);
      continue;
    }
    const existing = result.find((candidate) => candidate.kind === "cells" && candidate.action === section.action);
    if (existing !== undefined) {
      existing.changes.push(...section.changes);
      existing.entryIds.push(...section.entryIds);
      existing.revertible ||= section.revertible;
    } else result.push({ ...section, changes: [...section.changes], entryIds: [...section.entryIds] });
  }
  return result;
}

function historySections(
  entries: AuditRow[],
  operation: AuditOperationRow,
  lookups: StationHistoryLookups,
  revertedEntryIds: ReadonlySet<number>,
): HistorySectionWithEntries[] {
  const hiddenSectorMoveIds: number[] = [];
  const sections = mergeCellSections(
    entries.flatMap((entry) => {
      const section = transformEntry(entry, operation.kind, lookups);
      if (section === null) {
        if (movesCellSector(entry)) hiddenSectorMoveIds.push(entry.id);
        return [];
      }
      const revertible = getEntryRevertibility(
        { ...entry, metadata: isRecord(entry.metadata) ? entry.metadata : null },
        { operation, revertedEntryIds },
      ).revertible;
      return [{ ...section, id: entry.id, entryIds: [entry.id], revertible }];
    }),
  );
  sections.find((section) => section.kind === "sectors")?.entryIds.push(...hiddenSectorMoveIds);
  return sections;
}

function revertStatusOf(
  entryIds: readonly number[],
  operation: AuditOperationRow,
  coverage: { revertedEntryIds: ReadonlySet<number>; incompleteEntryIds: ReadonlySet<number> } | undefined,
): StationHistoryItem["revertStatus"] {
  if (operation.reverted_by_operation_id !== null) return "complete";
  if (entryIds.every((id) => coverage?.revertedEntryIds.has(id) && !coverage.incompleteEntryIds.has(id))) return "complete";
  if (entryIds.some((id) => coverage?.revertedEntryIds.has(id))) return "partial";
  return "none";
}

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const { station_id } = req.params;
  const { limit, cursor } = req.query;

  const station = await db.query.stations.findFirst({ where: { id: station_id } });
  if (!station) throw new ErrorResponse("NOT_FOUND");

  const directEntry = and(inArray(auditLogs.entity, HISTORY_ENTITIES), eq(auditLogs.station_id, station_id));
  const locationEntry =
    station.location_id === null
      ? undefined
      : and(eq(auditLogs.entity, "locations"), eq(auditLogs.record_id, String(station.location_id)), gte(auditLogs.createdAt, station.createdAt));
  const belongsToStation = locationEntry === undefined ? directEntry : or(directEntry, locationEntry);
  const operationFilter = cursor === undefined ? belongsToStation : and(belongsToStation, lt(auditLogs.operation_id, cursor));
  const operationIdRows = await db
    .selectDistinct({ id: auditLogs.operation_id })
    .from(auditLogs)
    .where(operationFilter)
    .orderBy(desc(auditLogs.operation_id))
    .limit(limit + 1);
  const hasMore = operationIdRows.length > limit;
  const operationIds = operationIdRows.slice(0, limit).map(({ id }) => id);
  if (operationIds.length === 0) return res.send({ data: [], nextCursor: null });
  const oldestOperationId = Math.min(...operationIds);

  const [operationRows, auditRows, liveSectors, sectorRows, staticLookups] = await Promise.all([
    db.select().from(auditOperations).where(inArray(auditOperations.id, operationIds)).orderBy(desc(auditOperations.id)),
    db.select().from(auditLogs).where(inArray(auditLogs.operation_id, operationIds)).orderBy(asc(auditLogs.id)),
    db.query.stationSectors.findMany({ where: { station_id }, columns: { id: true, azimuth: true } }),
    db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entity, "station_sectors"), eq(auditLogs.station_id, station_id), gte(auditLogs.operation_id, oldestOperationId))),
    loadStaticLookups(),
  ]);
  const lookups: StationHistoryLookups = { ...staticLookups, locations: await loadLocationNames(auditRows, station.location_id) };
  const liveSectorAzimuths = new Map(liveSectors.map((sector) => [sector.id, sector.azimuth]));
  const sectorAzimuthsAsOf = sectorAzimuthsByOperation(liveSectorAzimuths, sectorRows, operationIds);
  const auditRowsByOperation = groupRowsByOperation(auditRows);

  const canSeeAuthor = ["admin", "editor"].includes(req.userSession?.user?.role ?? "");
  const [authors, revertCoverageByOperation] = await Promise.all([
    canSeeAuthor ? fetchAuthors(operationRows) : Promise.resolve(new Map<string, StationHistoryAuthor>()),
    loadActiveRevertCoverageByOperation(db, operationIds),
  ]);

  const items = operationRows.flatMap((row) => {
    const operation = toOperationRow(row);
    const entries = (auditRowsByOperation.get(row.id) ?? []).filter((entry) =>
      entryBelongsToStation(entry, station_id, station.location_id, station.createdAt),
    );
    const revertCoverage = revertCoverageByOperation.get(row.id);
    const operationLookups: StationHistoryLookups = { ...lookups, sectorAzimuths: sectorAzimuthsAsOf.get(row.id) };
    const sections = historySections(entries, operation, operationLookups, revertCoverage?.revertedEntryIds ?? new Set<number>());
    const author = row.actor_id === null ? null : (authors.get(row.actor_id) ?? null);
    return sections.map((section) => ({
      ...section,
      operationId: row.id,
      createdAt: row.createdAt,
      revertStatus: revertStatusOf(section.entryIds, operation, revertCoverage),
      isRevert: row.kind === "revert",
      ...(canSeeAuthor ? { author } : {}),
    }));
  });

  const photoReferences = await fetchPhotoReferences(new Set(items.flatMap((item) => collectPhotoIds(item.changes))));
  return res.send({
    data: items.map((item) => ({
      ...item,
      photoReferences: collectPhotoIds(item.changes).flatMap((photoId) => photoReferences.get(photoId) ?? []),
    })),
    nextCursor: hasMore ? oldestOperationId : null,
  });
}

const getStationHistory: Route<RequestData, ResponseBody> = {
  url: "/stations/:station_id/history",
  method: "GET",
  config: { permissions: ["read:stations"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getStationHistory;
