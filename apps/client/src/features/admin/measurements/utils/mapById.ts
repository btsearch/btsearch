export function mapById<T extends { id: number }>(items: readonly T[] | undefined): ReadonlyMap<number, T> {
  return new Map((items ?? []).map((item) => [item.id, item]));
}
