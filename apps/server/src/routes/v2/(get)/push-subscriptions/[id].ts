import { pushSubscriptions } from "@openbts/drizzle";
import { pushSubscriptionParamsSchema, pushSubscriptionSchema } from "@openbts/shared/contract";
import type { PushSubscription } from "@openbts/shared/contract";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { accountOwnerId } from "../../../../features/notifications/owner.js";
import { toPushSubscription } from "../../../../features/notifications/pushSubscriptions.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a push subscription",
  params: pushSubscriptionParamsSchema,
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: pushSubscriptionSchema,
    }),
  },
};
const errorReasons = {
  401: "You are not signed in, or the token you sent is invalid. API keys are not accepted here, so use a session or an OAuth token.",
  403:
    "The OAuth token does not have the `profile` scope. " +
    "Also returned when two-factor authentication still has to be set up or the endpoint is disabled.",
  404: "The subscription does not exist or is not yours.",
};
type ReqParams = { Params: z.infer<typeof pushSubscriptionParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<PushSubscription>>) {
  const userId = accountOwnerId(req);

  const [subscription] = await db
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.id, req.params.id), eq(pushSubscriptions.userId, userId)))
    .limit(1);
  if (!subscription) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: toPushSubscription(subscription) });
}

const getPushSubscription: Route<ReqParams, PushSubscription> = {
  url: "/push-subscriptions/:id",
  method: "GET",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default getPushSubscription;
