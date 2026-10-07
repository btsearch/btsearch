import { pushSubscriptions } from "@openbts/drizzle";
import { pushSubscriptionParamsSchema, pushSubscriptionSchema, pushSubscriptionUpdateSchema } from "@openbts/shared/contract";
import type { PushSubscription, PushSubscriptionUpdate } from "@openbts/shared/contract";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { accountOwnerId } from "../../../../features/notifications/owner.js";
import { toPushSubscription, toStoredPreferences } from "../../../../features/notifications/pushSubscriptions.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update a push subscription",
  description: "Changes which topics one of your subscriptions is notified about. Topics you leave out keep their current setting.",
  params: pushSubscriptionParamsSchema,
  body: pushSubscriptionUpdateSchema,
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
type RequestData = { Params: z.infer<typeof pushSubscriptionParamsSchema>; Body: PushSubscriptionUpdate };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<PushSubscription>>) {
  const userId = accountOwnerId(req);
  const changed = JSON.stringify(toStoredPreferences(req.body.topics));

  const [updated] = await db
    .update(pushSubscriptions)
    .set({ preferences: sql`${pushSubscriptions.preferences} || ${changed}::jsonb` })
    .where(and(eq(pushSubscriptions.id, req.params.id), eq(pushSubscriptions.userId, userId)))
    .returning();
  if (!updated) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: toPushSubscription(updated) });
}

const updatePushSubscription: Route<RequestData, PushSubscription> = {
  url: "/push-subscriptions/:id",
  method: "PATCH",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default updatePushSubscription;
