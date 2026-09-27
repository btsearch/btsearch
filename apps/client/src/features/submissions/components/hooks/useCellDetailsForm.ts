import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CellsChangeHandler, ProposedCellForm, RatType } from "../../types";
import { buildOriginalCellsMap, generateCellId, getCellDiffStatus, getDefaultCellDetails } from "../../utils/cells";
import { buildRemainingLTECells, createRemainingLTEDetails } from "@/features/cells/lib/remainingLteCells";
import { DEFAULT_CELL_TYPE } from "@/features/shared/cellTypes";
import { bandsQueryOptions } from "@/features/shared/queries";
import { compareRatCells, getRatSiblingSyncField, getSharedDetailFields } from "@/features/shared/rat";

function getInitialCellOrder(cells: ProposedCellForm[], bandValueMap: Map<number, number>, rat: RatType): string[] {
  return [...cells]
    .sort((a, b) => {
      const bandA = a.band_id !== null ? (bandValueMap.get(a.band_id) ?? 0) : 0;
      const bandB = b.band_id !== null ? (bandValueMap.get(b.band_id) ?? 0) : 0;
      return compareRatCells(rat, bandA, a.details, bandB, b.details);
    })
    .map((cell) => cell.id);
}

function reconcileStableCellOrder(order: string[], cells: ProposedCellForm[]): string[] {
  const presentIds = new Set(cells.map((cell) => cell.id));
  const result = order.filter((id) => presentIds.has(id));
  const orderedIds = new Set(result);

  for (const cell of cells) {
    if (orderedIds.has(cell.id)) continue;
    result.push(cell.id);
    orderedIds.add(cell.id);
  }

  return result;
}

export type UseCellDetailsFormProps = {
  rat: RatType;
  cells: ProposedCellForm[];
  originalCells: ProposedCellForm[];
  isNewStation: boolean;
  operatorMnc?: number | null;
  onCellsChange: CellsChangeHandler;
};

