import { noContentSchema, officialSiteParamsSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import { accountOwnerId } from "../../../../../../features/notifications/owner.js";
import { assertOfficialSiteVisible } from "../../../../../../features/official/sites.js";
import { watchOfficialSite } from "../../../../../../features/official/siteWatches.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Watch an official site",
  description: "You are notified when permits are added to the site or removed from it.",
  params: officialSiteParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  401: "API keys cannot be used here, because a watch belongs to a user account.",
};
type ReqParams = { Params: z.infer<typeof officialSiteParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const userId = accountOwnerId(req);
  await assertOfficialSiteVisible(req, req.params.id);

  await watchOfficialSite(userId, req.params.id);

  return res.status(204).send();
}

const watchSite: Route<ReqParams, void> = {
  url: "/official/sites/:id/watch",
  method: "PUT",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default watchSite;
