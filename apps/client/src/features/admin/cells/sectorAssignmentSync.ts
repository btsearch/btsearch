type SectorSyncCell = {
  _sectorLocalId?: string | null;
  details: object;
};

type CrossRatSectorSyncCell = SectorSyncCell & {
  rat: string;
};

function hasSector(cell: SectorSyncCell): boolean {
  return cell._sectorLocalId !== undefined && cell._sectorLocalId !== null && cell._sectorLocalId !== "";
}

function getPCI(cell: SectorSyncCell): number | null {
  const details = cell.details as Record<string, unknown>;
  return typeof details.pci === "number" ? details.pci : null;
}

function getSectorLocalId(cell: SectorSyncCell): string | null {
  return hasSector(cell) ? (cell._sectorLocalId ?? null) : null;
}

function isNSATarget(cell: CrossRatSectorSyncCell): boolean {
  const details = cell.details as Record<string, unknown>;
  return cell.rat === "NR" && (details.type ?? "nsa") === "nsa" && getPCI(cell) !== null && !hasSector(cell);
}

function isNRSACell(cell: CrossRatSectorSyncCell): boolean {
  const details = cell.details as Record<string, unknown>;
  return cell.rat === "NR" && details.type === "sa";
}

export function isNRSyncTarget(cell: CrossRatSectorSyncCell): boolean {
  return isNSATarget(cell) || (isNRSACell(cell) && getPCI(cell) !== null && !hasSector(cell));
}

export function syncByPCI<T extends SectorSyncCell>(cells: T[]): T[] {
  const sectorsByPci = new Map<number, string>();
  for (const cell of cells) {
    const pci = getPCI(cell);
    const sectorLocalId = getSectorLocalId(cell);
    if (pci === null || sectorLocalId === null || sectorsByPci.has(pci)) continue;
    sectorsByPci.set(pci, sectorLocalId);
  }

  if (sectorsByPci.size === 0) return cells;

  return cells.map((cell) => {
    if (hasSector(cell)) return cell;
    const pci = getPCI(cell);
    if (pci === null) return cell;
    const sectorLocalId = sectorsByPci.get(pci);
    if (sectorLocalId === undefined) return cell;
    return { ...cell, _sectorLocalId: sectorLocalId };
  });
}

function syncNSAFromLTE<T extends CrossRatSectorSyncCell>(cells: T[]): T[] {
  const lteSectorsByPci = new Map<number, string | null>();

  for (const cell of cells) {
    if (cell.rat !== "LTE") continue;
    const pci = getPCI(cell);
    const sectorLocalId = getSectorLocalId(cell);
    if (pci === null || sectorLocalId === null) continue;

    const existingSectorLocalId = lteSectorsByPci.get(pci);
    if (existingSectorLocalId === undefined) lteSectorsByPci.set(pci, sectorLocalId);
    else if (existingSectorLocalId !== sectorLocalId) lteSectorsByPci.set(pci, null);
  }

  if (lteSectorsByPci.size === 0) return cells;

  return cells.map((cell) => {
    if (!isNSATarget(cell)) return cell;
    const pci = getPCI(cell);
    if (pci === null) return cell;
    const sectorLocalId = lteSectorsByPci.get(pci);
    if (sectorLocalId === undefined || sectorLocalId === null) return cell;
    return { ...cell, _sectorLocalId: sectorLocalId };
  });
}

export function syncNRByPCI<T extends CrossRatSectorSyncCell>(cells: T[]): T[] {
  const nrSaCells = cells.filter(isNRSACell);
  const syncedNrSaCells = syncByPCI(nrSaCells);
  let nrSaIndex = 0;
  const cellsWithSyncedNrSa = cells.map((cell) => {
    if (!isNRSACell(cell)) return cell;
    const syncedCell = syncedNrSaCells[nrSaIndex];
    nrSaIndex += 1;
    return syncedCell ?? cell;
  });

  return syncNSAFromLTE(cellsWithSyncedNrSa);
}
