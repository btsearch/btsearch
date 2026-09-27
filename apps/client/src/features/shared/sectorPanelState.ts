import { useMemo, useState } from "react";

type SectorPanelCell = {
  band_id: number | null;
  _sectorLocalId?: string | null;
};

type SectorPanelState = ReturnType<typeof deriveSectorPanelState>;

export function deriveSectorPanelState(cells: readonly SectorPanelCell[]) {
  const bandCounts = new Map<number, number>();
  for (const cell of cells) {
    if (cell.band_id === null) continue;
    bandCounts.set(cell.band_id, (bandCounts.get(cell.band_id) ?? 0) + 1);
  }

  const derivedSectorCount = bandCounts.size > 0 ? Math.max(...bandCounts.values()) : 0;
  const assignedSectorLocalIds = new Set(cells.flatMap((cell) => (cell._sectorLocalId ? [cell._sectorLocalId] : [])));

  return { derivedSectorCount, assignedSectorLocalIds };
}

function isSameSectorPanelState(a: SectorPanelState, b: SectorPanelState): boolean {
  if (a.derivedSectorCount !== b.derivedSectorCount || a.assignedSectorLocalIds.size !== b.assignedSectorLocalIds.size) return false;
  for (const localId of a.assignedSectorLocalIds) if (!b.assignedSectorLocalIds.has(localId)) return false;
  return true;
}

export function useSectorPanelState(cells: readonly SectorPanelCell[]): SectorPanelState {
  const next = useMemo(() => deriveSectorPanelState(cells), [cells]);
  const [stable, setStable] = useState(next);
  if (stable !== next && !isSameSectorPanelState(stable, next)) {
    setStable(next);
    return next;
  }
  return stable;
}
