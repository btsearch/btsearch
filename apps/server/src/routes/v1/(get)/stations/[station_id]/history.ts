import { attachments, auditLogs, locationPhotos } from "@openbts/drizzle";
import type { CountryFeatures } from "@openbts/shared/contract";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { type AuditReach, getAuditReach, isWithinReach } from "../../../../../features/audit/access.js";
import { getEntryRevertibility } from "../../../../../features/audit/revert/revertibility.js";
import type { AuditOperationRow } from "../../../../../features/audit/types.js";
import { disabledCountryFeatures, getStationCountryFeatures } from "../../../../../features/stations/countryFeatures.js";
import {
  NAMED_ENTITIES,
  type NameSource,
  type NamedEntity,
  type StationHistoryAuthor,
  type StationHistoryChange,
  type StationHistoryLookups,
  type StationHistorySection,
  collectNameChanges,
  groupRowsByOperation,
  locationName,
  movesCellSector,
  namesAsOf,
  referencedIds,
  revertStatus,
  transformEntry,
} from "../../../../../features/stations/history.js";
import { loadHistoryRows, readHistoryPage } from "../../../../../features/stations/historyRead.js";
import type { AuditRow, HistoryStation } from "../../../../../features/stations/historyRows.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const DEFAULT_LIMIT = 25;

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
    limit: z.coerce.number().int().min(1).max(100).default(DEFAULT_LIMIT),
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
type OperationItem = Omit<StationHistoryItem, "photoReferences">;
type ShownOperation = { operationId: number; items: OperationItem[] };
type HistoryViewer = { canSeeAuthor: boolean; reach: AuditReach };
type NameIds = Record<NamedEntity, number[]>;
type NameSources = Record<NamedEntity, NameSource>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function loadCurrentNames(ids: NameIds): Promise<Record<NamedEntity, Map<number, string>>> {
  const [operatorRows, bandRows, regionRows, locationRows] = await Promise.all([
    db.query.operators.findMany({ where: { id: { in: ids.operators } }, columns: { id: true, name: true } }),
    db.query.bands.findMany({ where: { id: { in: ids.bands } }, columns: { id: true, name: true } }),
    db.query.regions.findMany({ where: { id: { in: ids.regions } }, columns: { id: true, name: true } }),
    db.query.locations.findMany({ where: { id: { in: ids.locations } }, columns: { id: true, city: true, address: true } }),
  ]);

  return {
    operators: new Map(operatorRows.map((operator) => [operator.id, operator.name])),
    bands: new Map(bandRows.map((band) => [band.id, band.name])),
    regions: new Map(regionRows.map((region) => [region.id, region.name])),
    locations: new Map(locationRows.map((location) => [location.id, locationName(location.id, location.city, location.address)])),
  };
}

async function loadNameEntries(ids: NameIds): Promise<AuditRow[]> {
  const wanted = NAMED_ENTITIES.filter((named) => ids[named].length > 0);
  if (wanted.length === 0) return [];

  return db
    .select()
    .from(auditLogs)
    .where(or(...wanted.map((named) => and(eq(auditLogs.entity, named), inArray(auditLogs.record_id, ids[named].map(String))))))
    .orderBy(asc(auditLogs.operation_id), asc(auditLogs.id));
}

async function loadNameSources(entries: readonly AuditRow[]): Promise<NameSources> {
  const ids = {
    operators: referencedIds(entries, "operators"),
    bands: referencedIds(entries, "bands"),
    regions: referencedIds(entries, "regions"),
    locations: referencedIds(entries, "locations"),
  };
  const [current, nameEntries] = await Promise.all([loadCurrentNames(ids), loadNameEntries(ids)]);

  return {
    operators: { current: current.operators, changes: collectNameChanges(nameEntries, "operators") },
    bands: { current: current.bands, changes: collectNameChanges(nameEntries, "bands") },
    regions: { current: current.regions, changes: collectNameChanges(nameEntries, "regions") },
    locations: { current: current.locations, changes: collectNameChanges(nameEntries, "locations") },
  };
}

