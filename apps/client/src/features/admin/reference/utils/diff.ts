function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!isRecord(left) || !isRecord(right) || Array.isArray(left) !== Array.isArray(right)) return false;

  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => Object.hasOwn(right, key) && isSameValue(left[key], right[key]));
}

export function pickChanges<T extends object, K extends keyof T>(baseline: T, current: T, keys: readonly K[]): Partial<Pick<T, K>> {
  const changes: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    if (!isSameValue(baseline[key], current[key])) Object.assign(changes, { [key]: current[key] });
  }
  return changes;
}

export function hasChanges(changes: object): boolean {
  return Object.keys(changes).length > 0;
}
