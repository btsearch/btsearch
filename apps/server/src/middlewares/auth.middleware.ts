import type { FastifyRequest } from "fastify";

import { PUBLIC_ROUTES } from "../constants.js";
import { ErrorResponse } from "../errors.js";
import { assertRouteScope } from "../features/access/scope.js";
import { hasStaffPermission } from "../features/access/staff.js";
import { assertLegacyRecord } from "../features/countries/legacy.js";
import { getRequestPathname, isSEOPublicPath } from "../features/seo/routes.js";
import { isAccountRecoveryRequest, isSettingsRead, isSettingsRoute, isSignInRequest, routeRulePath } from "../features/settings/routeRules.js";
import type { TokenTier } from "../interfaces/auth.interface.ts";
import type { ApiToken } from "../interfaces/fastify.interface.js";
import type { Route } from "../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../lib/runtimeSettings.js";
import { hasRequiredScopes, isOAuthBearerToken, verifyOAuthAccessToken } from "../plugins/auth/oauthToken.js";
import { convertToPermissionObject, verifyPermissions } from "../plugins/auth/utils.js";
import { getCurrentUser, verifyApiKey } from "../plugins/betterauth.plugin.js";
import { isHealthProbe } from "../utils/healthProbe.js";
import { isNetMonsterExport } from "../utils/netMonster.js";

const TWO_FACTOR_ALLOWED = [
  "/api/v1/auth/get-session",
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

export async function authHook(req: FastifyRequest) {
  const route = req.routeOptions as unknown as Route;

  await authenticate(req, route);
  await assertLegacyRecord(req);
  if (route.config?.scope) await assertRouteScope(req, route.config.scope);
}

async function authenticate(req: FastifyRequest, route: Route) {
  if (isHealthProbe(req)) return;
  const url = req.url;
  const path = routeRulePath(req);
  if (isSignInRequest(req, path)) return;

  const settings = getRuntimeSettings();
  const isClientPage = req.routeOptions.url === "/stations/:id" || req.routeOptions.url === "/locations/:id";
  if (settings.maintenanceEnabled && (isClientPage || isAccountRecoveryRequest(req, path))) return;
  const isMaintenanceRestricted = settings.maintenanceEnabled && !isSettingsRoute(req) && !TWO_FACTOR_ALLOWED.includes(path);
  if (isMaintenanceRestricted) {
    if (req.headers["x-api-key"] !== undefined || req.headers.authorization !== undefined) throw new ErrorResponse("MAINTENANCE_MODE");
    req.userSession = await getCurrentUser(req);
    if (!(await hasStaffPermission(req, { settings: ["update"] }))) throw new ErrorResponse("MAINTENANCE_MODE");
  }
  if (!isSettingsRoute(req) && settings.disabledRoutes.some((p) => path.startsWith(p))) throw new ErrorResponse("FORBIDDEN");
  const isSettingsReadRequest = isSettingsRead(req);
  const isOpenByRuntime = isSettingsReadRequest || settings.allowedUnauthenticatedRoutes.some((p) => path.startsWith(p));
  const requiresSignIn = settings.enforceAuthForAllRoutes && !isOpenByRuntime;
  const isPublicByStatic = PUBLIC_ROUTES.some((p) => url?.startsWith(p)) || isSEOPublicPath(getRequestPathname(url));
  if (isPublicByStatic && !requiresSignIn) return;

  const routePermissions = route.config?.permissions;
  const routePermissionObject = convertToPermissionObject(routePermissions);
  const isIntrinsicallyProtected = !isPublicByStatic && !route.config?.allowGuestAccess;

  const { headers } = req;
  const authHeader = headers["x-api-key"];

  const authorizationHeader = headers.authorization;
  const bearerToken =
    !authHeader && typeof authorizationHeader === "string" && authorizationHeader.startsWith("Bearer ") ? authorizationHeader.slice(7).trim() : null;
  if (bearerToken && isOAuthBearerToken(bearerToken)) {
    const verified = await verifyOAuthAccessToken(bearerToken);
    if (!verified) throw new ErrorResponse("UNAUTHORIZED");
    if (!hasRequiredScopes(verified.token, routePermissions)) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");

    const tokenUser = verified.userSession.user;
    if (tokenUser.forceTotp && !tokenUser.twoFactorEnabled) throw new ErrorResponse("TWO_FACTOR_REQUIRED");
    if (isIntrinsicallyProtected && routePermissionObject) {
      const hasPermissions = await verifyPermissions(tokenUser.id, routePermissionObject);
      if (!hasPermissions) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");
    }

    req.userSession = verified.userSession;
    req.oauthToken = verified.token;
    return;
  }

  if (!authHeader) {
    const user = isMaintenanceRestricted ? req.userSession : await getCurrentUser(req);
    const allowGuest = route?.config?.allowGuestAccess && !requiresSignIn;
    const requiresAuthentication = !allowGuest && !isNetMonsterExport(req);
    if (!user && requiresAuthentication) throw new ErrorResponse("UNAUTHORIZED");

    req.userSession = user;

    const isTwoFactorRoute = isSettingsReadRequest || TWO_FACTOR_ALLOWED.some((p) => path.startsWith(p));
    if (!isTwoFactorRoute && user?.user.forceTotp && !user.user.twoFactorEnabled) throw new ErrorResponse("TWO_FACTOR_REQUIRED");

    if (user && isIntrinsicallyProtected && routePermissionObject) {
      const hasPermissions = await verifyPermissions(user.user.id, routePermissionObject);
      if (!hasPermissions) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");
    }
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

      const allowGuest = route?.config?.allowGuestAccess && !requiresSignIn;
      if (!allowGuest) throw new ErrorResponse("UNAUTHORIZED");
      return;
    }

    const { valid, key } = await verifyApiKey(apiKey, routePermissionObject);
    if (!valid || !key) throw new ErrorResponse("FORBIDDEN");

    req.apiToken = key as ApiToken;
  }
}
