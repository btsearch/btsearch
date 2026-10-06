import type { RouteOptions } from "fastify";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { dlogger } from "../config.js";
import { requiresScope } from "../features/access/scope.js";
import { findDocumentationGap } from "../features/openapi/document.js";
import type { FastifyZodInstance } from "../interfaces/fastify.interface.js";
import { logger } from "../utils/logger.js";

const MODULE_FILE_PATTERN = /(?<!\.d)\.[jt]s$/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((file) => {
    if (file.isDirectory()) return walk(join(dir, file.name));
    return MODULE_FILE_PATTERN.test(file.name) ? [join(dir, file.name)] : [];
  });
}

export async function registerRouteFiles(fastify: FastifyZodInstance, version: "v1" | "v2") {
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const routeFiles = walk(join(__dirname, "..", "routes", version));
  const log = dlogger.extend(`API${version}Controller`);
  const unscopedRoutes: string[] = [];
  const undocumentedRoutes: string[] = [];
  const brokenFiles: string[] = [];

  for (const file of routeFiles) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const module: { default?: RouteOptions } = await import(`file://${file}`);
      const route = module.default;
      if (!route?.method || !route?.url) throw new Error("The default export is not a route: it has no method or url");
      if (requiresScope(route.config?.permissions) && !route.config?.scope) {
        unscopedRoutes.push(`${String(route.method)} ${route.url}`);
        continue;
      }
      const documentationGap = version === "v2" ? findDocumentationGap(route) : undefined;
      if (documentationGap) {
        undocumentedRoutes.push(`${String(route.method)} ${route.url} (${documentationGap})`);
        continue;
      }

      log("Registering route: %o %s", route.method, route.url);
      fastify.route(route);
    } catch (error) {
      logger.error("routes.load", { file, error });
      brokenFiles.push(file);
    }
  }

  if (brokenFiles.length > 0) throw new Error(`Route files that failed to load: ${brokenFiles.join(", ")}`);
  if (unscopedRoutes.length > 0) throw new Error(`Routes that change region-bound data must declare config.scope: ${unscopedRoutes.join(", ")}`);
  if (undocumentedRoutes.length > 0) throw new Error(`Routes that the API document cannot describe: ${undocumentedRoutes.join(", ")}`);
}
