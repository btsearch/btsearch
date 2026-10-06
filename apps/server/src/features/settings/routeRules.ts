import type { FastifyRequest } from "fastify";

import { ErrorResponse } from "../../errors.js";
import type { RuntimeSettingsPatch } from "../../lib/runtimeSettings.js";
import { HEALTH_ROUTE } from "../../utils/healthProbe.js";
import { matchedRoutePath } from "../../utils/matchedRoutePath.js";

type RouteRules = Pick<RuntimeSettingsPatch, "allowedUnauthenticatedRoutes" | "disabledRoutes">;

const API_ROUTE = /^\/api\/v[12]\//;
const AUTH_ROUTE = "/api/v1/auth/*";
const SIGN_IN_PATHS = [
  "/api/v1/auth/sign-in/*",
  "/api/v1/auth/callback/*",
  "/api/v1/auth/passkey/generate-authenticate-options",
  "/api/v1/auth/passkey/verify-authentication",
  "/api/v1/auth/two-factor/verify-totp",
  "/api/v1/auth/two-factor/verify-otp",
  "/api/v1/auth/two-factor/verify-backup-code",
  "/api/v1/auth/get-session",
  "/api/v1/auth/sign-out",
];
const SETTINGS_ROUTE = "/api/v2/settings";
const NEVER_DISABLED_ROUTES = [...SIGN_IN_PATHS, HEALTH_ROUTE, SETTINGS_ROUTE];

const apiRoutePatterns = new Set<string>();

export function recordRoutePattern(pattern: string): void {
  if (API_ROUTE.test(pattern)) apiRoutePatterns.add(pattern);
}

function undecodedPathname(req: FastifyRequest): string {
  try {
    return new URL(req.url, "http://localhost").pathname;
  } catch {
    return "";
  }
}

export function routeRulePath(req: FastifyRequest): string {
  return req.routeOptions.url === AUTH_ROUTE ? undecodedPathname(req) : matchedRoutePath(req);
}

function handlesPath(pattern: string, path: string): boolean {
  return pattern.endsWith("*") ? path.startsWith(pattern.slice(0, -1)) : path === pattern;
}

export function isSignInRequest(req: FastifyRequest, path: string): boolean {
  return req.routeOptions.url === AUTH_ROUTE && SIGN_IN_PATHS.some((pattern) => handlesPath(pattern, path));
}

export function isSettingsRoute(req: FastifyRequest): boolean {
  return req.routeOptions.url === SETTINGS_ROUTE;
}

export function isSettingsRead(req: FastifyRequest): boolean {
  return isSettingsRoute(req) && (req.method === "GET" || req.method === "HEAD");
}

function coversRoute(rule: string, pattern: string): boolean {
  if (!pattern.endsWith("*")) return pattern.startsWith(rule);

  const base = pattern.slice(0, -1);
  return base.startsWith(rule) || rule.startsWith(base);
}

function coversAnyRoute(rule: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => coversRoute(rule, pattern));
}

export function keepExistingRouteRules<T extends string>(rules: readonly T[]): T[] {
  const patterns = [...apiRoutePatterns];
  return rules.filter((rule) => coversAnyRoute(rule, patterns));
}

export function assertRouteRules({ allowedUnauthenticatedRoutes = [], disabledRoutes = [] }: RouteRules, stored: RouteRules = {}): void {
  const patterns = [...apiRoutePatterns];
  const unmatchedOpenRule = allowedUnauthenticatedRoutes.find(
    (rule) => !coversAnyRoute(rule, patterns) && !stored.allowedUnauthenticatedRoutes?.includes(rule),
  );
  const unmatchedDisabledRule = disabledRoutes.find((rule) => !coversAnyRoute(rule, patterns) && !stored.disabledRoutes?.includes(rule));
  const unmatchedRule = unmatchedOpenRule ?? unmatchedDisabledRule;
  if (unmatchedRule !== undefined) throw new ErrorResponse("BAD_REQUEST", { message: `No route starts with "${unmatchedRule}"` });

  const lockoutRule = disabledRoutes.find((rule) => coversAnyRoute(rule, NEVER_DISABLED_ROUTES));
  if (lockoutRule !== undefined) {
    throw new ErrorResponse("BAD_REQUEST", { message: `"${lockoutRule}" would disable the sign-in routes, the settings routes or the health check` });
  }
}