export function useCellDetailsForm({ rat, cells, originalCells, isNewStation, operatorMnc, onCellsChange }: UseCellDetailsFormProps) {
  const { t } = useTranslation(["submissions", "admin"]);
  const { t: tStation } = useTranslation("stationDetails");

  const { data: allBands = [] } = useQuery(bandsQueryOptions());

  const bandsForRat = useMemo(() => allBands.filter((band) => band.rat === rat), [allBands, rat]);

  const bandValueMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const b of allBands) map.set(b.id, b.value);
    return map;
  }, [allBands]);

  const mergedCells = useMemo(() => {
    if (isNewStation) return cells;
    const currentExistingIds = new Set(cells.filter((c) => c.existingCellId !== undefined).map((c) => c.existingCellId));
    const deletedCells = originalCells.filter((c) => c.rat === rat && c.existingCellId !== undefined && !currentExistingIds.has(c.existingCellId));
    return [...cells, ...deletedCells];
  }, [cells, originalCells, isNewStation, rat]);

  const [stableOrder, setStableOrder] = useState<string[] | null>(null);
  const initialOrder = useMemo(() => getInitialCellOrder(mergedCells, bandValueMap, rat), [bandValueMap, mergedCells, rat]);

  if (stableOrder === null && bandValueMap.size > 0) setStableOrder(initialOrder);

  const sortedCells = useMemo(() => {
    const order = reconcileStableCellOrder(stableOrder ?? initialOrder, mergedCells);
    const orderMap = new Map(order.map((id, i) => [id, i]));
    return [...mergedCells].sort((a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity));
  }, [initialOrder, mergedCells, stableOrder]);

  const originalsMap = useMemo(() => buildOriginalCellsMap(originalCells), [originalCells]);

  const diffCounts = useMemo(() => {
    if (isNewStation) return { added: cells.length, modified: 0, deleted: 0 };
    let added = 0;
    let modified = 0;
    for (const cell of cells) {
      const status = getCellDiffStatus(cell, originalsMap);
      if (status === "added") added++;
      else if (status === "modified") modified++;
    }
    const currentExistingIds = new Set(cells.filter((c) => c.existingCellId !== undefined).map((c) => c.existingCellId));
    const deleted = originalCells.filter((c) => c.rat === rat && c.existingCellId !== undefined && !currentExistingIds.has(c.existingCellId)).length;
    return { added, modified, deleted };
  }, [cells, originalsMap, isNewStation, originalCells, rat]);

  const updateCells = useCallback((update: (current: ProposedCellForm[]) => ProposedCellForm[]) => onCellsChange(rat, update), [onCellsChange, rat]);

  const handleAddCell = useCallback(() => {
    updateCells((current) => {
      const defaults = getDefaultCellDetails(rat);
      const existingSibling = current[0] ?? originalCells.find((c) => c.rat === rat);
      if (existingSibling) {
        const sharedFields = getSharedDetailFields(rat);
        for (const field of sharedFields) {
          if ((existingSibling.details as Record<string, unknown>)[field] !== undefined)
            (defaults as Record<string, unknown>)[field] = (existingSibling.details as Record<string, unknown>)[field];
        }
      }
      return [...current, { id: generateCellId(), rat, band_id: null, type: DEFAULT_CELL_TYPE, details: defaults }];
    });
  }, [originalCells, rat, updateCells]);

  const handleAddRemainingLteCells = useCallback(() => {
    if (rat !== "LTE") return;
    updateCells((current) => [
      ...current,
      ...buildRemainingLTECells({
        operatorMnc,
        cells: current,
        getBandId: (cell) => cell.band_id,
        getDetails: (cell) => cell.details as Readonly<Record<string, unknown>>,
        createCell: (source, clid) => ({
          id: generateCellId(),
          rat,
          band_id: source.band_id,
          _sectorLocalId: null,
          type: source.type ?? DEFAULT_CELL_TYPE,
          notes: source.notes,
          is_confirmed: source.is_confirmed,
          details: createRemainingLTEDetails(source.details as Readonly<Record<string, unknown>>, clid),
        }),
      }),
    ]);
  }, [operatorMnc, rat, updateCells]);

  const [clonedIds, setClonedIds] = useState<ReadonlySet<string>>(new Set());
  const cloneTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(
    () => () => {
      for (const t of cloneTimers.current.values()) clearTimeout(t);
    },
    [],
  );

  const handleCloneCell = useCallback(
    (id: string) => {
      const newId = generateCellId();
      updateCells((current) => {
        const index = current.findIndex((c) => c.id === id);
        const cell = current[index];
        if (!cell) return current;
        const details: Record<string, unknown> = { ...cell.details };
        delete details.pci;
        const next = [...current];
        next.splice(index + 1, 0, {
          ...cell,
          id: newId,
          existingCellId: undefined,
          _sectorLocalId: null,
          type: cell.type ?? DEFAULT_CELL_TYPE,
          details: details as ProposedCellForm["details"],
        });
        return next;
      });
      setClonedIds((prev) => new Set([...prev, newId]));
      const timer = setTimeout(() => {
        setClonedIds((prev) => {
          const s = new Set(prev);
          s.delete(newId);
          return s;
        });
        cloneTimers.current.delete(newId);
      }, 2000);
      cloneTimers.current.set(newId, timer);
    },
    [updateCells],
  );

  const handleRemoveCell = useCallback((id: string) => updateCells((current) => current.filter((cell) => cell.id !== id)), [updateCells]);

  const handleRestoreCell = useCallback((cell: ProposedCellForm) => updateCells((current) => [...current, cell]), [updateCells]);

  const handleCellUpdate = useCallback(
    (cellId: string, patch: Partial<ProposedCellForm>) =>
      updateCells((current) => current.map((cell) => (cell.id === cellId ? { ...cell, ...patch } : cell))),
    [updateCells],
  );

  const handleDetailsChange = useCallback(
    (id: string, field: string, value: number | boolean | string | undefined) =>
      updateCells((current) => {
        const syncSiblings = getRatSiblingSyncField(rat) === field && current.length >= 2;
        return current.map((cell) => {
          if (cell.id !== id && !syncSiblings) return cell;
          const newDetails = { ...cell.details } as Record<string, unknown>;
          if (value === undefined) delete newDetails[field];
          else newDetails[field] = value;
          return { ...cell, details: newDetails as ProposedCellForm["details"] };
        });
      }),
    [rat, updateCells],
  );

  const handleNotesChange = useCallback(
    (id: string, notes: string) => updateCells((current) => current.map((cell) => (cell.id === id ? { ...cell, notes: notes || undefined } : cell))),
    [updateCells],
  );

  return {
    t,
    tStation,
    bandsForRat,
    sortedCells,
    originalsMap,
    diffCounts,
    handleAddCell,
    handleAddRemainingLteCells,
    handleCloneCell,
    clonedIds,
    handleRemoveCell,
    handleRestoreCell,
    handleCellUpdate,
    handleDetailsChange,
    handleNotesChange,
  };
}
