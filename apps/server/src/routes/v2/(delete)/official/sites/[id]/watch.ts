import { noContentSchema, officialSiteParamsSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import { accountOwnerId } from "../../../../../../features/notifications/owner.js";
import { unwatchOfficialSite } from "../../../../../../features/official/siteWatches.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Stop watching an official site",
  description: "Returns 204 even if you were not watching the site, or if it does not exist.",
  params: officialSiteParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  401: "API keys cannot be used here, because a watch belongs to a user account.",
  404: null,
};
type ReqParams = { Params: z.infer<typeof officialSiteParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const userId = accountOwnerId(req);

  await unwatchOfficialSite(userId, req.params.id);

  return res.status(204).send();
}

const unwatchSite: Route<ReqParams, void> = {
  url: "/official/sites/:id/watch",
  method: "DELETE",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default unwatchSite;
