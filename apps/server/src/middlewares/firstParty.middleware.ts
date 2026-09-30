import type { FastifyReply, FastifyRequest } from "fastify";

import { isFirstPartyOrigin } from "../lib/firstPartyOrigin.js";

function getRequestOrigin(req: FastifyRequest): string | undefined {
  const { origin, referer } = req.headers;
  if (origin !== undefined) return origin;
  return referer !== undefined && URL.canParse(referer) ? new URL(referer).origin : undefined;
}

export function firstPartyOnlyHook(req: FastifyRequest, res: FastifyReply, done: (err?: Error) => void): void {
  if (req.headers["sec-fetch-site"] === "same-origin" || isFirstPartyOrigin(getRequestOrigin(req))) return done();
  res.status(403).send({ errors: [{ code: "FORBIDDEN", message: "This endpoint is only available to BTSearch." }] });
}
