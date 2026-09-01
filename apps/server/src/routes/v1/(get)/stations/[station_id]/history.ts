import { attachments, auditLogs, locationPhotos, submissions } from "@openbts/drizzle";
import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import {
  type StationHistoryAuthor,
  type StationHistoryEntry,
  type StationHistoryLookups,
  collectLocationSnapshotNames,
  enrichSectorAzimuths,
  transformAuditRow,
} from "../../../../../services/stations/history.js";

const HISTORY_TABLES = ["stations", "locations", "cells", "station_sectors", "extra_identificators"];
const BATCH_SIZE = 200;
const MAX_BATCHES = 10;

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
const historyEntrySchema = z.object({
  id: z.number(),
  kind: z.enum(["station", "location", "cells", "sectors", "network_ids", "photos"]),
  action: z.enum(["create", "update", "delete"]),
  createdAt: z.date(),
  changes: z.array(historyChangeSchema),
  author: historyAuthorSchema.nullable().optional(),
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
      data: z.array(historyEntrySchema),
      nextCursor: z.number().nullable(),
    }),
  },
};

type ReqParams = { Params: z.infer<typeof schemaRoute.params> };
type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type RequestData = ReqParams & ReqQuery;
type StationHistoryPhotoReference = z.infer<typeof historyPhotoReferenceSchema>;
type StationHistoryResponseEntry = StationHistoryEntry & { photoReferences: StationHistoryPhotoReference[] };
type ResponseBody = { data: StationHistoryResponseEntry[]; nextCursor: number | null };

