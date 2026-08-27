export const OIDC_SCOPES = ["openid", "profile", "email", "offline_access"] as const;

export const OAUTH_READ_SCOPES = [
  "read:bands",
  "read:cells",
  "read:comments",
  "read:locations",
  "read:operators",
  "read:regions",
  "read:stations",
  "read:stats",
  "read:submissions",
  "read:uke_permits",
  "read:uke_radiolines",
] as const;

export const OAUTH_WRITE_SCOPES = ["create:comments", "create:user_lists", "write:submissions"] as const;

export const OAUTH_SCOPES = [...OIDC_SCOPES, ...OAUTH_READ_SCOPES, ...OAUTH_WRITE_SCOPES];

export type OAuthScope = (typeof OAUTH_SCOPES)[number];
