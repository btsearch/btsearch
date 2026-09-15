import type { RoutePermission } from "./permissions.js";

export const OIDC_SCOPES = ["openid", "profile", "email", "offline_access"] as const;

export const OAUTH_READ_SCOPES = [
  "read:bands",
  "read:cells",
  "read:locations",
  "read:operators",
  "read:regions",
  "read:stations",
  "read:stats",
  "read:submissions",
  "read:uke_permits",
  "read:uke_radiolines",
] as const satisfies readonly RoutePermission[];

export const OAUTH_WRITE_SCOPES = [
  "create:comments",
  "create:user_lists",
  "update:user_lists",
  "create:submissions",
  "update:submissions",
  "delete:submissions",
] as const satisfies readonly RoutePermission[];

export const OAUTH_SCOPES = [...OIDC_SCOPES, ...OAUTH_READ_SCOPES, ...OAUTH_WRITE_SCOPES];

export type OAuthScope = (typeof OAUTH_SCOPES)[number];
