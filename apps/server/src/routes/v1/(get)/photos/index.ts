import { attachments, locationPhotos, locations, operators, regions, stationPhotoSelections, stations, users } from "@openbts/drizzle";
import { and, asc, count, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const authorSchema = z.object({ uuid: z.string(), username: z.string(), name: z.string() }).nullable();
const operatorSchema = z.object({ id: z.number(), name: z.string(), mnc: z.number().nullable() }).nullable();

const photoItemSchema = z.object({
  id: z.number(),
  location_photo_id: z.number(),
  attachment_uuid: z.string(),
  mime_type: z.string(),
  is_main: z.boolean(),
  note: z.string().nullable(),
  taken_at: z.string().nullable(),
  createdAt: z.string(),
  author: authorSchema,
  station: z.object({
    id: z.number(),
    station_id: z.string(),
    status: z.enum(["published", "inactive", "pending"]),
    operator: operatorSchema,
  }),
  location: z.object({
    id: z.number(),
    city: z.string().nullable(),
    address: z.string().nullable(),
    label: z.string(),
    latitude: z.number(),
    longitude: z.number(),
  }),
});

const ALLOWED_PHOTO_STATUSES = ["published", "pending"] as const;
type PhotoStationStatus = (typeof ALLOWED_PHOTO_STATUSES)[number];

const schemaRoute = {
  querystring: z.object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    page: z.coerce.number().int().min(1).default(1),
    q: z.string().trim().optional(),
    operator: z.coerce.number().int().optional(),
    region: z.string().trim().length(3).optional(),
    status: z.string().trim().optional(),
    mainOnly: z.coerce.boolean().optional().default(false),
    recentDays: z.coerce.number().int().min(1).max(365).optional(),
    sortBy: z.enum(["uploaded", "taken", "station"]).optional().default("uploaded"),
    order: z.enum(["asc", "desc"]).optional().default("desc"),
  }),
  response: {
    200: z.object({
      data: z.array(photoItemSchema),
      totalCount: z.number(),
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type PhotoItem = z.infer<typeof photoItemSchema>;
type ResponseBody = z.infer<(typeof schemaRoute.response)["200"]>;

function getLocationLabel(city: string | null, address: string | null, locationId: number) {
  const parts = [city, address].filter((part): part is string => typeof part === "string" && part.length > 0);
  return parts.length > 0 ? parts.join(", ") : `Location #${locationId}`;
}

function getRecentDateIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function getOrderBy(sortBy: ReqQuery["Querystring"]["sortBy"], order: ReqQuery["Querystring"]["order"]) {
  const direction = order === "desc" ? desc : asc;

  if (sortBy === "uploaded") return [direction(locationPhotos.createdAt), desc(stationPhotoSelections.id)];
  if (sortBy === "taken") return [direction(sql`coalesce(${locationPhotos.taken_at}, ${locationPhotos.createdAt})`), desc(stationPhotoSelections.id)];

  return [direction(stations.station_id), desc(locationPhotos.createdAt), desc(stationPhotoSelections.id)];
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const { limit, page, q, operator, region, status, mainOnly, recentDays, sortBy, order } = req.query;
  const offset = (page - 1) * limit;
  const requestedStatuses = (status?.split(",") ?? []).filter((value): value is PhotoStationStatus =>
    (ALLOWED_PHOTO_STATUSES as readonly string[]).includes(value),
  );
  const filters: SQL[] = [inArray(stations.status, requestedStatuses.length > 0 ? requestedStatuses : [...ALLOWED_PHOTO_STATUSES])];

  if (q) {
    const query = `%${q}%`;
    const searchClause = or(
      ilike(stations.station_id, query),
      ilike(locations.city, query),
      ilike(locations.address, query),
      ilike(regions.name, query),
      ilike(regions.code, query),
      ilike(locationPhotos.note, query),
    );
    if (searchClause) filters.push(searchClause);
  }

  if (operator !== undefined) filters.push(eq(stations.operator_id, operator));
  if (region !== undefined) filters.push(eq(regions.code, region.toUpperCase()));
  if (mainOnly) filters.push(eq(stationPhotoSelections.is_main, true));
  if (recentDays !== undefined)
    filters.push(gte(sql`coalesce(${locationPhotos.taken_at}, ${locationPhotos.createdAt})`, getRecentDateIso(recentDays)));

  const whereClause = and(...filters);
  const orderBy = getOrderBy(sortBy, order);

  const countQuery = db
    .select({ count: count() })
    .from(stationPhotoSelections)
    .innerJoin(stations, eq(stationPhotoSelections.station_id, stations.id))
    .innerJoin(locationPhotos, eq(stationPhotoSelections.location_photo_id, locationPhotos.id))
    .innerJoin(attachments, eq(locationPhotos.attachment_id, attachments.id))
    .innerJoin(locations, eq(locationPhotos.location_id, locations.id))
    .leftJoin(regions, eq(locations.region_id, regions.id))
    .where(whereClause);

  const [countResult, rows] = await Promise.all([
    countQuery,
    db
      .select({
        id: stationPhotoSelections.id,
        location_photo_id: locationPhotos.id,
        attachment_uuid: attachments.uuid,
        mime_type: attachments.mime_type,
        is_main: stationPhotoSelections.is_main,
        note: locationPhotos.note,
        taken_at: locationPhotos.taken_at,
        createdAt: locationPhotos.createdAt,
        author_uuid: users.id,
        author_username: users.username,
        author_name: users.name,
        station_id: stations.id,
        station_identifier: stations.station_id,
        station_status: stations.status,
        operator_id: operators.id,
        operator_name: operators.name,
        operator_mnc: operators.mnc,
        location_id: locations.id,
        location_city: locations.city,
        location_address: locations.address,
        location_latitude: locations.latitude,
        location_longitude: locations.longitude,
      })
      .from(stationPhotoSelections)
      .innerJoin(stations, eq(stationPhotoSelections.station_id, stations.id))
      .innerJoin(locationPhotos, eq(stationPhotoSelections.location_photo_id, locationPhotos.id))
      .innerJoin(attachments, eq(locationPhotos.attachment_id, attachments.id))
      .innerJoin(locations, eq(locationPhotos.location_id, locations.id))
      .leftJoin(regions, eq(locations.region_id, regions.id))
      .leftJoin(operators, eq(stations.operator_id, operators.id))
      .leftJoin(users, eq(locationPhotos.uploaded_by, users.id))
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset),
  ]);

  const totalCount = countResult[0]?.count ?? 0;
  const data: PhotoItem[] = rows.map((row) => ({
    id: row.id,
    location_photo_id: row.location_photo_id,
    attachment_uuid: row.attachment_uuid,
    mime_type: row.mime_type,
    is_main: row.is_main,
    note: row.note,
    taken_at: row.taken_at?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    author:
      row.author_uuid && row.author_username && row.author_name
        ? { uuid: row.author_uuid, username: row.author_username, name: row.author_name }
        : null,
    station: {
      id: row.station_id,
      station_id: row.station_identifier,
      status: row.station_status,
      operator:
        row.operator_id !== null && row.operator_name !== null ? { id: row.operator_id, name: row.operator_name, mnc: row.operator_mnc } : null,
    },
    location: {
      id: row.location_id,
      city: row.location_city,
      address: row.location_address,
      label: getLocationLabel(row.location_city, row.location_address, row.location_id),
      latitude: row.location_latitude,
      longitude: row.location_longitude,
    },
  }));

  return res.send({ data, totalCount });
}

const getPhotos: Route<ReqQuery, ResponseBody> = {
  url: "/photos",
  method: "GET",
  schema: schemaRoute,
  config: {
    allowGuestAccess: true,
  },
  handler,
};

export default getPhotos;
