import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { buildRemainingLteCells, createRemainingLteDetails } from "@/lib/remaining-lte-cells";
import type { Band } from "@/types/station";

import type { CellDraftBase } from "../cellEditRow";
import { RAT_ORDER, compareRatCellDetails, findPreferredRatBand, getSharedDetailFields } from "../rat";
import { syncNRByPCI } from "../sectorAssignmentSync";

type UseCellDraftsOptions<T extends CellDraftBase> = {
  initialCells: T[];
  initialEnabledRats?: string[];
  allBands: Band[];
  createNewCell: (rat: string, defaultBand: Band) => T;
  onDelete?: (cell: T) => void;
  disabled?: boolean;
  sortCellsByRat?: boolean;
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
}: UseCellDraftsOptions<T>): UseCellDraftsReturn<T> {
  const { t } = useTranslation("stations");

  const [cells, setCells] = useState<T[]>(initialCells);
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
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
        const bandA = bandValueMap.get(a.band_id) ?? 0;
        const bandB = bandValueMap.get(b.band_id) ?? 0;
        if (bandA !== bandB) return bandA - bandB;
        return compareRatCellDetails(a.rat, a.details, b.details);
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
      setCells((prev) => prev.map((cell) => (cell._localId === localId ? { ...cell, ...patch } : cell)));
    },
    [disabled],
  );

  const syncMissingSectorsByPCIInRat = useCallback(
    (rat: string) => {
      if (disabled || rat !== "NR") return;
      setCells((prev) => syncNRByPCI(prev));
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
      const additions = buildRemainingLteCells(
        prev.filter((cell) => cell.rat === "LTE"),
        (cell) => cell.band_id,
        (cell) => cell.details.clid,
        (source, clid) => {
          const band = allBands.find((b) => b.id === source.band_id);
          if (!band) return null;
          const template = createNewCell("LTE", band);
          return {
            ...template,
            band_id: source.band_id,
            _sectorLocalId: source._sectorLocalId,
            is_confirmed: source.is_confirmed,
            notes: source.notes,
            details: createRemainingLteDetails(source.details, clid),
          };
        },
      );
      if (additions.length === 0) return prev;
      return [...prev, ...additions];
    });
  }, [disabled, allBands, createNewCell]);

  useEffect(
    () => () => {
      for (const t of cloneTimers.current.values()) clearTimeout(t);
    },
    [],
  );

  const cloneCell = useCallback(
    (localId: string) => {
      if (disabled) return;
      const prev = cellsRef.current;
      const cell = prev.find((c) => c._localId === localId);
      if (!cell) return;
      const band = allBands.find((b) => b.id === cell.band_id) ?? allBands.find((b) => b.rat === cell.rat);
      if (!band) return;
      const template = createNewCell(cell.rat, band);
      const cloned = {
        ...template,
        band_id: cell.band_id,
        _sectorLocalId: cell._sectorLocalId,
        type: cell.type,
        is_confirmed: cell.is_confirmed,
        notes: cell.notes,
        details: { ...cell.details },
      };
      const idx = prev.findIndex((c) => c._localId === localId);
      const next = [...prev];
      next.splice(idx + 1, 0, cloned);
      setCells(next);
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
      setCells((prev) => {
        const cell = prev.find((c) => c._localId === localId);
        if (cell && onDelete) onDelete(cell);
        return prev.filter((c) => c._localId !== localId);
      });
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
