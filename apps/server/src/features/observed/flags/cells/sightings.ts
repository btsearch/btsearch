import { CONFIRMING_PEOPLE, countPeople } from "../../cells/confirmation.js";

export type Sighting = { sampleCount: number; contributorBits: bigint; lastSeenOn: string; observedCellId: number; observedSiteId: number | null };
export type SightingSum = { samples: number; people: number; lastSeenOn: string; observedCellId: number; observedSiteId: number | null };
export type ConfirmedValue = SightingSum & { value: number };

export function sumSightings(seen: readonly Sighting[]): SightingSum {
  const strongest = seen.reduce((best, row) => (row.sampleCount > best.sampleCount ? row : best));
  return {
    samples: seen.reduce((total, row) => total + row.sampleCount, 0),
    people: countPeople(seen.reduce((bits, row) => bits | row.contributorBits, 0n)),
    lastSeenOn: seen.reduce((latest, row) => (row.lastSeenOn > latest ? row.lastSeenOn : latest), ""),
    observedCellId: strongest.observedCellId,
    observedSiteId: strongest.observedSiteId,
  };
}

export function isConfirmedSince(sum: SightingSum, seenSince: string): boolean {
  return sum.people >= CONFIRMING_PEOPLE && sum.lastSeenOn >= seenSince;
}

export function confirmedValues(rows: readonly (Sighting & { value: number })[], seenSince: string): ConfirmedValue[] {
  return [...Map.groupBy(rows, (row) => row.value)].flatMap(([value, seen]) => {
    const sum = sumSightings(seen);
    return isConfirmedSince(sum, seenSince) ? [{ ...sum, value }] : [];
  });
}

export function mostRecent(values: readonly ConfirmedValue[]): ConfirmedValue | undefined {
  return values.toSorted((a, b) => b.lastSeenOn.localeCompare(a.lastSeenOn) || b.samples - a.samples || a.value - b.value)[0];
}

export function latestConfirmedValue(rows: readonly (Sighting & { value: number })[]): number | null {
  return mostRecent(confirmedValues(rows, ""))?.value ?? null;
}
