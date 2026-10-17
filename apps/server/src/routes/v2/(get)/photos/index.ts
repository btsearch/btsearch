import { attachments, locationPhotos, locations, regions, stationPhotoSelections, stations, users } from "@openbts/drizzle";
import { DEFAULT_STATION_STATUSES, photoListQuerySchema, photoListSchema } from "@openbts/shared/contract";
import type { Paging, PhotoList, PhotoListQuery, PhotoSort } from "@openbts/shared/contract";
import { type SQL, and, asc, count, desc, eq, gte, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";

import db from "../../../../database/psql.js";
import { loadHiddenCountryCodes } from "../../../../features/countries/visibility.js";
import { photoColumns, serializePhotos } from "../../../../features/photos/read.js";
import { containsPattern } from "../../../../features/search/text.js";
import { operatorCondition } from "../../../../features/stations/read.js";
import { DATABASE_STATUSES } from "../../../../features/stations/serialize.js";
import { loadUserRefViewer } from "../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { encodeCursor, resolveOffset } from "../../../../lib/cursor.js";

const schemaRoute = {
  summary: "List photos",
  description: "Only photos that at least one station shows are returned.",
  querystring: photoListQuerySchema,
  response: {
    200: photoListSchema,
  },
};
type ReqQuery = { Querystring: PhotoListQuery };

const takenOrUploadedAt = sql`COALESCE(${locationPhotos.taken_at}, ${locationPhotos.createdAt})`;

function getOrderBy(sort: PhotoSort, firstSiteId: SQL): SQL[] {
  const direction = sort.startsWith("-") ? desc : asc;
  const newestFirst = desc(locationPhotos.id);

  if (sort === "createdAt" || sort === "-createdAt") return [direction(locationPhotos.createdAt), newestFirst];
  if (sort === "takenAt" || sort === "-takenAt") return [direction(takenOrUploadedAt), newestFirst];
  return [direction(firstSiteId), desc(locationPhotos.createdAt), newestFirst];
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<PhotoList>>) {
  const { q, operatorIds, keepOtherCountries, regionIds, countryCodes, statuses, isMain, takenAfter, createdAfter } = req.query;
  const { sort, include, limit, includeTotal } = req.query;
  const offset = resolveOffset(req.query);

  const [hidden, viewer] = await Promise.all([loadHiddenCountryCodes(req), loadUserRefViewer(req)]);

  const stationFilter = and(
    inArray(
      stations.status,
      (statuses ?? DEFAULT_STATION_STATUSES).map((status) => DATABASE_STATUSES[status]),
    ),
    operatorIds ? operatorCondition(operatorIds, keepOtherCountries === true, "location") : undefined,
    isMain === undefined ? undefined : eq(stationPhotoSelections.is_main, isMain),
  );
  const selectedBy = (extra?: SQL) => sql`EXISTS (
    SELECT 1 FROM ${stationPhotoSelections}
    INNER JOIN ${stations} ON ${stations.id} = ${stationPhotoSelections.station_id}
    WHERE ${stationPhotoSelections.location_photo_id} = ${locationPhotos.id}
    AND ${and(stationFilter, extra)}
  )`;
  const firstSiteId = sql`(
    SELECT MIN(${stations.station_id}) FROM ${stationPhotoSelections}
    INNER JOIN ${stations} ON ${stations.id} = ${stationPhotoSelections.station_id}
    WHERE ${stationPhotoSelections.location_photo_id} = ${locationPhotos.id}
    AND ${stationFilter}
  )`;

  const like = q ? containsPattern(q) : undefined;
  const filters = and(
    selectedBy(),
    like
      ? or(
          ilike(locations.city, like),
          ilike(locations.address, like),
          ilike(regions.name, like),
          ilike(regions.code, like),
          ilike(locationPhotos.note, like),
          selectedBy(ilike(stations.station_id, like)),
        )
      : undefined,
    regionIds ? inArray(locations.region_id, regionIds) : undefined,
    countryCodes ? inArray(regions.countryCode, countryCodes) : undefined,
    hidden.length > 0 ? notInArray(regions.countryCode, hidden) : undefined,
    takenAfter ? gte(takenOrUploadedAt, new Date(takenAfter).toISOString()) : undefined,
    createdAfter ? gte(locationPhotos.createdAt, new Date(createdAfter)) : undefined,
  );

  const [rows, totals] = await Promise.all([
    db
      .select(photoColumns)
      .from(locationPhotos)
      .innerJoin(attachments, eq(locationPhotos.attachment_id, attachments.id))
      .innerJoin(locations, eq(locations.id, locationPhotos.location_id))
      .innerJoin(regions, eq(regions.id, locations.region_id))
      .leftJoin(users, eq(locationPhotos.uploaded_by, users.id))
      .where(filters)
      .orderBy(...getOrderBy(sort, firstSiteId))
      .limit(limit + 1)
      .offset(offset),
    includeTotal
      ? db
          .select({ total: count() })
          .from(locationPhotos)
          .innerJoin(locations, eq(locations.id, locationPhotos.location_id))
          .innerJoin(regions, eq(regions.id, locations.region_id))
          .where(filters)
      : null,
  ]);
  const page = rows.slice(0, limit);
  const paging: Paging = { limit, nextCursor: rows.length > limit ? encodeCursor({ offset: offset + limit }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  return res.send({ data: await serializePhotos(page, viewer, include), paging });
}

const getPhotos: Route<ReqQuery, PhotoList> = {
  url: "/photos",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getPhotos;
