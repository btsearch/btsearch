import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import type { ReplyPayload } from "../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../interfaces/routes.interface.js";

interface Response {
  status: string;
  timestamp: string;
}

const schemaRoute = {
  response: {
    200: z.object({
      data: z.object({
        status: z.string(),
        timestamp: z.string(),
      }),
    }),
  },
};

async function handler(_: FastifyRequest, res: ReplyPayload<JSONBody<Response>>) {
  return res.send({
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
  });
}

const getHealth: Route<never, Response> = {
  url: "/health",
  method: "GET",
  schema: schemaRoute,
  config: { allowGuestAccess: true },
  handler,
};

export default getHealth;
