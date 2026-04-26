import { Copy01Icon, Delete02Icon, DeletePutBackIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CellDetailsFields } from "@/features/admin/cells/cellDetailsFields";
import { useBandSelection } from "@/features/admin/cells/hooks/useBandSelection";
import { navigateRowHorizontal } from "@/features/admin/cells/rowNav";
import { getBandName } from "@/features/station-details/frequencyCalc";
import { useHorizontalScroll } from "@/hooks/useHorizontalScroll";
import { cn } from "@/lib/utils";
import type { Band } from "@/types/station";

import type { ProposedCellForm, RatType } from "../types";
import { type CellDiffStatus, getCellDiffStatus } from "../utils/cells";
import type { CellError } from "../utils/validation";
import { useCellDetailsForm } from "./hooks/useCellDetailsForm";
import { CellsTableHeaders } from "./subcomponents/CellsTableHeaders";
import { CollapsibleHeader } from "./subcomponents/CollapsibleHeader";

type CellDetailsFormProps = {
  rat: RatType;
  cells: ProposedCellForm[];
  originalCells: ProposedCellForm[];
  isNewStation: boolean;
  cellErrors?: Record<string, CellError>;
  onCellsChange: (rat: RatType, cells: ProposedCellForm[]) => void;
};

export function CellDetailsForm({ rat, cells, originalCells, isNewStation, cellErrors, onCellsChange }: CellDetailsFormProps) {
  const scrollRef = useHorizontalScroll<HTMLDivElement>();
  const {
    t,
    tStation,
    bandsForRat,
    sortedCells,
    originalsMap,
    diffCounts,
    handleAddCell,
    handleCloneCell,
    clonedIds,
    handleRemoveCell,
    handleRestoreCell,
    handleCellUpdate,
    handleDetailsChange,
    handleNotesChange,
  } = useCellDetailsForm({ rat, cells, originalCells, isNewStation, onCellsChange });

  return (
    <Collapsible defaultOpen>
      <div className="border rounded-xl overflow-hidden">
        <CollapsibleHeader rat={rat} cellsCount={cells.length} diffCounts={diffCounts} onAddCell={handleAddCell} t={t} />
        <CollapsibleContent>
          {cells.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">{t("stations:cells.noCells")}</div>
          ) : (
            <div ref={scrollRef} className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm">
                <CellsTableHeaders rat={rat} tStation={tStation} />
                <tbody>
                  {sortedCells.map((cell) => {
                    const isDeleted =
                      !isNewStation && cell.existingCellId !== undefined && !cells.some((c) => c.existingCellId === cell.existingCellId);
                    const diffStatus: CellDiffStatus = isDeleted ? "deleted" : isNewStation ? "added" : getCellDiffStatus(cell, originalsMap);

                    return (
                      <CellRow
                        key={cell.id}
                        rat={rat}
                        cell={cell}
                        diffStatus={diffStatus}
                        error={cellErrors?.[cell.id]}
                        bands={bandsForRat}
                        onUpdate={handleCellUpdate}
                        onDetailsChange={handleDetailsChange}
                        onNotesChange={handleNotesChange}
                        onRemove={handleRemoveCell}
                        onClone={!isDeleted ? handleCloneCell : undefined}
                        isCloned={clonedIds.has(cell.id)}
                        onRestore={isDeleted ? () => handleRestoreCell(cell) : undefined}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

type CellRowProps = {
  rat: RatType;
  cell: ProposedCellForm;
  diffStatus: CellDiffStatus;
  error?: CellError;
  bands: Band[];
  onUpdate: (id: string, patch: Partial<ProposedCellForm>) => void;
  onDetailsChange: (id: string, field: string, value: number | boolean | string | undefined) => void;
  onNotesChange: (id: string, notes: string) => void;
  onRemove: (id: string) => void;
  onClone?: (id: string) => void;
  isCloned?: boolean;
  onRestore?: () => void;
};

const DebouncedNotesInput = memo(function DebouncedNotesInput({
  value,
  placeholder,
  disabled,
  onChange,
}: {
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  if (value !== prevValue) {
    setPrevValue(value);
    setLocal(value);
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocal(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChangeRef.current(v), 300);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <Input
      type="text"
      placeholder={placeholder}
      value={local}
      onChange={handleChange}
      onKeyDown={navigateRowHorizontal}
      data-nav-cell
      className="h-7 w-28 text-sm"
      disabled={disabled}
    />
  );
});

const CellRow = memo(function CellRow({
  rat,
  cell,
  diffStatus,
  error,
  bands,
  onUpdate,
  onDetailsChange,
  onNotesChange,
  onRemove,
  onClone,
  isCloned,
  onRestore,
}: CellRowProps) {
  const { t } = useTranslation(["submissions", "common"]);

  const { uniqueBandValues, bandValue, duplex, duplexOptions, hasDuplexChoice, findBandId, bandsForRat } = useBandSelection(
    bands,
    rat,
    cell.band_id ?? -1,
  );

  const handleBandValueChange = useCallback(
    (value: number | null) => {
      const opts = value ? [...new Set(bandsForRat.filter((b) => b.value === value).map((b) => b.duplex))] : [];
      const defaultDuplex = opts.length === 1 ? opts[0] : rat === "UMTS" && opts.includes("FDD") ? "FDD" : null;
      const newBandId = findBandId(value, defaultDuplex);
      if (!newBandId) return;
      const patch: Partial<ProposedCellForm> = { band_id: newBandId };
      if (rat === "GSM" && value === 1800) patch.details = { ...cell.details, e_gsm: false } as ProposedCellForm["details"];
      onUpdate(cell.id, patch);
    },
    [bandsForRat, findBandId, rat, cell.id, cell.details, onUpdate],
  );

  const handleDuplexChange = useCallback(
    (dup: string | null) => {
      const newBandId = findBandId(bandValue, dup);
      onUpdate(cell.id, { band_id: newBandId });
    },
    [bandValue, findBandId, cell.id, onUpdate],
  );

  const handleNotesChange = useCallback((value: string) => onNotesChange(cell.id, value), [cell.id, onNotesChange]);

  const firstCellBorderClass = isCloned
    ? "border-l-2 border-l-sky-500"
    : {
        added: "border-l-2 border-l-green-500",
        modified: "border-l-2 border-l-amber-500",
        deleted: "border-l-2 border-l-red-500",
        unchanged: "",
      }[diffStatus];

  const isDeleted = diffStatus === "deleted";
  const deletedCellClass = isDeleted ? "opacity-50" : "";

  return (
    <tr className={cn("border-b last:border-0 hover:bg-muted/20", isDeleted && "bg-muted/10", isCloned && "bg-sky-500/5")}>
      <td className={cn("px-3 py-1", firstCellBorderClass, deletedCellClass)}>
        <Select
          disabled={diffStatus === "deleted"}
          value={bandValue?.toString() ?? ""}
          onValueChange={(value) => handleBandValueChange(value ? Number.parseInt(value, 10) : null)}
        >
          <SelectTrigger
            className={cn("h-7 w-20 text-sm focus:border-ring focus:ring-[3px] focus:ring-ring/50", error?.band_id && "border-destructive")}
            onKeyDown={navigateRowHorizontal}
            data-nav-cell
          >
            <SelectValue>{bandValue ? bandValue : t("common:placeholder.selectBand")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {uniqueBandValues.map((value) => {
              const name = getBandName(rat, value);
              return (
                <SelectItem key={value} value={value.toString()}>
                  {value}
                  {name ? <span className="opacity-75">({name})</span> : null}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </td>
      {rat !== "GSM" ? (
        <td className={cn("px-3 py-1", deletedCellClass)}>
          {hasDuplexChoice ? (
            <Select
              disabled={diffStatus === "deleted"}
              value={duplex ?? "_none"}
              onValueChange={(value) => handleDuplexChange(value === "_none" ? null : value)}
            >
              <SelectTrigger
                className="h-7 w-20 text-sm focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                onKeyDown={navigateRowHorizontal}
                data-nav-cell
              >
                <SelectValue>{duplex ?? "-"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {duplexOptions.includes(null) && <SelectItem value="_none">-</SelectItem>}
                {duplexOptions
                  .filter((d) => d !== null)
                  .map((duplex) => (
                    <SelectItem key={duplex} value={duplex}>
                      {duplex}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          )}
        </td>
      ) : null}
      <CellDetailsFields
        rat={rat}
        bandValue={bandValue}
        details={cell.details as Record<string, unknown>}
        detailErrors={error?.details}
        disabled={diffStatus === "deleted"}
        onDetailChange={(field, value) => onDetailsChange(cell.id, field, value)}
      />
      <td className={cn("px-3 py-1", deletedCellClass)}>
        <DebouncedNotesInput
          value={cell.notes ?? ""}
          placeholder={t("stations:cells.notesPlaceholder")}
          disabled={isDeleted}
          onChange={handleNotesChange}
        />
      </td>
      <td className="px-3 py-1">
        {onRestore ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button type="button" variant="ghost" size="sm" onClick={onRestore} className="h-6 w-6 p-0 text-yellow-600 hover:text-yellow-500">
                  <HugeiconsIcon icon={DeletePutBackIcon} className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>{t("common:actions.restore")}</TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-0.5">
            {onClone && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onClone(cell.id)}
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(cell.id)}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent>{t("common:actions.delete")}</TooltipContent>
            </Tooltip>
          </div>
        )}
      </td>
    </tr>
  );
});
