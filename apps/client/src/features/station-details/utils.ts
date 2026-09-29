import { compareRatCells } from "@/features/shared/rat";
import type { Cell, UkePermit, UkeStation } from "@/types/station";

export function groupPermitsByUkeStation(permits: UkePermit[]): UkeStation[] {
  const stations = new Map<number, UkeStation>();

  for (const { station, ...permit } of permits) {
    const existing = stations.get(station.id);
    if (existing) existing.permits.push(permit);
    else stations.set(station.id, { ...station, permits: [permit] });
  }

  return [...stations.values()];
}

export function groupCellsByRat(cells: Cell[]): Record<string, Cell[]> {
  const groups = cells.reduce<Record<string, Cell[]>>((acc, cell) => {
    acc[cell.rat] ??= [];
    acc[cell.rat].push(cell);
    return acc;
  }, {});

  for (const rat in groups) {
    groups[rat].sort((a, b) => compareRatCells(rat, Number(a.band.value), a.details, Number(b.band.value), b.details));
  }

  return groups;
}
