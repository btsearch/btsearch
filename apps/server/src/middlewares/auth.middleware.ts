import type { FastifyRequest } from "fastify";

import { PUBLIC_ROUTES } from "../constants.js";
import { ErrorResponse } from "../errors.js";
import { getCurrentUser, verifyApiKey } from "../plugins/betterauth.plugin.js";
import { getRequestPathname, isSEOPublicPath } from "../services/seo/routes.js";
import { getRuntimeSettings } from "../services/settings.service.js";

const TWO_FACTOR_ALLOWED = [
  "/api/v1/auth/get-session",
  "/api/v1/settings",
  "/api/v1/auth/two-factor/enable",
  "/api/v1/auth/two-factor/disable",
  "/api/v1/auth/two-factor/get-totp-uri",
  "/api/v1/auth/two-factor/verify-totp",
  "/api/v1/auth/two-factor/send-otp",
  "/api/v1/auth/two-factor/verify-otp",
  "/api/v1/auth/two-factor/generate-backup-codes",
  "/api/v1/auth/two-factor/verify-backup-code",
  "/api/v1/auth/two-factor/view-backup-codes",
];
import type { TokenTier } from "../interfaces/auth.interface.ts";
import type { ApiToken } from "../interfaces/fastify.interface.js";
import type { Route } from "../interfaces/routes.interface.js";
import { hasRequiredScopes, isOAuthBearerToken, verifyOAuthAccessToken } from "../services/oauthToken.service.js";

export async function authHook(req: FastifyRequest) {
  const route = req.routeOptions as unknown as Route;
  const url = req.url;

  const settings = getRuntimeSettings();
  if (settings.disabledRoutes.some((p) => url?.startsWith(p))) throw new ErrorResponse("FORBIDDEN");
  const isPublicByStatic = PUBLIC_ROUTES.some((p) => url?.startsWith(p)) || isSEOPublicPath(getRequestPathname(url));
  const isPublicByRuntime = settings.allowedUnauthenticatedRoutes.some((p) => url?.startsWith(p));
  if (isPublicByRuntime) return;
  if (isPublicByStatic && !settings.enforceAuthForAllRoutes) return;

  const { headers } = req;
  const authHeader = headers["x-api-key"];

  const authorizationHeader = headers.authorization;
  const bearerToken =
    !authHeader && typeof authorizationHeader === "string" && authorizationHeader.startsWith("Bearer ") ? authorizationHeader.slice(7).trim() : null;
  if (bearerToken && isOAuthBearerToken(bearerToken)) {
    const verified = await verifyOAuthAccessToken(bearerToken);
    if (!verified) throw new ErrorResponse("UNAUTHORIZED");
    if (!hasRequiredScopes(verified.token, route?.config?.permissions)) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");

    req.userSession = verified.userSession;
    req.oauthToken = verified.token;
    return;
  }

  if (!authHeader) {
    const user = await getCurrentUser(req);
    const allowGuest = route?.config?.allowGuestAccess && !settings.enforceAuthForAllRoutes;
    const netMonsterUserAgent = process.env.NTM_USERAGENT || null;
    const isNetMonsterExport = netMonsterUserAgent && req.headers["user-agent"]?.startsWith(netMonsterUserAgent) && url.includes("/cells/export");
    if (!user && !allowGuest && !isNetMonsterExport) throw new ErrorResponse("UNAUTHORIZED");

    req.userSession = user;

    const isTwoFactorRoute = TWO_FACTOR_ALLOWED.some((p) => url?.startsWith(p));
    if (!isTwoFactorRoute && user?.user.forceTotp && !user.user.twoFactorEnabled) throw new ErrorResponse("TWO_FACTOR_REQUIRED");
  }

  if (authHeader) {
    const apiKey = String(authHeader).trim();
    if (!apiKey) throw new ErrorResponse("UNAUTHORIZED");

    if (apiKey.startsWith("pk_")) {
      const { valid, key } = await verifyApiKey(apiKey);
      if (!valid || !key) throw new ErrorResponse("UNAUTHORIZED");

      let meta: Record<string, unknown> = {};
      try {
        if (key.metadata) meta = JSON.parse(key.metadata as unknown as string);
      } catch {}
      if (meta.type !== "publishable") throw new ErrorResponse("UNAUTHORIZED");

      const pkTier = (meta.tier as TokenTier | undefined) ?? "basic";
      req.publishableKey = { id: key.id, name: key.name ?? null, tier: pkTier };

      const allowGuest = route?.config?.allowGuestAccess && !settings.enforceAuthForAllRoutes;
      if (!allowGuest) throw new ErrorResponse("UNAUTHORIZED");
      return;
    }

    let routePermissions: Record<string, string[]> | undefined;
    if (route?.config?.permissions) {
      // Example: ["read:users", "write:posts"] => { users: ["read"], posts: ["write"] }
      routePermissions = {};
      for (const perm of route.config.permissions) {
        const [action, resource] = perm.split(":");
        if (action && resource) {
          if (!routePermissions[resource]) routePermissions[resource] = [];
          routePermissions[resource].push(action);
        }
      }
    }

    const { valid, key } = await verifyApiKey(apiKey, routePermissions);
    if (!valid || !key) throw new ErrorResponse("FORBIDDEN");

    req.apiToken = key as ApiToken;
  }
}
