import { photoListSchema, userParamsSchema, userPhotoListQuerySchema } from "@openbts/shared/contract";
import type { Paging, PhotoList, UserPhotoListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { loadHiddenCountryCodes } from "../../../../../features/countries/visibility.js";
import { countUserPhotos, loadUserPhotoRows, serializePhotos } from "../../../../../features/photos/read.js";
import { findProfileUser, isRestrictedProfile } from "../../../../../features/users/profile.js";
import { loadUserRefViewer } from "../../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { encodeCursor, resolveOffset } from "../../../../../lib/cursor.js";

const schemaRoute = {
  summary: "List a user's photos",
  description:
    "Only photos that at least one station shows are listed, newest first. " +
    "A photo placed at several locations is listed once, at its most recent location.",
  params: userParamsSchema,
  querystring: userPhotoListQuerySchema,
  response: {
    200: photoListSchema,
  },
};
const errorReasons = {
  404: "No user has this username, or the profile is private and you are not its owner.",
};
type ReqParams = { Params: z.infer<typeof userParamsSchema> };
type ReqQuery = { Querystring: UserPhotoListQuery };
type RequestData = ReqParams & ReqQuery;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<PhotoList>>) {
  const { include, limit, includeTotal } = req.query;
  const offset = resolveOffset(req.query);

  const [user, viewer, hidden] = await Promise.all([findProfileUser(req.params.username), loadUserRefViewer(req), loadHiddenCountryCodes(req)]);
  if (isRestrictedProfile(user, viewer.userId)) throw new ErrorResponse("NOT_FOUND");

  const [rows, total] = await Promise.all([
    loadUserPhotoRows(user.id, hidden, limit + 1, offset),
    includeTotal ? countUserPhotos(user.id, hidden) : null,
  ]);
  const page = rows.slice(0, limit);
  const paging: Paging = { limit, nextCursor: rows.length > limit ? encodeCursor({ offset: offset + limit }) : null };
  if (total !== null) paging.total = total;

  res.header("Cache-Control", "private, no-store");
  return res.send({ data: await serializePhotos(page, viewer, include), paging });
}

const getUserPhotos: Route<RequestData, PhotoList> = {
  url: "/users/:username/photos",
  method: "GET",
  config: { allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getUserPhotos;
