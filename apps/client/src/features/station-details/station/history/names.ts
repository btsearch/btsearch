import type { Band, Operator, Region } from "../types";

type NamedRecord = { id: number; name: string };

export type HistoryNames = {
  operators: ReadonlyMap<number, string>;
  bands: ReadonlyMap<number, string>;
  regions: ReadonlyMap<number, string>;
};

const UNRESOLVED_ID_PREFIX = "#";

function indexNames(records: readonly NamedRecord[] | undefined): Map<number, string> {
  const names = new Map<number, string>();
  for (const record of records ?? []) names.set(record.id, record.name);
  return names;
}

export function indexHistoryNames(
  operators: readonly Operator[] | undefined,
  bands: readonly Band[] | undefined,
  regions: readonly Region[] | undefined,
): HistoryNames {
  return { operators: indexNames(operators), bands: indexNames(bands), regions: indexNames(regions) };
}

export function formatUnresolvedId(id: number): string {
  return `${UNRESOLVED_ID_PREFIX}${id}`;
}

export function getNameById(names: ReadonlyMap<number, string>, id: number): string {
  return names.get(id) ?? formatUnresolvedId(id);
}
