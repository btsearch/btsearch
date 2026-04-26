import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { Band } from "@/types/station";

import type { CellDraftBase } from "../cellEditRow";
import { RAT_ORDER, getSharedDetailFields } from "../rat";

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
  addCell: (rat: string) => void;
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
        let clidA = 0;
        let clidB = 0;
        switch (a.rat) {
          case "GSM":
            clidA = (a.details.cid as number) ?? 0;
            clidB = (b.details.cid as number) ?? 0;
            break;
          case "UMTS":
            clidA = (a.details.cid_long as number) ?? 0;
            clidB = (b.details.cid_long as number) ?? 0;
            break;
          case "LTE":
            clidA = (a.details.ecid as number) ?? 0;
            clidB = (b.details.ecid as number) ?? 0;
            break;
          case "NR":
            clidA = (a.details.nci as number) ?? 0;
            clidB = (b.details.nci as number) ?? 0;
            break;
        }
        return clidA - clidB;
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
      setCells((prev) => prev.map((c) => (c._localId === localId ? { ...c, ...patch } : c)));
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
        const defaultBand = rat === "UMTS" ? (bandsForRat.find((b) => b.duplex === "FDD") ?? bandsForRat[0]) : bandsForRat[0];
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
      const cloned = { ...template, band_id: cell.band_id, is_confirmed: cell.is_confirmed, notes: cell.notes, details: { ...cell.details } };
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
    addCell,
    cloneCell,
    clonedIds,
    deleteCell: deleteCellFn,
  };
}
