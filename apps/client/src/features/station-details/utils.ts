import type { UkePermit, UkeStation } from "@/types/station";

export function groupPermitsByUkeStation(permits: UkePermit[]): UkeStation[] {
  const stations = new Map<number, UkeStation>();

  for (const { station, ...permit } of permits) {
    const existing = stations.get(station.id);
    if (existing) existing.permits.push(permit);
    else stations.set(station.id, { ...station, permits: [permit] });
  }

  return [...stations.values()];
}
