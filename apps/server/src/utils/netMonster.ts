import type { FastifyRequest } from "fastify";

const EXPORT_ROUTES: ReadonlySet<string | undefined> = new Set(["/api/v1/cells/export", "/api/v2/cells/export"]);

export function isNetMonsterExport(req: FastifyRequest): boolean {
  const userAgent = process.env.NTM_USERAGENT;
  if (!userAgent || !EXPORT_ROUTES.has(req.routeOptions.url)) return false;
  return req.headers["user-agent"]?.startsWith(userAgent) === true;
}
