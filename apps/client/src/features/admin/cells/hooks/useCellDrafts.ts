import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { CellDraftBase } from "../cellEditRow";
import { RAT_ORDER, compareRatCells, findPreferredRatBand, getCellDetailDefaultValue, getSharedDetailFields } from "../rat";
import { syncByPCI, syncNRByPCI } from "../sectorAssignmentSync";
import { buildRemainingLTECells, createRemainingLTEDetails } from "@/features/cells/lib/remainingLteCells";
import type { Band } from "@/types/station";

const TAC_LAC_FIELD: Partial<Record<string, string>> = {
  GSM: "lac",
  UMTS: "lac",
  LTE: "tac",
  NR: "nrtac",
};

function applyCellChange<T extends CellDraftBase>(cells: T[], localId: string, patch: Partial<CellDraftBase>): T[] {
  const changed = cells.find((cell) => cell._localId === localId);
  if (!changed) return cells;
  const field = patch.details ? TAC_LAC_FIELD[changed.rat] : undefined;
  const syncedValue = field === undefined ? undefined : patch.details?.[field];
  const syncsSiblings = field !== undefined && syncedValue !== changed.details[field];

  return cells.map((cell) => {
    if (cell._localId === localId) return { ...cell, ...patch };
    if (!syncsSiblings || field === undefined || cell.rat !== changed.rat) return cell;
    const details = { ...cell.details };
    if (syncedValue === undefined) delete details[field];
    else details[field] = syncedValue;
    return { ...cell, details };
  });
}

type UseCellDraftsOptions<T extends CellDraftBase> = {
  initialCells: T[];
  initialEnabledRats?: string[];
  allBands: Band[];
  createNewCell: (rat: string, defaultBand: Band) => T;
  onDelete?: (cell: T) => void;
  disabled?: boolean;
  sortCellsByRat?: boolean;
  operatorMnc?: number | null;
};

type UseCellDraftsReturn<T extends CellDraftBase> = {
  cells: T[];
  setCells: Dispatch<SetStateAction<T[]>>;
  cellsByRat: Record<string, T[]>;
  enabledRats: string[];
  setEnabledRats: Dispatch<SetStateAction<string[]>>;
  visibleRats: string[];
  toggleRat: (rat: string) => void;
  changeCell: (localId: string, patch: Partial<CellDraftBase>) => void;
  syncMissingSectorsByPCIInRat: (rat: string) => void;
  addCell: (rat: string) => void;
  addRemainingLteCells: () => void;
  cloneCell: (localId: string) => void;
  clonedIds: ReadonlySet<string>;
  deleteCell: (localId: string) => void;
};

