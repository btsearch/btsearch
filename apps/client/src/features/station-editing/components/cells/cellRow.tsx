import { Copy01Icon, Delete02Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { Band } from "@openbts/shared/contract";
import { memo } from "react";

import { CELL_CONTROL_PROPS, cellRowProps } from "../../hooks/useCellNavigation";
import { type DraftDispatch, toFlagPatch } from "../../model/draftReducer";
import { CELL_NUMBER_LABELS, RAT_FIELDS, computeCellId, getCellFlag, getCellNumber, isFieldInUse } from "../../model/ratFields";
import type { CellDraft, CellRowState, DraftKey, EditError, EditKind, RowKind, SectorDraft } from "../../model/types";
import { CellErrors } from "./cellErrors";
import {
  BandField,
  CheckField,
  ComputedValue,
  FieldCell,
  GnbidLengthField,
  ModeField,
  NumberField,
  SectorField,
  TypeField,
  UNUSED_FIELD_CLASS,
  findSectorLabel,
  getBandMark,
  getCellFieldView,
  isEGsmBlocked,
} from "./cellFields";
import { type CellColumn, GRID_ROW_CLASS } from "./cellGrid";
import { CellNote } from "./cellNote";
import type { CellTexts } from "./cellTexts";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getBandLabel } from "@/features/station-details/station/utils/bands";
import { isRecent } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

type CellRowProps = {
  cell: CellDraft;
  state: CellRowState;
  errors: readonly EditError[];
  dispatch: DraftDispatch;
  columns: readonly CellColumn[];
  band: Band | undefined;
  bands: readonly Band[];
  sectors: readonly SectorDraft[];
  texts: CellTexts;
  editKind: EditKind;
  canEdit: boolean;
  canConfirm: boolean;
  onSectorAdded: (sectorKey: DraftKey) => void;
};

type RowActionsProps = {
  cellKey: DraftKey;
  texts: CellTexts;
  isDeleted: boolean;
  canEdit: boolean;
  dispatch: DraftDispatch;
};

type RowActionButtonProps = {
  label: string;
  icon: IconSvgElement;
  className?: string;
  isDisabled?: boolean;
  isNavigable?: boolean;
  onClick: () => void;
};

const ROW_CLASS = cn(
  GRID_ROW_CLASS,
  "relative items-start border-b py-1 last:border-b-transparent",
  "hover:bg-linear-to-r hover:from-muted/50 hover:to-muted/50",
);
export const CELL_ROW_CLASS = ROW_CLASS;
const EDGE_CLASS = "before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-[3px]";

export const ROW_KIND_CLASSES: Record<RowKind, string> = {
  same: "",
  new: cn(EDGE_CLASS, "bg-emerald-500/6 before:bg-emerald-500"),
  changed: cn(EDGE_CLASS, "before:bg-amber-500"),
  deleted: cn(EDGE_CLASS, "bg-destructive/6 before:bg-destructive"),
};
const ACTIONS_CLASS = "flex h-7 w-[60px] shrink-0 items-center justify-end gap-0.5";
export const DELETE_BUTTON_CLASS = "hover:bg-destructive/15 hover:text-destructive dark:hover:bg-destructive/15";

export function getCellRowClass(cell: CellDraft, kind: RowKind): string {
  if (kind !== "same") return ROW_KIND_CLASSES[kind];
  if (cell.createdAt !== null && isRecent(cell.createdAt)) return "bg-green-500/5";
  return cell.updatedAt !== null && isRecent(cell.updatedAt) ? "bg-amber-500/5" : "";
}

function getCellLabel(cell: CellDraft, band: Band | undefined, sectors: readonly SectorDraft[], texts: CellTexts): string {
  const { name, cellIdField } = RAT_FIELDS[cell.rat];
  const parts = [name, band === undefined ? texts.unknownBand : (getBandLabel(band, texts.language) ?? band.name)];
  const mark = band === undefined ? null : getBandMark(band);
  const cellId = cellIdField === null ? null : getCellNumber(cell, cellIdField);
  const sectorLabel = findSectorLabel(sectors, cell.sectorKey);

  if (mark !== null) parts.push(mark);
  if (cellIdField !== null && cellId !== null) parts.push(`${CELL_NUMBER_LABELS[cellIdField]} ${cellId}`);
  if (sectorLabel !== null) parts.push(sectorLabel);
  return parts.join(" ");
}

export function RowActionButton({ label, icon, className, isDisabled, isNavigable = true, onClick }: RowActionButtonProps) {
  const navigationProps = isNavigable ? CELL_CONTROL_PROPS : undefined;

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        onClick={onClick}
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={isDisabled}
            className={cn("cursor-pointer text-muted-foreground", className)}
            {...navigationProps}
          />
        }
      >
        <HugeiconsIcon icon={icon} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function RowActions({ cellKey, texts, isDeleted, canEdit, dispatch }: RowActionsProps) {
  if (!canEdit) return <div className={ACTIONS_CLASS} />;

  return (
    <div className={ACTIONS_CLASS}>
      {isDeleted ? null : (
        <RowActionButton label={texts.duplicate} icon={Copy01Icon} onClick={() => dispatch({ type: "duplicateCell", key: cellKey })} />
      )}
      {isDeleted ? (
        <RowActionButton
          label={texts.restore}
          icon={Undo02Icon}
          className="text-foreground"
          onClick={() => dispatch({ type: "restoreCell", key: cellKey })}
        />
      ) : (
        <RowActionButton
          label={texts.remove}
          icon={Delete02Icon}
          className={DELETE_BUTTON_CLASS}
          onClick={() => dispatch({ type: "removeCell", key: cellKey })}
        />
      )}
    </div>
  );
}

