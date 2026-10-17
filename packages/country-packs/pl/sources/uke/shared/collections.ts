export function chunk<Item>(items: readonly Item[], size: number): Item[][] {
  const chunks: Item[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

export function entriesSortedByKey<Key extends string, Value>(byKey: ReadonlyMap<Key, Value>): [Key, Value][] {
  return [...byKey].sort(([a], [b]) => a.localeCompare(b));
}

export function bucketOf<Key, Item>(buckets: Map<Key, Item[]>, key: Key): Item[] {
  const existing = buckets.get(key);
  if (existing) return existing;

  const bucket: Item[] = [];
  buckets.set(key, bucket);
  return bucket;
}
