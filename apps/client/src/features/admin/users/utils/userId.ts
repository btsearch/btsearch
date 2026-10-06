import { parseSearchValues } from "@/lib/urlSearch";

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseUserId(value: unknown): string | undefined {
  return typeof value === "string" && USER_ID_PATTERN.test(value) ? value.toLowerCase() : undefined;
}

function parseSearchUserId(value: string): string | null {
  return parseUserId(value.trim()) ?? null;
}

export function listSearchUserIds(value: unknown, most: number): string[] {
  return parseSearchValues(value, parseSearchUserId).slice(0, most);
}
