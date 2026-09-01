import Fastify from "fastify";
import { type ZodTypeProvider, serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { z } from "zod";

import type { FastifyZodInstance } from "../../interfaces/fastify.interface.js";
import {
  type OGImageRenderer,
  OGRenderRequestSchema,
  OG_RENDER_BODY_LIMIT_BYTES,
  OG_RENDER_HEALTH_ROUTE,
  OG_RENDER_MAX_AGE_HEADER,
  OG_RENDER_OUTCOME_HEADER,
  OG_RENDER_ROUTE,
} from "./contract.js";

const HEALTH_RESPONSE_SCHEMA = z.strictObject({ status: z.literal("ok") });
const REQUEST_TIMEOUT_MS = 30_000;
const CONNECTION_TIMEOUT_MS = 5_000;
const KEEP_ALIVE_TIMEOUT_MS = 5_000;

export type CreateOGRendererAppOptions = {
  logger?: boolean;
  renderer: OGImageRenderer;
};

export function createOGRendererApp(options: CreateOGRendererAppOptions): FastifyZodInstance {
  const app = Fastify({
    bodyLimit: OG_RENDER_BODY_LIMIT_BYTES,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS,
    logger: options.logger ?? false,
    requestTimeout: REQUEST_TIMEOUT_MS,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.get(
    OG_RENDER_HEALTH_ROUTE,
    {
      schema: {
        response: { 200: HEALTH_RESPONSE_SCHEMA },
      },
    },
    async () => ({ status: "ok" as const }),
  );

  app.post(
    OG_RENDER_ROUTE,
    {
      schema: {
        body: OGRenderRequestSchema,
      },
    },
    async (request, reply) => {
      const result = await options.renderer(request.body);
      return reply
        .header("cache-control", "no-store")
        .header("x-content-type-options", "nosniff")
        .header(OG_RENDER_OUTCOME_HEADER, result.outcome)
        .header(OG_RENDER_MAX_AGE_HEADER, result.maxAgeSeconds.toString())
        .type("image/png")
        .send(result.buffer);
    },
  );

  return app;
}
