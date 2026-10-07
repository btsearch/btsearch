import type { FastifyRequest } from "fastify";

export const HEALTH_ROUTE = "/api/v1/health";

export function isHealthProbe(req: FastifyRequest): boolean {
  return req.routeOptions.url === HEALTH_ROUTE;
}