type AuditRow = typeof auditLogs.$inferSelect;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectLocationIds(rows: AuditRow[], currentLocationId: number | null): Set<number> {
  const ids = new Set<number>();
  if (currentLocationId !== null) ids.add(currentLocationId);
  for (const row of rows) {
    if (row.table_name === "locations" && row.record_id !== null) ids.add(row.record_id);
    if (row.table_name !== "stations") continue;
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

async function fetchAuthors(rows: AuditRow[]): Promise<Map<string, StationHistoryAuthor>> {
  const authorIds = [...new Set(rows.map((row) => row.invoked_by).filter((id): id is string => id !== null))];
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

async function fetchPhotoReferences(entries: StationHistoryEntry[]): Promise<Map<number, StationHistoryPhotoReference>> {
  const photoIds = new Set<number>();
  for (const entry of entries) {
    for (const change of entry.changes) {
      if (change.field !== "photo" && change.field !== "main_photo") continue;
      const fromId = parsePhotoId(change.from);
      const toId = parsePhotoId(change.to);
      if (fromId !== null) photoIds.add(fromId);
      if (toId !== null) photoIds.add(toId);
    }
  }
  if (photoIds.size === 0) return new Map();

  const rows = await db
    .select({ id: locationPhotos.id, attachment_uuid: attachments.uuid })
    .from(locationPhotos)
    .innerJoin(attachments, eq(locationPhotos.attachment_id, attachments.id))
    .where(inArray(locationPhotos.id, [...photoIds]));
  return new Map(rows.map((photo) => [photo.id, photo]));
}

function resolveEntryPhotoReferences(
  entry: StationHistoryEntry,
  references: ReadonlyMap<number, StationHistoryPhotoReference>,
): StationHistoryPhotoReference[] {
  const entryPhotoIds = new Set<number>();
  for (const change of entry.changes) {
    if (change.field !== "photo" && change.field !== "main_photo") continue;
    const fromId = parsePhotoId(change.from);
    const toId = parsePhotoId(change.to);
    if (fromId !== null) entryPhotoIds.add(fromId);
    if (toId !== null) entryPhotoIds.add(toId);
  }

  const result: StationHistoryPhotoReference[] = [];
  for (const photoId of entryPhotoIds) {
    const reference = references.get(photoId);
    if (reference !== undefined) result.push(reference);
  }
  return result;
}

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const { station_id } = req.params;
  const { limit, cursor } = req.query;

  const station = await db.query.stations.findFirst({ where: { id: station_id } });
  if (!station) throw new ErrorResponse("NOT_FOUND");

  const [stationSubmissions, staticLookups] = await Promise.all([
    db.select({ id: submissions.id }).from(submissions).where(eq(submissions.station_id, station_id)),
    loadStaticLookups(station_id),
  ]);
  const submissionIds = stationSubmissions.map((submission) => submission.id);

  const conditions = [
    and(
      inArray(auditLogs.table_name, ["stations", "station_sectors", "extra_identificators", "station_photo_selections"]),
      eq(auditLogs.record_id, station_id),
    ),
    and(inArray(auditLogs.table_name, ["cells", "locations"]), sql`${auditLogs.metadata}->>'station_id' = ${String(station_id)}`),
  ];
  if (station.location_id !== null)
    conditions.push(
      and(eq(auditLogs.table_name, "locations"), eq(auditLogs.record_id, station.location_id), gte(auditLogs.createdAt, station.createdAt)),
    );
  if (submissionIds.length > 0)
    conditions.push(and(inArray(auditLogs.table_name, HISTORY_TABLES), inArray(sql`${auditLogs.metadata}->>'submission_id'`, submissionIds)));
  const baseWhere = or(...conditions);

  const sectorAzimuths = new Map(staticLookups.sectorAzimuths);
  const locationNames = new Map<number, string>();
  const entries: StationHistoryEntry[] = [];
  const rowByEntryId = new Map<number, AuditRow>();
  let scanCursor = cursor ?? null;
  let hasMoreRows = true;

  /* eslint-disable no-await-in-loop */
  for (let batch = 0; batch < MAX_BATCHES && entries.length <= limit; batch++) {
    const rows = await db
      .select()
      .from(auditLogs)
      .where(scanCursor !== null ? and(baseWhere, lt(auditLogs.id, scanCursor)) : baseWhere)
      .orderBy(desc(auditLogs.id))
      .limit(BATCH_SIZE);
    if (rows.length === 0) {
      hasMoreRows = false;
      break;
    }
    scanCursor = rows[rows.length - 1]?.id ?? scanCursor;

    enrichSectorAzimuths(sectorAzimuths, rows);
    await resolveLocationNames(locationNames, collectLocationIds(rows, station.location_id), rows);

    const lookups: StationHistoryLookups = { ...staticLookups, sectorAzimuths, locations: locationNames };
    for (const row of rows) {
      const entry = transformAuditRow(row, lookups);
      if (entry === null) continue;
      rowByEntryId.set(entry.id, row);
      entries.push(entry);
    }
    if (rows.length < BATCH_SIZE) {
      hasMoreRows = false;
      break;
    }
  }
  /* eslint-enable no-await-in-loop */

  const pageEntries = entries.slice(0, limit);
  let nextCursor: number | null = null;
  if (entries.length > limit) nextCursor = pageEntries[pageEntries.length - 1]?.id ?? null;
  else if (hasMoreRows) nextCursor = scanCursor;

  const photoReferencesPromise = fetchPhotoReferences(pageEntries);

  if (["admin", "editor"].includes(req.userSession?.user?.role ?? "") && pageEntries.length > 0) {
    const pageRows = pageEntries.map((entry) => rowByEntryId.get(entry.id)).filter((row): row is AuditRow => row !== undefined);
    const authors = await fetchAuthors(pageRows);
    for (const entry of pageEntries) {
      const invokedBy = rowByEntryId.get(entry.id)?.invoked_by ?? null;
      entry.author = invokedBy !== null ? (authors.get(invokedBy) ?? null) : null;
    }
  }

  const photoReferences = await photoReferencesPromise;
  const responseEntries = pageEntries.map((entry) => ({ ...entry, photoReferences: resolveEntryPhotoReferences(entry, photoReferences) }));
  return res.send({ data: responseEntries, nextCursor });
}

const getStationHistory: Route<RequestData, ResponseBody> = {
  url: "/stations/:station_id/history",
  method: "GET",
  config: { permissions: ["read:stations"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getStationHistory;
