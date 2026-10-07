export const PUBLIC_ROUTES = [
  "/api/v1/auth",
  "/api/v1/docs",
  "/api/v1/openapi.yaml",
  "/api/v2/docs",
  "/api/v2/openapi.json",
  "/uploads",
  "/.well-known",
];
export const APP_NAME = process.env.APP_NAME || "BTSearch";
export const STAFF_ROLES: ReadonlySet<string> = new Set(["admin", "editor"]);
export const LEGACY_COUNTRY_CODE = "PL";
export const IDEMPOTENCY_LOCK_SECONDS = 30;
export const API_KEYS_LIMIT = 1;
export const API_KEY_COOLDOWN_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const API_KEY_COOLDOWN_KEY_PREFIX = "auth:apikey-cooldown:";
export const ARGON2_OPTIONS = {
  timeCost: 3,
  memoryCost: 65536,
  parallelism: 4,
  saltLength: 32,
};
