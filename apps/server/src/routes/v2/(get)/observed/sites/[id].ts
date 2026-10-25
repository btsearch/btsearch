import { observedSiteParamsSchema, observedSiteQuerySchema, observedSiteSchema } from "@openbts/shared/contract";
import type { ObservedSite, ObservedSiteQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadCellsOfSites } from "../../../../../features/observed/cells/read.js";
import { findSiteForCaller } from "../../../../../features/observed/sites/read.js";
import { toObservedSite } from "../../../../../features/observed/sites/serialize.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

type RequestData = { Params: z.infer<typeof observedSiteParamsSchema>; Querystring: ObservedSiteQuery };

const schemaRoute = {
  summary: "Get an estimated site",
  description:
    "You get a public site, one you measured, one inside your grants as an editor, and any site as an administrator. " +
    "Copies, members of a group and replaced sites are answered too.",
  params: observedSiteParamsSchema,
  querystring: observedSiteQuerySchema,
  response: {
    200: z.object({
      data: observedSiteSchema,
    }),
  },
};
const errorReasons = {
  403: "Observed data is switched off and you are not an administrator.",
  404: "No site you may see has this id.",
};

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ObservedSite>>) {
  res.header("Cache-Control", "private, no-store");

  const { id } = req.params;
  const { site, view } = await findSiteForCaller(req, id);
  const cells = req.query.include?.includes("cells") ? await loadCellsOfSites([id]) : null;

  return res.send({ data: toObservedSite(site, cells?.get(id), view) });
}

const getObservedSite: Route<RequestData, ObservedSite> = {
  url: "/observed/sites/:id",
  method: "GET",
  config: { permissions: ["read:observations"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getObservedSite;
