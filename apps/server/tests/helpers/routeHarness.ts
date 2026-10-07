import multipart from "@fastify/multipart";
import Fastify, { type FastifyContextConfig, type FastifyInstance, type FastifySchema, type RouteOptions } from "fastify";
import { type ZodTypeProvider, serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";

import redis from "../../src/database/redis.js";
import type { ApiToken, FastifyZodInstance, Session } from "../../src/interfaces/fastify.interface.js";
import { authHook } from "../../src/middlewares/auth.middleware.js";
import { idempotencyHook } from "../../src/middlewares/idempotency.middleware.js";
import type { OAuthTokenContext } from "../../src/plugins/auth/oauthToken.js";
import { RateLimitService } from "../../src/plugins/ratelimit/rateLimiter.js";
import { productionErrorHandler } from "./productionErrorHandler.js";

type RouteDefinition = {
  url: string;
  method: string | readonly string[];
  handler: unknown;
  schema?: FastifySchema;
  config?: FastifyContextConfig;
};
type HarnessOptions = {
  session?: Session | null;
  apiToken?: ApiToken;
  oauthToken?: OAuthTokenContext | null;
  runAuth?: boolean;
  runIdempotency?: boolean;
  prefix?: string;
  onError?: (error: Error) => void;
};
const harnesses = new Set<FastifyZodInstance>();

export async function createRouteHarness(route: RouteDefinition, options: HarnessOptions = {}): Promise<FastifyZodInstance> {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate("rateLimitService", new RateLimitService(redis));
  await app.register(multipart);
  app.decorateRequest("userSession", null);
  app.decorateRequest("apiToken", null);
  app.decorateRequest("oauthToken", null);
  app.decorateRequest("publishableKey", null);
  app.addHook("onRequest", async (request) => {
    request.userSession = options.session ?? null;
    request.apiToken = options.apiToken ?? null;
    request.oauthToken = options.oauthToken ?? null;
  });
  if (options.runAuth) app.addHook("preHandler", authHook);
  if (options.runIdempotency) app.addHook("preHandler", idempotencyHook);
  const production = await productionErrorHandler();
  const errorHandler: FastifyInstance["errorHandler"] = function (this: FastifyInstance, error, request, reply) {
    if (error instanceof Error) options.onError?.(error);
    return production.call(this, error, request, reply);
  };
  app.setErrorHandler(errorHandler);
  app.route({ ...route, url: `${options.prefix ?? ""}${route.url}` } as unknown as RouteOptions);
  await app.ready();
  harnesses.add(app);
  return app;
}

export async function createRouteHarnessWithErrors(
  route: RouteDefinition,
  options: HarnessOptions = {},
): Promise<{ app: FastifyZodInstance; errors: Error[] }> {
  const errors: Error[] = [];
  const app = await createRouteHarness(route, {
    ...options,
    onError(error) {
      errors.push(error);
      options.onError?.(error);
    },
  });
  return { app, errors };
}

export async function closeRouteHarnesses(): Promise<void> {
  await Promise.all([...harnesses].map((app) => app.close()));
  harnesses.clear();
}
