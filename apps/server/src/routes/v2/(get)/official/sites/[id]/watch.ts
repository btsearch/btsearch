import { officialSiteParamsSchema, officialSiteWatchSchema } from "@openbts/shared/contract";
import type { OfficialSiteWatch } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { accountOwnerId } from "../../../../../../features/notifications/owner.js";
import { assertOfficialSiteVisible } from "../../../../../../features/official/sites.js";
import { isWatchingOfficialSite } from "../../../../../../features/official/siteWatches.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get an official site's watch status",
  params: officialSiteParamsSchema,
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: officialSiteWatchSchema,
    }),
  },
};
const errorReasons = {
  401: "API keys cannot be used here, because a watch belongs to a user account.",
};
type ReqParams = { Params: z.infer<typeof officialSiteParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<OfficialSiteWatch>>) {
  const userId = accountOwnerId(req);
  const [, isWatched] = await Promise.all([assertOfficialSiteVisible(req, req.params.id), isWatchingOfficialSite(userId, req.params.id)]);

  return res.send({ data: { isWatched } });
}

const getOfficialSiteWatch: Route<ReqParams, OfficialSiteWatch> = {
  url: "/official/sites/:id/watch",
  method: "GET",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default getOfficialSiteWatch;
