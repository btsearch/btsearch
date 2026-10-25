import type { FastifyReply, FastifyRequest } from "fastify";

import { ipHook } from "./ip.hook.js";

export async function OnRequestHook(req: FastifyRequest, res: FastifyReply) {
  req.requestStartTime = process.hrtime.bigint();
  res.header("x-request-id", req.id);

  ipHook(req, res, () => {});
}
