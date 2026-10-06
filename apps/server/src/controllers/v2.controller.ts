import swagger from "@fastify/swagger";

import { buildSwaggerOptions } from "../features/openapi/document.js";
import type { FastifyZodInstance } from "../interfaces/fastify.interface.js";
import { registerRouteFiles } from "./routeLoader.js";

export async function APIv2Controller(fastify: FastifyZodInstance) {
  await fastify.register(swagger, buildSwaggerOptions(fastify.prefix));

  await registerRouteFiles(fastify, "v2");

  fastify.route({
    method: "GET",
    url: "/openapi.json",
    schema: { hide: true },
    handler: (_req, res) => res.send(fastify.swagger()),
  });
}
