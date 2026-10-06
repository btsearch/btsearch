function isStoredRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readStoredRecord(storageKey: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    return isStoredRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
