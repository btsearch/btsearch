import { pushSubscriptionCreateSchema, pushSubscriptionSchema } from "@openbts/shared/contract";
import type { PushSubscription, PushSubscriptionCreate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { accountOwnerId } from "../../../../features/notifications/owner.js";
import { savePushSubscription, toPushSubscription } from "../../../../features/notifications/pushSubscriptions.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Create a push subscription",
  description:
    "Registers a browser's push subscription for your account. A new subscription has every topic enabled except `officialDataUpdates`. " +
    "If the `endpoint` is already registered, that subscription is updated with the new keys instead of creating a second one, " +
    "and you still get 201. If it was registered by another account, it moves to yours and its topics go back to the defaults. " +
    "You can have up to 20 subscriptions. If you add more, the oldest ones are deleted.",
  body: pushSubscriptionCreateSchema,
  response: {
    201: z.object({
      data: pushSubscriptionSchema,
    }),
  },
};
const errorReasons = {
  401: "You are not signed in, or the token you sent is invalid. API keys are not accepted here, so use a session or an OAuth token.",
  403:
    "The OAuth token does not have the `profile` scope. " +
    "Also returned when two-factor authentication still has to be set up or the endpoint is disabled.",
};
type ReqBody = { Body: PushSubscriptionCreate };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<PushSubscription>>) {
  const userId = accountOwnerId(req);

  const saved = await savePushSubscription(userId, req.body);
  if (!saved) throw new ErrorResponse("FAILED_TO_CREATE");

  return res.status(201).send({ data: toPushSubscription(saved) });
}

const createPushSubscription: Route<ReqBody, PushSubscription> = {
  url: "/push-subscriptions",
  method: "POST",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default createPushSubscription;
