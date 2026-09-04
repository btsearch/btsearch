import type { FastifyReply, FastifyRequest, RequestPayload } from "fastify";

export async function OnSendHook(req: FastifyRequest, res: FastifyReply, payload: RequestPayload) {
  const duration = process.hrtime.bigint() - req?.requestStartTime;

  res.header("x-response-time", `${(Number(duration) / 1e6).toFixed(3)} ms`);
  return payload;
}
