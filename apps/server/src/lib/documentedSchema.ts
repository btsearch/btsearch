function isSafeIntegerBound(key: string, value: unknown): boolean {
  return (key === "minimum" && value === Number.MIN_SAFE_INTEGER) || (key === "maximum" && value === Number.MAX_SAFE_INTEGER);
}

function isBinaryEncoding(key: string, value: unknown): boolean {
  return key === "contentEncoding" && value === "binary";
}

export function toDocumentedSchema<T>(node: T): T {
  if (Array.isArray(node)) return node.map(toDocumentedSchema) as unknown as T;
  if (typeof node !== "object" || node === null) return node;

  const kept = Object.entries(node).filter(([key, value]) => !isSafeIntegerBound(key, value) && !isBinaryEncoding(key, value));
  return Object.fromEntries(kept.map(([key, value]) => [key, toDocumentedSchema(value)])) as T;
}
