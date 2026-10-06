import type { SettingsErrorText } from "./errors";

const ROUTE_ENTRY_PATTERN = /^\/api\/v[12]\/.+/;
const ROUTE_ENTRY_MAX_LENGTH = 200;
const ROUTE_LIST_LIMIT = 100;

export const ROUTE_ENTRY_PLACEHOLDER = "/api/v2/...";

export function findRouteEntryProblem(entry: string, entries: readonly string[]): SettingsErrorText | null {
  if (entry === "") return { key: "admin:settings.routes.errors.empty" };
  if (!ROUTE_ENTRY_PATTERN.test(entry)) return { key: "admin:settings.routes.errors.format" };
  if (entry.length > ROUTE_ENTRY_MAX_LENGTH) return { key: "admin:settings.routes.errors.tooLong", values: { max: ROUTE_ENTRY_MAX_LENGTH } };
  if (entries.includes(entry)) return { key: "admin:settings.routes.errors.duplicate" };
  if (entries.length >= ROUTE_LIST_LIMIT) return { key: "admin:settings.routes.errors.limit", values: { max: ROUTE_LIST_LIMIT } };
  return null;
}
