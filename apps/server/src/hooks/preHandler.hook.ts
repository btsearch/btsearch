import type { FastifyReply, FastifyRequest } from "fastify";

import { authHook } from "../middlewares/auth.middleware.js";
import { idempotencyHook } from "../middlewares/idempotency.middleware.js";

export async function PreHandlerHook(req: FastifyRequest, res: FastifyReply) {
  await authHook(req);
  await idempotencyHook(req, res);
}