export function useCellDrafts<T extends CellDraftBase>({
  initialCells,
  initialEnabledRats,
  allBands,
  createNewCell,
  onDelete,
  disabled,
  sortCellsByRat = true,
  operatorMnc,
}: UseCellDraftsOptions<T>): UseCellDraftsReturn<T> {
  const { t } = useTranslation("stations");

  const [cells, setCells] = useState<T[]>(initialCells);
  const [clonedIds, setClonedIds] = useState<ReadonlySet<string>>(new Set());
  const cloneTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [enabledRats, setEnabledRats] = useState<string[]>(
    () => initialEnabledRats ?? RAT_ORDER.filter((r) => initialCells.some((c) => c.rat === r)),
  );

  const bandValueMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const b of allBands) map.set(b.id, b.value);
    return map;
  }, [allBands]);

  const sortedOnce = useRef(false);

  useEffect(() => {
    if (!sortCellsByRat || sortedOnce.current || bandValueMap.size === 0) return;
    sortedOnce.current = true;
    setCells((prev) =>
      [...prev].sort((a, b) => {
        const ratOrder = RAT_ORDER.findIndex((rat) => rat === a.rat) - RAT_ORDER.findIndex((rat) => rat === b.rat);
        if (ratOrder !== 0) return ratOrder;
        const bandA = bandValueMap.get(a.band_id) ?? 0;
        const bandB = bandValueMap.get(b.band_id) ?? 0;
        return compareRatCells(a.rat, bandA, a.details, bandB, b.details);
      }),
    );
  }, [bandValueMap, sortCellsByRat]);

  const cellsByRat = useMemo(() => {
    const grouped: Record<string, T[]> = {};
    for (const cell of cells) {
      if (!grouped[cell.rat]) grouped[cell.rat] = [];
      grouped[cell.rat].push(cell);
    }
    return grouped;
  }, [cells]);

  const visibleRats = useMemo(() => RAT_ORDER.filter((r) => enabledRats.includes(r)), [enabledRats]);

  const toggleRat = useCallback((rat: string) => {
    setEnabledRats((prev) => (prev.includes(rat) ? prev.filter((r) => r !== rat) : [...prev, rat]));
  }, []);

  const changeCell = useCallback(
    (localId: string, patch: Partial<CellDraftBase>) => {
      if (disabled) return;
      setCells((prev) => applyCellChange(prev, localId, patch));
    },
    [disabled],
  );

  const syncMissingSectorsByPCIInRat = useCallback(
    (rat: string) => {
      if (disabled) return;
      setCells((prev) => {
        if (rat === "NR") return syncNRByPCI(prev);
        const syncedCells = syncByPCI(prev.filter((cell) => cell.rat === rat));
        const syncedByLocalId = new Map(syncedCells.map((cell) => [cell._localId, cell] as const));
        return prev.map((cell) => (cell.rat === rat ? (syncedByLocalId.get(cell._localId) ?? cell) : cell));
      });
    },
    [disabled],
  );

  const addCell = useCallback(
    (rat: string) => {
      if (disabled) return;
      const bandsForRat = allBands.filter((b) => b.rat === rat);
      if (bandsForRat.length === 0) {
        toast.error(t("toast.noBands", { rat }));
        return;
      }
      setCells((prev) => {
        const defaultBand = findPreferredRatBand(bandsForRat, rat) ?? bandsForRat[0];
        const newCell = createNewCell(rat, defaultBand);
        const defaultType = getCellDetailDefaultValue(rat, "type");
        if (newCell.details.type === undefined && defaultType !== null) newCell.details = { ...newCell.details, type: defaultType };
        const existingSibling = prev.find((c) => c.rat === rat);
        if (existingSibling) {
          const sharedFields = getSharedDetailFields(rat);
          const inherited: Record<string, unknown> = {};
          for (const field of sharedFields) {
            if (existingSibling.details[field] !== undefined) inherited[field] = existingSibling.details[field];
          }
          if (Object.keys(inherited).length > 0) newCell.details = { ...newCell.details, ...inherited };
        }
        return [...prev, newCell];
      });
    },
    [disabled, allBands, createNewCell, t],
  );

  const addRemainingLteCells = useCallback(() => {
    if (disabled) return;
    setCells((prev) => {
      const additions = buildRemainingLTECells({
        operatorMnc,
        cells: prev.filter((cell) => cell.rat === "LTE"),
        getBandId: (cell) => cell.band_id,
        getDetails: (cell) => cell.details,
        createCell: (source, clid) => {
          const band = allBands.find((b) => b.id === source.band_id);
          if (!band) return null;
          const template = createNewCell("LTE", band);
          return {
            ...template,
            band_id: source.band_id,
            _sectorLocalId: null,
            type: source.type ?? template.type,
            is_confirmed: source.is_confirmed,
            notes: source.notes,
            details: createRemainingLTEDetails(source.details, clid),
          };
        },
      });
      if (additions.length === 0) return prev;
      return [...prev, ...additions];
    });
  }, [disabled, allBands, createNewCell, operatorMnc]);

  useEffect(
    () => () => {
      for (const t of cloneTimers.current.values()) clearTimeout(t);
    },
    [],
  );

  const cellsRef = useRef(cells);
  useEffect(() => {
    cellsRef.current = cells;
  });

  const cloneCell = useCallback(
    (localId: string) => {
      if (disabled) return;
      const cell = cellsRef.current.find((c) => c._localId === localId);
      if (!cell) return;
      const band = allBands.find((b) => b.id === cell.band_id) ?? allBands.find((b) => b.rat === cell.rat);
      if (!band) return;
      const template = createNewCell(cell.rat, band);
      const details = { ...cell.details };
      delete details.pci;
      const cloned = {
        ...template,
        band_id: cell.band_id,
        _sectorLocalId: null,
        type: cell.type ?? template.type,
        is_confirmed: cell.is_confirmed,
        notes: cell.notes,
        details,
      };
      setCells((prev) => {
        const index = prev.findIndex((c) => c._localId === localId);
        if (index === -1) return prev;
        const next = [...prev];
        next.splice(index + 1, 0, cloned);
        return next;
      });
      const id = cloned._localId;
      setClonedIds((s) => new Set([...s, id]));
      const timer = setTimeout(() => {
        setClonedIds((s) => {
          const copy = new Set(s);
          copy.delete(id);
          return copy;
        });
        cloneTimers.current.delete(id);
      }, 2000);
      cloneTimers.current.set(id, timer);
    },
    [disabled, allBands, createNewCell],
  );

  const deleteCellFn = useCallback(
    (localId: string) => {
      if (disabled) return;
      const cell = cellsRef.current.find((c) => c._localId === localId);
      if (cell && onDelete) onDelete(cell);
      setCells((prev) => prev.filter((c) => c._localId !== localId));
    },
    [disabled, onDelete],
  );

  return {
    cells,
    setCells,
    cellsByRat,
    enabledRats,
    setEnabledRats,
    visibleRats,
    toggleRat,
    changeCell,
    syncMissingSectorsByPCIInRat,
    addCell,
    addRemainingLteCells,
    cloneCell,
    clonedIds,
    deleteCell: deleteCellFn,
  };
}
