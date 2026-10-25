import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { redis } from "../../../../../database/redis.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../../interfaces/routes.interface.js";
import { auth } from "../../../../../plugins/betterauth.plugin.js";

const schemaRoute = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

type ReqParams = { Params: z.infer<typeof schemaRoute.params> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const key = await db.query.apikeys.findFirst({
    where: { id: req.params.id, referenceId: session.user.id },
    columns: { id: true, metadata: true },
  });

  if (!key) throw new ErrorResponse("NOT_FOUND");

  let meta: Record<string, unknown> = {};
  try {
    if (key.metadata) meta = JSON.parse(key.metadata) as Record<string, unknown>;
  } catch {}

  if (meta.type !== "publishable") throw new ErrorResponse("NOT_FOUND");

  await auth.api.deleteApiKey({ body: { keyId: key.id }, headers: fromNodeHeaders(req.headers) });
  await redis.del(`ratelimit:pk:${key.id}`);

  return res.status(204).send();
}

const deleteAccountPublishableKey: Route<ReqParams, void> = {
  url: "/account/publishable-keys/:id",
  method: "DELETE",
  schema: schemaRoute,
  handler,
};

export default deleteAccountPublishableKey;
