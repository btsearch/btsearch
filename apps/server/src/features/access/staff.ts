import type { FastifyRequest } from "fastify";

import { ErrorResponse } from "../../errors.js";
import type { PermissionObject } from "../../plugins/auth/permissions.js";
import type { OAuthScope } from "../../plugins/auth/scopes.js";
import { verifyPermissions } from "../../plugins/auth/utils.js";
import { type ActorAccess, accessFromRequest } from "./access.js";

export type CountryReach = { isEverywhere: boolean; countryCodes: string[] };

export function sessionOrTokenAccessFromRequest(req: FastifyRequest): Promise<ActorAccess | null> {
  if (!req.userSession?.user?.id) return Promise.resolve(null);
  return accessFromRequest(req);
}

export function assertTokenScope(req: FastifyRequest, scope: OAuthScope): void {
  if (req.oauthToken && !req.oauthToken.scopes.includes(scope)) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");
}

function tokenAllows(req: FastifyRequest, permissions: PermissionObject): boolean {
  const token = req.oauthToken;
  if (!token) return true;

  const scopes = Object.entries(permissions).flatMap(([resource, actions]) => (actions ?? []).map((action) => `${action}:${resource}`));
  return scopes.every((scope) => token.scopes.includes(scope));
}

export async function hasStaffPermission(req: FastifyRequest, permissions: PermissionObject): Promise<boolean> {
  const userId = req.userSession?.user?.id;
  if (!userId || !tokenAllows(req, permissions)) return false;
  return verifyPermissions(userId, permissions);
}

export async function getCountryReach(req: FastifyRequest, permissions: PermissionObject): Promise<CountryReach> {
  if (await hasStaffPermission(req, permissions)) return { isEverywhere: true, countryCodes: [] };
  if (!tokenAllows(req, permissions)) return { isEverywhere: false, countryCodes: [] };

  const access = await sessionOrTokenAccessFromRequest(req);
  const maintained = access?.grants.filter((grant) => grant.isMaintainer) ?? [];
  return { isEverywhere: false, countryCodes: maintained.map((grant) => grant.countryCode) };
}
