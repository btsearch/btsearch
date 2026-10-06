import { pushSubscriptions } from "@openbts/drizzle";
import { pushEndpointSchema } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  body: z.object({
    endpoint: pushEndpointSchema,
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }),
  response: {
    200: z.object({ data: z.object({ ok: z.boolean(), id: z.string() }) }),
  },
};

type ReqBody = { Body: { endpoint: string; keys: { p256dh: string; auth: string } } };
type ResponseData = { data: { ok: boolean; id: string } };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const { endpoint, keys } = req.body;

  const [sub] = await db
    .insert(pushSubscriptions)
    .values({
      userId: session.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    })
    .onConflictDoUpdate({
      target: [pushSubscriptions.endpoint],
      set: { userId: session.user.id, p256dh: keys.p256dh, auth: keys.auth },
      where: eq(pushSubscriptions.userId, session.user.id),
    })
    .returning({ id: pushSubscriptions.id });
  if (!sub) throw new ErrorResponse("INTERNAL_SERVER_ERROR", { message: "Failed to create or update push subscription" });

  return res.send({ data: { ok: true, id: sub.id } });
}

const subscribePush: Route<ReqBody, ResponseData> = {
  url: "/push/subscribe",
  method: "POST",
  schema: schemaRoute,
  handler,
};

export default subscribePush;
