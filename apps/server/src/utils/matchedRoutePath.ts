import type { FastifyRequest } from "fastify";

export function matchedRoutePath(req: FastifyRequest): string {
  const pattern = req.routeOptions.url;
  if (pattern !== undefined && !pattern.endsWith("*")) return pattern;

  try {
    return decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return "";
  }
}
