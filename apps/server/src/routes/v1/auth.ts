import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";

import { ErrorResponse } from "../../errors.js";
import { auth } from "../../plugins/betterauth.plugin.js";
import { logger } from "../../utils/logger.js";

async function handler(req: FastifyRequest, res: FastifyReply) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.append(key, value.toString());
    }

    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body: req.body ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body)) : undefined,
    });

    const response = await auth.handler(request);

    res.status(response.status);
    response.headers.forEach((value, key) => res.header(key, value));
    if (response.status === 500) throw new ErrorResponse("AUTH_FAILURE");
    res.send(response.body ? await response.text() : null);
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    logger.error("auth.handler", { error });
    throw new ErrorResponse("AUTH_FAILURE");
  }
}

const authRoutes = {
  url: "/auth/*",
  method: ["GET", "POST"],
  handler,
};

export default authRoutes;
