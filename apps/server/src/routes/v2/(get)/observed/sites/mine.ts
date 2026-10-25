import { observedSiteListQuerySchema, observedSiteListSchema } from "@openbts/shared/contract";
import type { ObservedSiteList, ObservedSiteListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { ErrorResponse } from "../../../../../errors.js";
import { assertObservationsOn } from "../../../../../features/observed/access.js";
import { resolveObservedCellFilters } from "../../../../../features/observed/filters.js";
import { listObservedSites } from "../../../../../features/observed/sites/list.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

type ReqQuery = { Querystring: ObservedSiteListQuery };

const schemaRoute = {
  summary: "List your estimated sites that are not public",
  description:
    "Sites you measured that the public list leaves out: not confirmed yet, placed too loosely, measured only from close by, " +
    "or ignored by an editor. " +
    "When you measured one base station of a group, the whole group comes.",
  querystring: observedSiteListQuerySchema,
  response: {
    200: observedSiteListSchema,
  },
};
const errorReasons = {
  400: "The `cursor` is invalid, or `limit` is above 200 with `include`.",
  403: "Observed data is switched off and you are not an administrator.",
};

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ObservedSiteList>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  res.header("Cache-Control", "private, no-store");
  await assertObservationsOn(req);

  const filters = await resolveObservedCellFilters(req.query);
  return res.send(await listObservedSites(req.query, filters, { kind: "mine", userId }));
}

const getMyObservedSites: Route<ReqQuery, ObservedSiteList> = {
  url: "/observed/sites/mine",
  method: "GET",
  config: { permissions: ["upload:observations"], callers: ["app", "session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getMyObservedSites;
