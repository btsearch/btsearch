import { stationComments } from "@openbts/drizzle";
import { commentSchema, stationCommentsParamsSchema, stationCommentsQuerySchema } from "@openbts/shared/contract";
import type { Comment, StationCommentsQuery } from "@openbts/shared/contract";
import { and, desc, eq, or } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { selectComments, serializeComments } from "../../../../../features/comments/read.js";
import { canModerateComments } from "../../../../../features/comments/write.js";
import { findVisibleStation } from "../../../../../features/stations/read.js";
import { loadUserRefViewer } from "../../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../../lib/runtimeSettings.js";

const schemaRoute = {
  summary: "List a station's comments",
  description:
    "Returns the approved comments on a station, newest first, all in one response. " +
    "If you are signed in or use an API key, your own comments that are still `pending` are included as well. " +
    "Moderators can send `includePending=true` to also get the comments of other users that are still `pending`, " +
    "for example to approve them with `PATCH /comments/{id}`. " +
    "A moderator is an administrator, or an editor whose grant covers the station. " +
    "An author's `name` is `null` when their profile is not public, " +
    "unless you are signed in as an editor or an administrator, or you are the author yourself.",
  params: stationCommentsParamsSchema,
  querystring: stationCommentsQuerySchema,
  response: {
    200: z.object({
      data: z.array(commentSchema),
    }),
  },
};
const errorReasons = {
  403:
    "Comments are disabled, or you sent `includePending=true` without being a moderator of this station. " +
    "Also returned when your API key or token cannot be used for this endpoint, " +
    "two-factor authentication still has to be set up, or the endpoint is disabled.",
  404: "The station does not exist, or it is in a country you cannot access.",
};
type RequestData = { Params: z.infer<typeof stationCommentsParamsSchema>; Querystring: StationCommentsQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Comment[]>>) {
  const { id } = req.params;
  const { includePending } = req.query;
  if (!getRuntimeSettings().enableStationComments) throw new ErrorResponse("FEATURE_DISABLED");
  await findVisibleStation(req, id);
  if (includePending && !(await canModerateComments(req, id))) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");

  const viewer = await loadUserRefViewer(req);
  const isApproved = eq(stationComments.status, "approved");
  const isOwn = viewer.userId === null ? undefined : eq(stationComments.user_id, viewer.userId);
  const isRequestedPending = includePending ? eq(stationComments.status, "pending") : undefined;
  const rows = await selectComments()
    .where(and(eq(stationComments.station_id, id), or(isApproved, isOwn, isRequestedPending)))
    .orderBy(desc(stationComments.createdAt));

  res.header("Cache-Control", "private, no-store");
  return res.send({ data: await serializeComments(rows, viewer) });
}

const getStationComments: Route<RequestData, Comment[]> = {
  url: "/stations/:id/comments",
  method: "GET",
  config: { permissions: ["read:stations"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getStationComments;
