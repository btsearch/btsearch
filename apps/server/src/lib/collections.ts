export function unique<T>(values: readonly (T | null | undefined)[]): T[] {
  return [...new Set(values.filter((value): value is T => value !== null && value !== undefined))];
}

export function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) result.push(items.slice(start, start + size));
  return result;
}

export function getOrCreate<T>(byKey: Map<string, T>, key: string, createEmpty: (key: string) => T): T {
  const existing = byKey.get(key);
  if (existing !== undefined) return existing;

  const created = createEmpty(key);
  byKey.set(key, created);
  return created;
}
