const LTE_CELLS_PER_BAND = 3;
const LTE_CLID_STEP = 10;
const LTE_MAX_CLID = 255;

type RemainingLteCellSeed<T> = {
  cell: T;
  clid: number;
};

export function createRemainingLteDetails(details: Record<string, unknown>, clid: number): Record<string, unknown> {
  const next = { ...details };
  delete next.ecid;
  next.clid = clid;
  return next;
}

export function buildRemainingLteCells<T>(
  cells: readonly T[],
  getBandId: (cell: T) => number | null,
  getClid: (cell: T) => unknown,
  createCell: (source: T, clid: number) => T | null,
): T[] {
  const byBand = new Map<number, T[]>();

  for (const cell of cells) {
    const bandId = getBandId(cell);
    if (bandId === null) continue;
    const group = byBand.get(bandId);
    if (group) group.push(cell);
    else byBand.set(bandId, [cell]);
  }

  const additions: T[] = [];

  for (const group of byBand.values()) {
    if (group.length >= LTE_CELLS_PER_BAND) continue;

    let base: RemainingLteCellSeed<T> | null = null;
    const usedClids = new Set<number>();

    for (const cell of group) {
      const clid = getClid(cell);
      if (typeof clid !== "number" || !Number.isFinite(clid)) continue;
      usedClids.add(clid);
      if (base === null || clid < base.clid) base = { cell, clid };
    }

    if (base === null) continue;

    let candidate = base.clid + LTE_CLID_STEP;
    while (group.length + additions.filter((cell) => getBandId(cell) === getBandId(base.cell)).length < LTE_CELLS_PER_BAND) {
      if (candidate > LTE_MAX_CLID) break;
      if (usedClids.has(candidate)) {
        candidate += LTE_CLID_STEP;
        continue;
      }

      const added = createCell(base.cell, candidate);
      if (added === null) break;
      additions.push(added);
      usedClids.add(candidate);
      candidate += LTE_CLID_STEP;
    }
  }

  return additions;
}
