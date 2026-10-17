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
  401: "API keys are not accepted here.",
  403: "The OAuth token does not have the `profile` scope.",
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