function CellRowInner({
  cell,
  state,
  errors,
  dispatch,
  columns,
  band,
  bands,
  sectors,
  texts,
  editKind,
  canEdit,
  canConfirm,
  onSectorAdded,
}: CellRowProps) {
  const { isLocked, isTickLocked, hasError, getClass, getMarks } = getCellFieldView(cell, state, errors, { editKind, canEdit, canConfirm });

  function renderField(column: CellColumn) {
    if (column.kind === "band") {
      return (
        <FieldCell key={column.id} field={column.id} marks={getMarks("bandId")}>
          <BandField
            cellKey={cell.key}
            bandId={cell.bandId}
            band={band}
            bands={bands}
            isNewRow={cell.id === null}
            texts={texts}
            className={getClass("bandId")}
            isInvalid={hasError("bandId")}
            isLocked={isLocked}
            dispatch={dispatch}
          />
        </FieldCell>
      );
    }
    if (column.kind === "sector") {
      return (
        <FieldCell key={column.id} field={column.id} marks={getMarks("sectorKey")}>
          <SectorField
            cellKey={cell.key}
            sectorKey={cell.sectorKey}
            sectors={sectors}
            texts={texts}
            className={getClass("sectorKey")}
            isInvalid={hasError("sectorKey")}
            isLocked={isLocked}
            dispatch={dispatch}
            onSectorAdded={onSectorAdded}
          />
        </FieldCell>
      );
    }
    if (column.kind === "mode") {
      return (
        <FieldCell key={column.id} field={column.id} marks={getMarks("mode")}>
          <ModeField
            cellKey={cell.key}
            mode={cell.mode}
            texts={texts}
            className={getClass("mode")}
            isInvalid={hasError("mode")}
            isLocked={isLocked}
            dispatch={dispatch}
          />
        </FieldCell>
      );
    }
    if (column.kind === "gnbidLength") {
      const isUnused = cell.mode !== "sa";
      return (
        <FieldCell key={column.id} field={column.id} marks={getMarks("gnbidLength")} title={isUnused ? texts.standaloneOnly : undefined}>
          <GnbidLengthField
            cellKey={cell.key}
            length={cell.gnbidLength}
            texts={texts}
            className={cn(getClass("gnbidLength"), isUnused && UNUSED_FIELD_CLASS)}
            isInvalid={hasError("gnbidLength")}
            isLocked={isLocked || isUnused}
            dispatch={dispatch}
          />
        </FieldCell>
      );
    }
    if (column.kind === "number") {
      const { field, label } = column.spec;
      const isUnused = !isFieldInUse(cell, column.spec);
      return (
        <FieldCell key={column.id} field={column.id} marks={getMarks(field)} title={isUnused ? texts.standaloneOnly : undefined}>
          <NumberField
            cellKey={cell.key}
            field={field}
            label={label}
            value={getCellNumber(cell, field)}
            className={cn(getClass(field), isUnused && UNUSED_FIELD_CLASS)}
            isInvalid={hasError(field)}
            isLocked={isLocked || isUnused}
            dispatch={dispatch}
          />
        </FieldCell>
      );
    }
    if (column.kind === "computed") return <ComputedValue key={column.id} value={computeCellId(cell)} isDeleted={cell.isDeleted} />;
    if (column.kind === "flag") {
      const { field, label } = column.spec;
      const isStandaloneOnly = !isFieldInUse(cell, column.spec);
      const isUnused = isStandaloneOnly || (field === "isEGsm" && isEGsmBlocked(band));
      return (
        <FieldCell key={column.id} field={column.id} title={isStandaloneOnly ? texts.standaloneOnly : undefined}>
          <CheckField
            label={label}
            isChecked={!isUnused && getCellFlag(cell, field)}
            isLocked={isLocked || isUnused}
            onCheckedChange={(isOn) => dispatch({ type: "setCell", key: cell.key, patch: toFlagPatch(field, isOn) })}
          />
        </FieldCell>
      );
    }
    if (column.kind === "cellType") {
      return (
        <FieldCell key={column.id} field={column.id} marks={getMarks("cellType")}>
          <TypeField
            cellKey={cell.key}
            cellType={cell.cellType}
            texts={texts}
            className={cn(getClass("cellType"), cell.cellType === "macro" && "text-muted-foreground")}
            isLocked={isLocked}
            dispatch={dispatch}
          />
        </FieldCell>
      );
    }
    return (
      <FieldCell key={column.id} field={column.id}>
        <CheckField
          label={texts.confirmed}
          isChecked={cell.isConfirmed}
          isLocked={isTickLocked}
          onCheckedChange={(isOn) => dispatch({ type: "setCell", key: cell.key, patch: { isConfirmed: isOn } })}
        />
      </FieldCell>
    );
  }

  return (
    <div
      role="group"
      aria-label={getCellLabel(cell, band, sectors, texts)}
      {...cellRowProps(cell.key, state.kind)}
      className={cn(ROW_CLASS, getCellRowClass(cell, state.kind))}
    >
      {columns.map(renderField)}
      <div className="@container/tail flex min-w-0 items-start gap-1.5">
        <CellNote
          cellKey={cell.key}
          note={cell.notes}
          marks={getMarks("notes")}
          texts={texts}
          className={getClass("notes")}
          isLocked={isLocked}
          dispatch={dispatch}
        />
        <RowActions cellKey={cell.key} texts={texts} isDeleted={cell.isDeleted} canEdit={canEdit} dispatch={dispatch} />
      </div>
      <CellErrors
        cell={cell}
        errors={errors}
        texts={texts}
        isLocked={isLocked}
        dispatch={dispatch}
        className="col-span-full pt-0.5 pb-[3px] pl-0.5"
      />
    </div>
  );
}

export const CellRow = memo(CellRowInner);
