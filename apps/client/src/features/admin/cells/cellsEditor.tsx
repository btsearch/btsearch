import { Add01Icon, ArrowDown01Icon, ArrowReloadHorizontalIcon, Copy01Icon, FlashIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Fragment, type ReactNode, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { EmptyPanel } from "@/components/empty-panel";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RatCellsTableHeader } from "@/features/shared/RatCellsTableHeader";
import { useHorizontalScroll } from "@/hooks/useHorizontalScroll";
import { getKnownEARFCN } from "@/lib/earfcn-fill";
import { cn } from "@/lib/utils";
import type { Band, SectorDraft } from "@/types/station";

import type { CellDraftBase } from "./cellEditRow";
import { CellEditRow } from "./cellEditRow";
import { RAT_ICONS, RAT_ORDER, getRatSupportsSectorPciSync, ratToGenLabel } from "./rat";
import { isNRSyncTarget } from "./sectorAssignmentSync";

export type DiffBadges = {
  added?: number;
  modified?: number;
  deleted?: number;
};

export type CellsEditorProps<T extends CellDraftBase> = {
  cellsByRat: Record<string, T[]>;
  enabledRats: string[];
  visibleRats: string[];
  bands: Band[];
  sectors?: SectorDraft[];

  onToggleRat: (rat: string) => void;
  onCellChange: (localId: string, patch: Partial<CellDraftBase>) => void;
  onSyncSectorsByPCIInRat?: (rat: string) => void;
  onAddCell: (rat: string) => void;
  onAddRemainingLteCells?: () => void;
  onCloneCell?: (localId: string) => void;
  clonedIds?: ReadonlySet<string>;
  onDeleteCell: (localId: string) => void;

  // Disable all RAT toggle pills (e.g. when submission is rejected)
  ratPillsDisabled?: boolean;

  // Whether to show the "Add cell" button per RAT section. Default: true
  showAddButton?: boolean;

  // Whether to show "Confirm cells" button per RAT (calls onConfirmAllCellsInRat for that RAT)
  showConfirmCellsButton?: boolean;
  onConfirmAllCellsInRat?: (rat: string) => void;

  // MNC of the selected operator
  operatorMnc?: number | null;

  // Compute diff badge counts for a RAT section header
  getDiffBadges?: (rat: string, cells: T[]) => DiffBadges;

  // Compute per-cell CellEditRow display props
  getCellProps?: (cell: T) => {
    disabled?: boolean;
    leftBorderClass?: string;
    showDelete?: boolean;
    rowClassName?: string;
  };

  // Render extra content after each cell row (e.g., "was" diff row for submissions)
  renderAfterRow?: (cell: T) => ReactNode;

  // Additional className for each RAT section card
  sectionClassName?: string;

  readOnly?: boolean;
  readOnlyPlaceholder?: ReactNode;
};

const TAC_LAC_FIELD: Partial<Record<string, string>> = {
  GSM: "lac",
  UMTS: "lac",
  LTE: "tac",
  NR: "nrtac",
};

type RatTableProps<T extends CellDraftBase> = {
  cells: T[];
  bands: Band[];
  sectors?: SectorDraft[];
  getCellProps?: CellsEditorProps<T>["getCellProps"];
  renderAfterRow?: CellsEditorProps<T>["renderAfterRow"];
  onCellChange: (localId: string, patch: Partial<CellDraftBase>) => void;
  onCloneCell?: (localId: string) => void;
  clonedIds?: ReadonlySet<string>;
  onDeleteCell: (localId: string) => void;
};