async function fetchAuthors(rows: readonly AuditOperationRow[]): Promise<Map<string, StationHistoryAuthor>> {
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

async function loadShownOperations(
  station: HistoryStation,
  operationIds: readonly number[],
  liveAzimuths: ReadonlyMap<number, number>,
  viewer: HistoryViewer,
  countryFeatures: Readonly<CountryFeatures>,
): Promise<ShownOperation[]> {
  const { operations, entries, sectorAzimuths, coverage } = await loadHistoryRows(station, operationIds, liveAzimuths);
  const [nameSources, authors] = await Promise.all([
    loadNameSources(entries),
    viewer.canSeeAuthor ? fetchAuthors(operations) : Promise.resolve(new Map<string, StationHistoryAuthor>()),
  ]);
  const entriesByOperation = groupRowsByOperation(entries);

  return operations.flatMap((operation): ShownOperation[] => {
    const lookups: StationHistoryLookups = {
      countryFeatures,
      operators: namesAsOf(nameSources.operators, operation.id),
      bands: namesAsOf(nameSources.bands, operation.id),
      regions: namesAsOf(nameSources.regions, operation.id),
      locations: namesAsOf(nameSources.locations, operation.id),
      sectorAzimuths: sectorAzimuths.get(operation.id),
    };
    const revertCoverage = coverage.get(operation.id);
    const revertedEntryIds = revertCoverage?.revertedEntryIds ?? new Set<number>();
    const sections = historySections(entriesByOperation.get(operation.id) ?? [], operation, lookups, revertedEntryIds);
    if (sections.length === 0) return [];

    const canRevert = isWithinReach(viewer.reach, operation.country_code);
    const author = operation.actor_id === null ? null : (authors.get(operation.actor_id) ?? null);
    const items = sections.map((section) => {
      const item: OperationItem = {
        ...section,
        entryIds: canRevert ? section.entryIds : [],
        revertible: canRevert && section.revertible,
        operationId: operation.id,
        createdAt: operation.createdAt,
        revertStatus: revertStatus(section.entryIds, operation, revertCoverage),
        isRevert: operation.kind === "revert",
      };
      if (viewer.canSeeAuthor) item.author = author;
      return item;
    });
    return [{ operationId: operation.id, items }];
  });
}

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const { station_id } = req.params;
  const { limit, cursor } = req.query;

  const station = await db.query.stations.findFirst({ where: { id: station_id } });
  if (!station) throw new ErrorResponse("NOT_FOUND");

  const [reach, liveSectors, featuresByStation] = await Promise.all([
    getAuditReach(req, "revert"),
    db.query.stationSectors.findMany({ where: { station_id }, columns: { id: true, azimuth: true } }),
    getStationCountryFeatures([station_id]),
  ]);
  const liveAzimuths = new Map(liveSectors.map((sector) => [sector.id, sector.azimuth]));
  const viewer: HistoryViewer = { canSeeAuthor: ["admin", "editor"].includes(req.userSession?.user?.role ?? ""), reach };
  const countryFeatures = featuresByStation.get(station_id) ?? disabledCountryFeatures;
  const loadItems = (operationIds: readonly number[]) => loadShownOperations(station, operationIds, liveAzimuths, viewer, countryFeatures);
  const batch = { minSize: DEFAULT_LIMIT, toOperationId: (operation: ShownOperation) => operation.operationId };

  const page = await readHistoryPage(station, limit, cursor ?? null, loadItems, batch);
  const items = page.items.flatMap((operation) => operation.items);
  const photoReferences = await fetchPhotoReferences(new Set(items.flatMap((item) => collectPhotoIds(item.changes))));
  return res.send({
    data: items.map((item) => ({
      ...item,
      photoReferences: collectPhotoIds(item.changes).flatMap((photoId) => photoReferences.get(photoId) ?? []),
    })),
    nextCursor: page.nextBefore,
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
