import type { useListPanelScope } from "@/features/stations/list/data/listPanel";

export type SubmissionFilterScope = ReturnType<typeof useListPanelScope>;

export function filterSubmissionIdsByCountries(
  ids: number[],
  entries: readonly { id: number; countryCode: string }[] | undefined,
  countryCodes: readonly string[],
): number[] {
  if (countryCodes.length === 0 || entries === undefined || ids.length === 0) return ids;

  const countryById = new Map(entries.map((entry) => [entry.id, entry.countryCode]));
  const pickedCountries = new Set(countryCodes);
  const matchingIds = ids.filter((id) => {
    const countryCode = countryById.get(id);
    return countryCode === undefined || pickedCountries.has(countryCode);
  });
  return matchingIds.length === ids.length ? ids : matchingIds;
}
