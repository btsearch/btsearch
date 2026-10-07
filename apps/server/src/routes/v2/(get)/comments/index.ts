import { stationComments, stations } from "@openbts/drizzle";
import { commentListQuerySchema, commentListSchema } from "@openbts/shared/contract";
import type { CommentList, CommentListQuery, Paging } from "@openbts/shared/contract";
import { and, asc, count, desc, ilike, inArray, or, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";

import { STAFF_ROLES } from "../../../../constants.js";
import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { accessFromRequest } from "../../../../features/access/access.js";
import { stationInArea } from "../../../../features/access/filters.js";
import { selectComments, serializeComments } from "../../../../features/comments/read.js";
import { containsPattern } from "../../../../features/search/text.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { encodeCursor, resolveOffset } from "../../../../lib/cursor.js";

const schemaRoute = {
  summary: "List comments for moderation",
  description:
    "Returns comments from all stations, both pending and approved. " +
    "Administrators get every comment, and editors only get comments on stations in a country or region their grant covers. " +
    "`q` matches the comment text or the station's site id. " +
    "This endpoint keeps working while comments are disabled.",
  querystring: commentListQuerySchema,
  response: {
    200: commentListSchema,
  },
};
type ReqQuery = { Querystring: CommentListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<CommentList>>) {
  const { q, authorIds, statuses, sort, include, limit, includeTotal } = req.query;
  const offset = resolveOffset(req.query);

  const access = await accessFromRequest(req);
  if (access === null) throw new ErrorResponse("UNAUTHORIZED");

  const like = q ? containsPattern(q) : undefined;
  const filters = and(
    access.role === "admin" ? undefined : stationInArea(access.grants, stationComments.station_id),
    like
      ? or(
          ilike(stationComments.content, like),
          sql`EXISTS (SELECT 1 FROM ${stations} WHERE ${stations.id} = ${stationComments.station_id} AND ${ilike(stations.station_id, like)})`,
        )
      : undefined,
    authorIds ? inArray(stationComments.user_id, authorIds) : undefined,
    statuses ? inArray(stationComments.status, statuses) : undefined,
  );
  const direction = sort === "createdAt" ? asc : desc;

  const [rows, totals] = await Promise.all([
    selectComments()
      .where(filters)
      .orderBy(direction(stationComments.createdAt), direction(stationComments.id))
      .limit(limit + 1)
      .offset(offset),
    includeTotal ? db.select({ total: count() }).from(stationComments).where(filters) : null,
  ]);
  const page = rows.slice(0, limit);
  const paging: Paging = { limit, nextCursor: rows.length > limit ? encodeCursor({ offset: offset + limit }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  return res.send({
    data: await serializeComments(page, { userId: access.userId, isStaff: STAFF_ROLES.has(access.role) }, include),
    paging,
  });
}

const getComments: Route<ReqQuery, CommentList> = {
  url: "/comments",
  method: "GET",
  config: { permissions: ["read_all:comments"] },
  schema: schemaRoute,
  handler,
};

export default getComments;