function RatTable<T extends CellDraftBase>({
  cells,
  bands,
  sectors,
  getCellProps,
  renderAfterRow,
  onCellChange,
  onCloneCell,
  clonedIds,
  onDeleteCell,
}: RatTableProps<T>) {
  const { t } = useTranslation(["stations"]);
  const scrollRef = useHorizontalScroll<HTMLDivElement>();

  const handleCellChange = useCallback(
    (localId: string, patch: Partial<CellDraftBase>) => {
      onCellChange(localId, patch);

      if (!patch.details || cells.length < 2) return;
      const rat = cells[0]?.rat;
      if (!rat) return;
      const field = TAC_LAC_FIELD[rat];
      if (!field) return;
      const changedCell = cells.find((c) => c._localId === localId);
      if (!changedCell) return;
      const newVal = patch.details[field];
      if (newVal === changedCell.details[field]) return;
      for (const sibling of cells) {
        if (sibling._localId === localId) continue;
        const next = { ...sibling.details };
        if (newVal === undefined) delete next[field];
        else next[field] = newVal;
        onCellChange(sibling._localId, { details: next });
      }
    },
    [cells, onCellChange],
  );

  return (
    <div ref={scrollRef} className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-sm">
        <RatCellsTableHeader rat={cells[0]?.rat ?? ""} t={t} showSectors={sectors !== undefined && sectors.length > 0} />
        <tbody>
          {cells.map((cell) => {
            const cellProps = getCellProps?.(cell) ?? {};
            const isCloned = clonedIds?.has(cell._localId) ?? false;
            return (
              <Fragment key={cell._localId}>
                <CellEditRow
                  localCell={cell}
                  bands={bands}
                  disabled={cellProps.disabled}
                  leftBorderClass={isCloned ? "border-l-2 border-l-sky-500" : cellProps.leftBorderClass}
                  showDelete={cellProps.showDelete}
                  rowClassName={isCloned ? "bg-sky-500/5" : cellProps.rowClassName}
                  sectors={sectors}
                  onChange={handleCellChange}
                  onClone={onCloneCell}
                  onDelete={onDeleteCell}
                />
                {renderAfterRow?.(cell)}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CellsEditor<T extends CellDraftBase>({
  cellsByRat,
  enabledRats,
  visibleRats,
  bands,
  sectors,
  onToggleRat,
  onCellChange,
  onSyncSectorsByPCIInRat,
  onAddCell,
  onAddRemainingLteCells,
  onCloneCell,
  clonedIds,
  onDeleteCell,
  ratPillsDisabled,
  showAddButton = true,
  showConfirmCellsButton,
  onConfirmAllCellsInRat,
  getDiffBadges,
  getCellProps,
  renderAfterRow,
  sectionClassName,
  readOnly,
  readOnlyPlaceholder,
  operatorMnc,
}: CellsEditorProps<T>) {
  const { t } = useTranslation(["stations"]);

  return (
    <>
      <div className="flex flex-wrap gap-1">
        {RAT_ORDER.map((rat) => {
          const isSelected = !ratPillsDisabled && enabledRats.includes(rat);
          return (
            <button
              key={rat}
              type="button"
              onClick={() => onToggleRat(rat)}
              disabled={ratPillsDisabled}
              className={cn(
                "flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition-all border",
                isSelected
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "border-border bg-background hover:bg-muted text-foreground dark:bg-input/30 dark:border-input",
                ratPillsDisabled && "opacity-50 cursor-not-allowed",
              )}
            >
              <span className={cn("text-xs", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>{ratToGenLabel(rat)}</span>
              <span>{rat}</span>
            </button>
          );
        })}
      </div>

      {visibleRats.length === 0 ? (
        <EmptyPanel>{readOnly ? (readOnlyPlaceholder ?? t("submissions:detail.readOnly")) : t("stations:cells.noRats")}</EmptyPanel>
      ) : (
        visibleRats.map((rat) => {
          const cellsForRat = cellsByRat[rat] ?? [];
          const badges = getDiffBadges?.(rat, cellsForRat);
          const hasChanges = badges && ((badges.added ?? 0) > 0 || (badges.modified ?? 0) > 0 || (badges.deleted ?? 0) > 0);
          const canSyncSectorsByPCI =
            !readOnly &&
            getRatSupportsSectorPciSync(rat) &&
            onSyncSectorsByPCIInRat !== undefined &&
            sectors !== undefined &&
            sectors.length > 0 &&
            cellsForRat.some(isNRSyncTarget);

          return (
            <Collapsible key={rat} defaultOpen>
              <div className={cn("border rounded-xl overflow-hidden", sectionClassName)}>
                <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center justify-between">
                  <CollapsibleTrigger className="flex items-center gap-2 cursor-pointer select-none group">
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      className="size-3.5 text-muted-foreground transition-transform group-data-panel-open:rotate-0 -rotate-90"
                    />
                    <HugeiconsIcon icon={RAT_ICONS[rat]} className="size-4 text-muted-foreground" />
                    <span className="font-semibold text-sm">{rat}</span>
                    <span className="text-xs text-muted-foreground inline sm:hidden">({cellsForRat.length})</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">({t("cells.cellsCount", { count: cellsForRat.length })})</span>
                    {hasChanges && (
                      <span className="flex items-center gap-2 ml-1">
                        {(badges.added ?? 0) > 0 && (
                          <span className="text-xs text-green-600 flex items-center gap-1">
                            <span className="size-1.5 rounded-full bg-green-500" />
                            {badges.added}
                            <span className="hidden sm:inline">{t("cells.diffAdded", { count: badges.added })}</span>
                          </span>
                        )}
                        {(badges.modified ?? 0) > 0 && (
                          <span className="text-xs text-amber-600 flex items-center gap-1">
                            <span className="size-1.5 rounded-full bg-amber-500" />
                            {badges.modified}
                            <span className="hidden sm:inline">{t("cells.diffModified", { count: badges.modified })}</span>
                          </span>
                        )}
                        {(badges.deleted ?? 0) > 0 && (
                          <span className="text-xs text-red-600 flex items-center gap-1">
                            <span className="size-1.5 rounded-full bg-red-500" />
                            {badges.deleted}
                            <span className="hidden sm:inline">{t("cells.diffDeleted", { count: badges.deleted })}</span>
                          </span>
                        )}
                      </span>
                    )}
                  </CollapsibleTrigger>
                  <div className="flex items-center gap-1">
                    {canSyncSectorsByPCI && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onSyncSectorsByPCIInRat?.(rat)}
                        className="h-7 text-xs text-cyan-700/80 hover:text-cyan-700 hover:bg-cyan-600/10 dark:text-cyan-400 dark:hover:text-cyan-300 dark:hover:bg-cyan-400/10"
                        aria-label={t("stations:cells.syncSectorsByPci")}
                        title={t("stations:cells.syncSectorsByPci")}
                      >
                        <HugeiconsIcon icon={ArrowReloadHorizontalIcon} className="size-3.5" />
                        <span className="hidden sm:inline">{t("stations:cells.syncSectorsByPci")}</span>
                      </Button>
                    )}
                    {showConfirmCellsButton && onConfirmAllCellsInRat && cellsForRat.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onConfirmAllCellsInRat(rat)}
                        className="h-7 text-xs text-green-700/80 hover:text-green-700 hover:bg-green-600/10 dark:text-green-400 dark:hover:text-green-300 dark:hover:bg-green-400/10"
                      >
                        <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
                        <span className="hidden sm:inline">{t("stations:cells.confirmCells")}</span>
                      </Button>
                    )}
                    {rat === "LTE" && operatorMnc && !readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const bandById = new Map(bands.map((b) => [b.id, b]));
                          for (const cell of cellsForRat) {
                            const earfcn = cell.details.earfcn;
                            if (earfcn !== undefined && earfcn !== null && earfcn !== "" && earfcn !== 0) continue;
                            const band = bandById.get(cell.band_id);
                            if (!band) continue;
                            const known = getKnownEARFCN(operatorMnc, band.value, band.duplex);
                            if (known !== null) onCellChange(cell._localId, { details: { ...cell.details, earfcn: known } });
                          }
                        }}
                        className="h-7 text-xs text-sky-600/80 hover:text-sky-600 hover:bg-sky-500/10 dark:text-sky-400 dark:hover:text-sky-300 dark:hover:bg-sky-400/10"
                      >
                        <HugeiconsIcon icon={FlashIcon} className="size-3.5" />
                        <span className="hidden sm:inline">{t("stations:cells.fillEarfcn")}</span>
                      </Button>
                    )}
                    {rat === "LTE" && operatorMnc === 26006 && onAddRemainingLteCells && !readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onAddRemainingLteCells}
                        className="h-7 text-xs text-purple-600/80 hover:text-purple-600 hover:bg-purple-500/10 dark:text-purple-400 dark:hover:text-purple-300 dark:hover:bg-purple-400/10"
                      >
                        <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
                        <span className="hidden sm:inline">{t("stations:cells.addRemainingCells")}</span>
                      </Button>
                    )}
                    {showAddButton && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => onAddCell(rat)} className="h-7 text-xs">
                        <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                        <span className="hidden sm:inline">{t("stations:cells.addCell")}</span>
                      </Button>
                    )}
                  </div>
                </div>
                <CollapsibleContent>
                  {cellsForRat.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-muted-foreground">{t("stations:cells.noCells")}</div>
                  ) : (
                    <RatTable
                      cells={cellsForRat}
                      bands={bands}
                      sectors={sectors}
                      getCellProps={getCellProps}
                      renderAfterRow={renderAfterRow}
                      onCellChange={onCellChange}
                      onCloneCell={onCloneCell}
                      clonedIds={clonedIds}
                      onDeleteCell={onDeleteCell}
                    />
                  )}
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })
      )}
    </>
  );
}
