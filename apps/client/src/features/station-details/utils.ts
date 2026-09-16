import { compareRatCells } from "@/features/shared/rat";
import type { Cell } from "@/types/station";

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
