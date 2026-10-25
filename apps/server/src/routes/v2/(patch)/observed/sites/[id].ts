import { observedSiteConflictSchema, observedSiteParamsSchema, observedSiteSchema, observedSiteUpdateSchema } from "@openbts/shared/contract";
import type { ObservedSite, ObservedSiteUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { observedSiteScope, updateObservedSite } from "../../../../../features/observed/review/siteUpdates.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Ignore an estimated site, or link it to a station",
  description:
    "Send `ignore` with a reason for a site that will not become a station in the database, such as a femtocell or a temporary mast. " +
    "It stays ignored until it gets new cells or its estimate moves beyond its radius. " +
    "Send `handLink` to link the site to a station by hand. The matcher never changes a link you made. " +
    "Each request carries one of the two. An ignore replaces a link made by hand, and a link replaces an ignore. " +
    "`null` takes either back, and the matcher then decides the site's status again. " +
    "The site's `ignore` and `handLink` show what was decided. The members of a group change together.",
  params: observedSiteParamsSchema,
  body: observedSiteUpdateSchema,
  response: {
    200: z.object({
      data: observedSiteSchema,
    }),
  },
};
const errorBodies = {
  409: z.object({
    errors: z.array(z.object({ code: z.literal("CONFLICT"), message: z.string(), details: z.array(observedSiteConflictSchema) })).min(1),
  }),
};
const errorReasons = {
  400: "The operator of the station in `handLink` neither runs nor shares the site's network, and none of the station's cells broadcasts it.",
  403:
    "Your editor access does not cover the region where the site is shown, or the station you link to. " +
    "Also returned while observed data is switched off, unless you are an administrator.",
  404: "Also answered for a station in `handLink` you cannot see, with `handLink/stationId` in `details[0].field`.",
  409:
    "The site cannot be changed, and `details[0].kind` says why: `copy` for a copy of another site, whose `observedSiteId` you change instead, " +
    "`replaced` for a site replaced by the sites in `replacedByObservedSiteIds`, " +
    "and `stationSite` for a site that holds the cells of the station in `stationId` and belongs to it.",
};
type RequestData = { Params: z.infer<typeof observedSiteParamsSchema>; Body: ObservedSiteUpdate };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ObservedSite>>) {
  return res.send({ data: await updateObservedSite(req) });
}

const updateObservedSiteRoute: Route<RequestData, ObservedSite> = {
  url: "/observed/sites/:id",
  method: "PATCH",
  config: { permissions: ["moderate:observations"], scope: observedSiteScope, errorBodies, errorReasons },
  schema: schemaRoute,
  handler,
};

export default updateObservedSiteRoute;
