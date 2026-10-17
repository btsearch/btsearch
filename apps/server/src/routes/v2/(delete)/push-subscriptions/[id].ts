import { pushSubscriptions } from "@openbts/drizzle";
import { noContentSchema, pushSubscriptionParamsSchema } from "@openbts/shared/contract";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { accountOwnerId } from "../../../../features/notifications/owner.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Delete a push subscription",
  description: "You get 204 even when the subscription does not exist or is not yours, so it is safe to repeat the request.",
  params: pushSubscriptionParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  401: "API keys are not accepted here.",
  403: "The OAuth token does not have the `profile` scope.",
  404: null,
};
type ReqParams = { Params: z.infer<typeof pushSubscriptionParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const userId = accountOwnerId(req);

  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.id, req.params.id), eq(pushSubscriptions.userId, userId)));

  return res.status(204).send();
}

const deletePushSubscription: Route<ReqParams, void> = {
  url: "/push-subscriptions/:id",
  method: "DELETE",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default deletePushSubscription;
