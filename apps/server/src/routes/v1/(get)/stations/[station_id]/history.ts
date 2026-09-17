import { attachments, auditLogs, auditOperations, locationPhotos } from "@openbts/drizzle";
import type { AuditEntity } from "@openbts/shared/audit";
import { and, asc, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { getEntryRevertibility, loadActiveRevertCoverageByOperation } from "../../../../../services/audit/revert/revertibility.js";
import type { AuditOperationRow } from "../../../../../services/audit/types.js";
import {
  type StationHistoryAuthor,
  type StationHistoryLookups,
  type StationHistorySection,
  collectLocationSnapshotNames,
  enrichSectorAzimuths,
  transformEntry,
} from "../../../../../services/stations/history.js";

const HISTORY_ENTITIES: readonly AuditEntity[] = [
  "stations",
  "locations",
  "cells",
  "station_sectors",
  "extra_identificators",
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
});
const historyItemSchema = z.object({
  id: z.number(),
  operationId: z.number(),
  createdAt: z.date(),
  author: historyAuthorSchema.nullable().optional(),
  kind: z.enum(["station", "location", "cells", "sectors", "network_ids", "photos"]),
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

async function loadStaticLookups(stationId: number): Promise<Omit<StationHistoryLookups, "locations">> {
  const [bandRows, operatorRows, regionRows, sectorRows] = await Promise.all([
    db.query.bands.findMany({ columns: { id: true, name: true } }),
    db.query.operators.findMany({ columns: { id: true, name: true } }),
    db.query.regions.findMany({ columns: { id: true, name: true } }),
    db.query.stationSectors.findMany({ where: { station_id: stationId }, columns: { id: true, azimuth: true } }),
  ]);

  return {
    bands: new Map(bandRows.map((band) => [band.id, band.name])),
    operators: new Map(operatorRows.map((operator) => [operator.id, operator.name])),
    regions: new Map(regionRows.map((region) => [region.id, region.name])),
    sectorAzimuths: new Map(sectorRows.map((sector) => [sector.id, sector.azimuth])),
  };
}

async function resolveLocationNames(cache: Map<number, string>, ids: ReadonlySet<number>, rows: AuditRow[]): Promise<void> {
  const missing = [...ids].filter((id) => !cache.has(id));
  if (missing.length > 0) {
    const locationRows = await db.query.locations.findMany({ where: { id: { in: missing } }, columns: { id: true, city: true, address: true } });
    for (const location of locationRows) cache.set(location.id, [location.city, location.address].filter(Boolean).join(", ") || `#${location.id}`);
  }
  collectLocationSnapshotNames(cache, rows);
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

function collectPhotoIds(sections: StationHistorySection[]): Set<number> {
  const photoIds = new Set<number>();
  for (const section of sections) {
    for (const change of section.changes) {
      if (change.field !== "photo" && change.field !== "main_photo") continue;
      const fromId = parsePhotoId(change.from);
      const toId = parsePhotoId(change.to);
      if (fromId !== null) photoIds.add(fromId);
      if (toId !== null) photoIds.add(toId);
    }
  }
  return photoIds;
}

async function fetchPhotoReferences(sections: StationHistorySection[]): Promise<Map<number, StationHistoryPhotoReference>> {
  const photoIds = collectPhotoIds(sections);
  if (photoIds.size === 0) return new Map();

  const rows = await db
    .select({ id: locationPhotos.id, attachment_uuid: attachments.uuid })
    .from(locationPhotos)
    .innerJoin(attachments, eq(locationPhotos.attachment_id, attachments.id))
    .where(inArray(locationPhotos.id, [...photoIds]));
  return new Map(rows.map((photo) => [photo.id, photo]));
}

function resolvePhotoReferences(
  sections: StationHistorySection[],
  references: ReadonlyMap<number, StationHistoryPhotoReference>,
): StationHistoryPhotoReference[] {
  const result: StationHistoryPhotoReference[] = [];
  for (const photoId of collectPhotoIds(sections)) {
    const reference = references.get(photoId);
    if (reference !== undefined) result.push(reference);
  }
  return result;
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

  const [operationRows, auditRows, staticLookups] = await Promise.all([
    db.select().from(auditOperations).where(inArray(auditOperations.id, operationIds)).orderBy(desc(auditOperations.id)),
    db.select().from(auditLogs).where(inArray(auditLogs.operation_id, operationIds)).orderBy(asc(auditLogs.id)),
    loadStaticLookups(station_id),
  ]);
  const sectorAzimuths = new Map(staticLookups.sectorAzimuths);
  const locationNames = new Map<number, string>();
  enrichSectorAzimuths(sectorAzimuths, auditRows);
  await resolveLocationNames(locationNames, collectLocationIds(auditRows, station.location_id), auditRows);
  const lookups: StationHistoryLookups = { ...staticLookups, sectorAzimuths, locations: locationNames };

  const auditRowsByOperation = new Map<number, AuditRow[]>();
  for (const row of auditRows) {
    const rows = auditRowsByOperation.get(row.operation_id) ?? [];
    rows.push(row);
    auditRowsByOperation.set(row.operation_id, rows);
  }

  const canSeeAuthor = ["admin", "editor"].includes(req.userSession?.user?.role ?? "");
  const [authors, revertCoverageByOperation] = await Promise.all([
    canSeeAuthor ? fetchAuthors(operationRows) : Promise.resolve(new Map<string, StationHistoryAuthor>()),
    loadActiveRevertCoverageByOperation(db, operationIds),
  ]);

  const items: StationHistoryItem[] = [];
  for (const row of operationRows) {
    const operation = toOperationRow(row);
    const operationEntries = auditRowsByOperation.get(row.id) ?? [];
    const relevantEntries = operationEntries.filter((entry) => entryBelongsToStation(entry, station_id, station.location_id, station.createdAt));
    const revertCoverage = revertCoverageByOperation.get(row.id);
    const revertedEntryIds = revertCoverage?.revertedEntryIds ?? new Set<number>();
    const sections = mergeCellSections(
      relevantEntries.flatMap((entry) => {
        const section = transformEntry(entry, operation.kind, lookups);
        if (section === null) return [];
        const revertible = getEntryRevertibility(
          { ...entry, metadata: isRecord(entry.metadata) ? entry.metadata : null },
          { operation, revertedEntryIds },
        ).revertible;
        return [{ ...section, id: entry.id, entryIds: [entry.id], revertible }];
      }),
    );
    const author = row.actor_id === null ? null : (authors.get(row.actor_id) ?? null);
    for (const section of sections) {
      const fullyRevertedCount = section.entryIds.filter((id) => revertedEntryIds.has(id) && !revertCoverage?.incompleteEntryIds.has(id)).length;
      const hasRevertedEntry = section.entryIds.some((id) => revertedEntryIds.has(id));
      const revertStatus =
        operation.reverted_by_operation_id !== null || fullyRevertedCount === section.entryIds.length
          ? "complete"
          : hasRevertedEntry
            ? "partial"
            : "none";
      items.push({
        ...section,
        operationId: row.id,
        createdAt: row.createdAt,
        revertStatus,
        isRevert: row.kind === "revert",
        ...(canSeeAuthor ? { author } : {}),
        photoReferences: [],
      });
    }
  }

  const photoReferences = await fetchPhotoReferences(items);
  const responseItems = items.map((item) => ({
    ...item,
    photoReferences: resolvePhotoReferences([item], photoReferences),
  }));
  return res.send({
    data: responseItems,
    nextCursor: hasMore ? (operationIds[operationIds.length - 1] ?? null) : null,
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
