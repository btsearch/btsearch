import { compareRatCellDetails } from "@/features/shared/rat";
import type { Cell } from "@/types/station";

export function groupCellsByRat(cells: Cell[]): Record<string, Cell[]> {
  const groups = cells.reduce<Record<string, Cell[]>>((acc, cell) => {
    acc[cell.rat] ??= [];
    acc[cell.rat].push(cell);
    return acc;
  }, {});

  for (const rat in groups) {
    groups[rat].sort((a, b) => {
      const bandA = Number(a.band.value);
      const bandB = Number(b.band.value);
      if (bandA !== bandB) return bandA - bandB;

      return compareRatCellDetails(rat, a.details, b.details);
    });
  }

  return groups;
}
