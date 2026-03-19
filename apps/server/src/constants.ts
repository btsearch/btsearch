export const PUBLIC_ROUTES = ["/api/v1/auth", "/api/v1/stats", "/api/v1/docs", "/api/v1/openapi.yaml", "/uploads"];
export const APP_NAME = process.env.APP_NAME || "BTSearch";
export const API_KEYS_LIMIT = 1;
export const API_KEY_COOLDOWN_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const ARGON2_OPTIONS = {
  timeCost: 3,
  memoryCost: 65536,
  parallelism: 4,
  saltLength: 32,
};
