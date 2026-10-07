import { Add01Icon, AlertCircleIcon, Delete02Icon, InformationCircleIcon, Undo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { BatchRow, RowValues } from "../model/batchRows";
import type { RowConflict } from "../model/conflicts";
import { listFieldChoices } from "../model/fieldSelection";
import type { BatchRefusal } from "../model/refusals";
import type { BatchAction } from "../model/reviewState";
import { FieldCheckbox } from "./fieldCheckbox";
import { Button } from "@/components/ui/button";
import type { CellColumn } from "@/features/station-editing/components/cells/cellGrid";
import { DELETE_BUTTON_CLASS, RowActionButton } from "@/features/station-editing/components/cells/cellRow";
import { LockedCellRow, type LockedRowTone } from "@/features/station-editing/components/cells/lockedCellRow";
import { TEXT_SEPARATOR } from "@/features/station-editing/model/changes";
import { CELL_NUMBER_LABELS } from "@/features/station-editing/model/ratFields";
import { cn } from "@/lib/utils";

type ChangeRowNotes = {
  isExcluded?: boolean;
  conflict: RowConflict | undefined;
  spreadCount: number | null;
  isBandMissing: boolean;
  refusals: readonly BatchRefusal[];
};

export type ChangeRowProps = ChangeRowNotes & {
  row: BatchRow;
  sourceRow?: BatchRow;
  columns: readonly CellColumn[];
  values: RowValues;
  isRemoved: boolean;
  isLocked: boolean;
  onChange: (action: BatchAction) => void;
};

type NoteTone = "muted" | "danger" | "success";

type NoteLineProps = {
  icon: IconSvgElement;
  tone: NoteTone;
  className?: string;
  children: ReactNode;
};

type RowNotesProps = ChangeRowNotes & {
  row: BatchRow;
  lineClassName?: string;
};

type RestoreButtonProps = {
  isDisabled: boolean;
  onClick: () => void;
};

type RemoveButtonProps = RestoreButtonProps & {
  label: string;
};

const NOTE_TONE_CLASSES: Record<NoteTone, string> = {
  muted: "text-muted-foreground",
  danger: "text-destructive",
  success: "text-emerald-700 dark:text-emerald-400",
};

export function getRowTone(row: BatchRow, isRemoved: boolean, hasConflict: boolean): LockedRowTone {
  if (isRemoved) return "removed";
  if (hasConflict) return "conflict";
  return row.action === "create" ? "new" : "changed";
}

export function useSourceText(row: BatchRow): string {
  const { t } = useTranslation();
  const rowNumber = row.index + 1;

  return row.description === ""
    ? t("cellAnalyzer:batch.sourceRow", { row: rowNumber })
    : t("cellAnalyzer:batch.sourceRowDescribed", { row: rowNumber, description: row.description });
}

function NoteLine({ icon, tone, className, children }: NoteLineProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn("flex items-start gap-1.5 text-xs leading-4", NOTE_TONE_CLASSES[tone], className)}
    >
      <HugeiconsIcon icon={icon} aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function RowNotes({ row, conflict, spreadCount, isBandMissing, isExcluded, refusals, lineClassName }: RowNotesProps) {
  const { t } = useTranslation();
  const refusalText = [...new Set(refusals.map((refusal) => t(refusal.messageKey, refusal.values)))].join(TEXT_SEPARATOR);

  return (
    <>
      {isExcluded ? (
        <NoteLine icon={InformationCircleIcon} tone="muted" className={lineClassName}>
          {t("submissions:batch.notIncluded")}
        </NoteLine>
      ) : null}
      {conflict === undefined ? null : (
        <NoteLine icon={AlertCircleIcon} tone="danger" className={lineClassName}>
          {t("cellAnalyzer:batch.conflict", { row: conflict.rival + 1, field: CELL_NUMBER_LABELS[conflict.field] })}
        </NoteLine>
      )}
      {isBandMissing ? (
        <NoteLine icon={AlertCircleIcon} tone="danger" className={lineClassName}>
          {t("submissions:batch.bandNotMatched")}
        </NoteLine>
      ) : null}
      {refusalText === "" ? null : (
        <NoteLine icon={AlertCircleIcon} tone="danger" className={lineClassName}>
          {refusalText}
        </NoteLine>
      )}
      {spreadCount === null || spreadCount === 0 ? null : (
        <NoteLine icon={InformationCircleIcon} tone="muted" className={lineClassName}>
          {t("cellAnalyzer:batch.tacSpread", { count: spreadCount })}
        </NoteLine>
      )}
      {row.action === "create" ? (
        <NoteLine icon={Add01Icon} tone="success" className={lineClassName}>
          {t("cellAnalyzer:batch.newCell")}
        </NoteLine>
      ) : null}
    </>
  );
}

export function RestoreButton({ isDisabled, onClick }: RestoreButtonProps) {
  const { t } = useTranslation();

  return (
    <Button type="button" variant="ghost" size="sm" disabled={isDisabled} onClick={onClick} className="cursor-pointer">
      <HugeiconsIcon icon={Undo02Icon} aria-hidden="true" />
      {t("common:actions.restore")}
    </Button>
  );
}

export function RemoveButton({ label, isDisabled, onClick }: RemoveButtonProps) {
  return (
    <RowActionButton
      label={label}
      icon={Delete02Icon}
      className={DELETE_BUTTON_CLASS}
      isDisabled={isDisabled}
      isNavigable={false}
      onClick={onClick}
    />
  );
}

export function ChangeRow({
  row,
  sourceRow,
  columns,
  values,
  isRemoved,
  isLocked,
  conflict,
  spreadCount,
  isBandMissing,
  isExcluded,
  refusals,
  onChange,
}: ChangeRowProps) {
  const { t } = useTranslation();
  const sourceText = useSourceText(row);
  const rowNumber = row.index + 1;
  const isConfirmation = row.action === "confirm";
  const choices = sourceRow === undefined || isRemoved ? [] : listFieldChoices(sourceRow);
  const included = new Set(listFieldChoices(row).map((choice) => choice.field));

  const tail = isRemoved ? (
    <RestoreButton isDisabled={isLocked} onClick={() => onChange({ type: "restoreRow", index: row.index })} />
  ) : (
    <>
      {conflict === undefined ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isLocked}
          onClick={() => onChange({ type: "keepRow", index: row.index, rivals: conflict.rivals })}
          className="shrink-0 cursor-pointer"
        >
          {t("cellAnalyzer:batch.keepRow")}
        </Button>
      )}
      <RemoveButton
        label={t("submissions:batch.removeCell", { row: rowNumber })}
        isDisabled={isLocked}
        onClick={() => onChange({ type: "removeRow", index: row.index })}
      />
    </>
  );

  return (
    <LockedCellRow
      rowKey={row.key}
      label={t("cellAnalyzer:batch.rowLabel", { row: rowNumber })}
      columns={columns}
      values={values}
      isConfirmMarked={isConfirmation}
      confirmedLabel={isConfirmation ? t("cellAnalyzer:batch.willConfirm") : t("common:labels.confirmed")}
      tone={getRowTone(row, isRemoved, conflict !== undefined)}
      tail={tail}
      renderNumberControl={(field) => {
        const choice = choices.find((candidate) => candidate.field === field);
        return choice === undefined ? null : (
          <FieldCheckbox
            choice={choice}
            isIncluded={included.has(choice.field)}
            isLocked={isLocked}
            onChange={onChange}
            className="shrink-0 md:min-h-7"
          />
        );
      }}
    >
      <p className={cn("col-[3/-1] mt-0.5 truncate text-xs leading-4 text-muted-foreground", isRemoved && "line-through")}>{sourceText}</p>
      {isRemoved ? null : (
        <RowNotes
          row={row}
          conflict={conflict}
          spreadCount={spreadCount}
          isBandMissing={isBandMissing}
          isExcluded={isExcluded}
          refusals={refusals}
          lineClassName="col-span-full pt-[3px] pb-px pl-0.5"
        />
      )}
    </LockedCellRow>
  );
}
