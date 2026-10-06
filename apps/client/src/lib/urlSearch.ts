export function parseSearchQuery(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return undefined;

  const query = String(value).trim();
  return query === "" ? undefined : query;
}

export function listSearchValues(value: unknown): unknown[] {
  if (typeof value === "string") return value.split(",");
  return Array.isArray(value) ? value : [];
}

export function parseSearchValues(value: unknown, parseValue: (item: string) => string | null): string[] {
  const values = new Set<string>();
  for (const item of listSearchValues(value)) {
    const parsedValue = typeof item === "string" ? parseValue(item) : null;
    if (parsedValue !== null) values.add(parsedValue);
  }
  return [...values].sort();
}

export function joinSearchValues(values: readonly string[]): string | undefined {
  return values.length > 0 ? values.join(",") : undefined;
}

export function parseSearchWholeNumber(value: unknown, smallest: number, largest: number): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= smallest && value <= largest ? value : undefined;
}

export function getLastOffsetPage(total: number, pageSize: number, offsetLimit: number): number {
  const lastFilledPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  return Math.min(lastFilledPage, Math.floor(offsetLimit / pageSize));
}
