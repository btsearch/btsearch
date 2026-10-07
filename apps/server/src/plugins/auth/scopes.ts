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
  "read:user_lists",
] as const satisfies readonly RoutePermission[];

export const OAUTH_WRITE_SCOPES = [
  "create:comments",
  "update:comments",
  "delete:comments",
  "create:user_lists",
  "update:user_lists",
  "delete:user_lists",
  "create:submissions",
  "update:submissions",
  "delete:submissions",
] as const satisfies readonly RoutePermission[];

export const OAUTH_STAFF_SCOPES = [
  "create:stations",
  "update:stations",
  "delete:stations",
  "create:cells",
  "update:cells",
  "delete:cells",
  "create:locations",
  "update:locations",
  "delete:locations",
  "create:operators",
  "update:operators",
  "delete:operators",
  "create:regions",
  "update:regions",
  "delete:regions",
  "create:bands",
  "update:bands",
  "delete:bands",
  "create:brands",
  "update:brands",
  "delete:brands",
  "create:structure_owners",
  "update:structure_owners",
  "delete:structure_owners",
  "create:countries",
  "update:countries",
  "delete:countries",
  "create:role_grants",
  "update:role_grants",
  "delete:role_grants",
  "read_all:submissions",
  "moderate:submissions",
  "delete_all:submissions",
  "read_all:comments",
  "moderate:comments",
  "read_all:user_lists",
  "manage_all:user_lists",
  "read:audit_operations",
  "revert:audit_operations",
  "search:user",
] as const satisfies readonly RoutePermission[];

export const OAUTH_USER_SCOPES = [...OIDC_SCOPES, ...OAUTH_READ_SCOPES, ...OAUTH_WRITE_SCOPES];
export const OAUTH_SCOPES = [...OAUTH_USER_SCOPES, ...OAUTH_STAFF_SCOPES];

export type OAuthScope = (typeof OAUTH_SCOPES)[number];
