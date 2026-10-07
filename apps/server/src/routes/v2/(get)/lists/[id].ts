import { listParamsSchema, listQuerySchema, listSchema } from "@openbts/shared/contract";
import type { List, ListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { actorIdFromRequest } from "../../../../features/access/access.js";
import { hasStaffPermission } from "../../../../features/access/staff.js";
import { loadHiddenCountryCodes } from "../../../../features/countries/visibility.js";
import { toLists } from "../../../../features/lists/serialize.js";
import { assertListsEnabled, findListForViewer } from "../../../../features/lists/visibility.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a list",
  description:
    "Returns one list. Guests and other users can only read lists that are public. " +
    "A private list is only returned to its owner and to administrators. " +
    "Asking for `include=owner` on someone else's list also needs an administrator. " +
    "`notificationsEnabled` is `null` unless the list is yours. " +
    "Stations in countries you cannot access are left out of `itemCounts.stations` and `items.stationIds`.",
  params: listParamsSchema,
  querystring: listQuerySchema,
  response: {
    200: z.object({
      data: listSchema,
    }),
  },
};
const errorReasons = {
  403: "Lists are disabled, or you asked for `include=owner` on someone else's list without being an administrator.",
  404: "The list does not exist, or it is private and not yours.",
};
type RequestData = { Params: z.infer<typeof listParamsSchema>; Querystring: ListQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<List>>) {
  assertListsEnabled();
  const viewerId = actorIdFromRequest(req);
  const { include } = req.query;

  const row = await findListForViewer(req, req.params.id, viewerId);
  const namesOwner = include?.includes("owner") && row.created_by !== viewerId;
  if (namesOwner && !(await hasStaffPermission(req, { user_lists: ["read_all"] }))) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");

  const [list] = await toLists([row], viewerId, await loadHiddenCountryCodes(req), include);
  if (!list) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: list });
}

const getList: Route<RequestData, List> = {
  url: "/lists/:id",
  method: "GET",
  config: { allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getList;
