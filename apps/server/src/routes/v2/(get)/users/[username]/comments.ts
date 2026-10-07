import { stationComments, stations } from "@openbts/drizzle";
import { commentListSchema, userCommentListQuerySchema, userParamsSchema } from "@openbts/shared/contract";
import type { CommentList, Paging, UserCommentListQuery } from "@openbts/shared/contract";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { selectComments, serializeComments } from "../../../../../features/comments/read.js";
import { loadHiddenCountryCodes } from "../../../../../features/countries/visibility.js";
import { findProfileUser, isRestrictedProfile, profileCommentConditions } from "../../../../../features/users/profile.js";
import { loadUserRefViewer } from "../../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { encodeCursor, resolveOffset } from "../../../../../lib/cursor.js";
import { getRuntimeSettings } from "../../../../../lib/runtimeSettings.js";

const schemaRoute = {
  summary: "List a user's comments",
  description:
    "Returns the approved comments a user has written, newest first unless you change `sort`. " +
    "Comments on stations in countries you cannot access are left out. " +
    "If the profile is private, only its owner can list the comments. Everyone else gets a 404, including staff.",
  params: userParamsSchema,
  querystring: userCommentListQuerySchema,
  response: {
    200: commentListSchema,
  },
};
const errorReasons = {
  403:
    "Comments are disabled. Also returned when your API key or token cannot be used for this endpoint, " +
    "two-factor authentication still has to be set up, or the endpoint is disabled.",
  404: "No user has this username, or the profile is private and you are not its owner.",
};
type ReqParams = { Params: z.infer<typeof userParamsSchema> };
type ReqQuery = { Querystring: UserCommentListQuery };
type RequestData = ReqParams & ReqQuery;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<CommentList>>) {
  const { operatorIds, sort, include, limit, includeTotal } = req.query;
  if (!getRuntimeSettings().enableStationComments) throw new ErrorResponse("FEATURE_DISABLED");
  const offset = resolveOffset(req.query);

  const [user, viewer, hidden] = await Promise.all([findProfileUser(req.params.username), loadUserRefViewer(req), loadHiddenCountryCodes(req)]);
  if (isRestrictedProfile(user, viewer.userId)) throw new ErrorResponse("NOT_FOUND");

  const filters = and(...profileCommentConditions(user.id, hidden), operatorIds ? inArray(stations.operator_id, operatorIds) : undefined);
  const direction = sort === "createdAt" ? asc : desc;

  const [rows, totals] = await Promise.all([
    selectComments()
      .innerJoin(stations, eq(stations.id, stationComments.station_id))
      .where(filters)
      .orderBy(direction(stationComments.createdAt), direction(stationComments.id))
      .limit(limit + 1)
      .offset(offset),
    includeTotal
      ? db.select({ total: count() }).from(stationComments).innerJoin(stations, eq(stations.id, stationComments.station_id)).where(filters)
      : null,
  ]);
  const page = rows.slice(0, limit);
  const paging: Paging = { limit, nextCursor: rows.length > limit ? encodeCursor({ offset: offset + limit }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  res.header("Cache-Control", "private, no-store");
  return res.send({ data: await serializeComments(page, viewer, include), paging });
}

const getUserComments: Route<RequestData, CommentList> = {
  url: "/users/:username/comments",
  method: "GET",
  config: { allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getUserComments;
