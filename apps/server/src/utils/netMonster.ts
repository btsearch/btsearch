import type { FastifyRequest } from "fastify";

const EXPORT_ROUTE = "/api/v1/cells/export";

export function isNetMonsterExport(req: FastifyRequest): boolean {
  const userAgent = process.env.NTM_USERAGENT;
  if (!userAgent || req.routeOptions.url !== EXPORT_ROUTE) return false;
  return req.headers["user-agent"]?.startsWith(userAgent) === true;
}
