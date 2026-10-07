import { ArrowLeft01Icon, ArrowRight01Icon, Copy01Icon, Delete02Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import type { StationDraftApi } from "../../hooks/useStationDraft";
import { findCell, getCellRowState } from "../../model/changes";
import { toFlagPatch } from "../../model/draftReducer";
import { CELL_NUMBER_LABELS, RAT_FIELDS, computeCellId, getCellFlag, getCellNumber, isFieldInUse } from "../../model/ratFields";
import { newDraftKey } from "../../model/snapshots";
import type { CellDraft, DraftKey, FieldMark } from "../../model/types";
import { NO_EDIT_ERRORS } from "../../model/validate";
import { FieldMarks } from "../frame/wasLine";
import { CellErrors } from "./cellErrors";
import {
  BandField,
  EMPTY_TEXT,
  GnbidLengthField,
  ModeField,
  NumberField,
  SectorField,
  TypeField,
  UNUSED_FIELD_CLASS,
  getCellFieldView,
  isEGsmBlocked,
} from "./cellFields";
import type { CellColumn } from "./cellGrid";
import { type CellErrorIndex, canEditCells, listSheetColumns } from "./cellRules";
import type { CellTexts } from "./cellTexts";
import { IconAction } from "./ratCardHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { GenerationTag } from "@/features/shared/RatGenerationLabel";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

type CellSheetProps = {
  edit: StationDraftApi;
  cellKey: DraftKey | null;
  isOpen: boolean;
  errorsByKey: CellErrorIndex;
  texts: CellTexts;
  canConfirm: boolean;
  onOpenCell: (cellKey: DraftKey) => void;
  onClose: () => void;
};

type SheetBodyProps = Omit<CellSheetProps, "cellKey" | "isOpen"> & {
  cell: CellDraft;
};

type SheetFieldProps = {
  label: string;
  marks?: readonly FieldMark[];
  className?: string;
  children: ReactNode;
};

type SheetSwitchProps = {
  label: string;
  isChecked: boolean;
  isLocked: boolean;
  onCheckedChange: (isChecked: boolean) => void;
};

const INPUT_CLASS = "h-9 rounded-lg px-2.5 text-base leading-6 md:text-base";
const TRIGGER_CLASS = "rounded-lg pr-2 pl-2.5 text-sm data-[size=default]:h-9 data-[size=sm]:h-9 data-[size=sm]:rounded-lg [&>svg]:size-4";
const COMPUTED_CLASS = "flex h-9 items-center overflow-hidden rounded-lg border border-dashed px-2.5 font-mono text-sm text-muted-foreground";
const WIDE_CLASS = "col-span-2";
const REMOVE_BUTTON_CLASS = "text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15";

function SheetField({ label, marks, className, children }: SheetFieldProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <span className="mb-1 block truncate text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {marks === undefined || marks.length === 0 ? null : <FieldMarks marks={marks} variant="line" />}
    </div>
  );
}

function SheetSwitch({ label, isChecked, isLocked, onCheckedChange }: SheetSwitchProps) {
  const labelId = useId();

  return (
    <div className="flex h-9 min-w-0 items-center gap-2.5">
      <span id={labelId} className="min-w-0 flex-1 truncate text-sm font-medium">
        {label}
      </span>
      <Switch aria-labelledby={labelId} checked={isChecked} onCheckedChange={onCheckedChange} disabled={isLocked} className="cursor-pointer" />
    </div>
  );
}

function SheetBody({ edit, cell, errorsByKey, texts, canConfirm, onOpenCell, onClose }: SheetBodyProps) {
  const { t } = useTranslation();
  const { session, lookups, context, dispatch } = edit;
  const { draft } = session;
  const spec = RAT_FIELDS[cell.rat];
  const canEdit = canEditCells(edit);
  const state = getCellRowState(session, context, cell);
  const errors = errorsByKey.get(cell.key) ?? NO_EDIT_ERRORS;
  const { isLocked, isTickLocked, hasError, getClass, getMarks } = getCellFieldView(cell, state, errors, {
    editKind: session.kind,
    canEdit,
    canConfirm,
  });
  const band = cell.bandId === null ? undefined : lookups.bandsById.get(cell.bandId);
  const siblings = draft.cells.filter((candidate) => candidate.rat === cell.rat);
  const index = siblings.findIndex((candidate) => candidate.key === cell.key);
  const previousCell = index === -1 ? undefined : siblings[index - 1];
  const nextCell = index === -1 ? undefined : siblings[index + 1];
  const columns = listSheetColumns(edit, cell);
  const fieldColumns = columns.filter((column) => column.kind === "mode" || column.kind === "number" || column.kind === "gnbidLength");
  const hasOddFields = fieldColumns.length % 2 === 1;
  const hasComputedId = columns.some((column) => column.kind === "computed");
  const lastFieldId = hasOddFields && !hasComputedId ? fieldColumns.at(-1)?.id : undefined;

  function duplicateCell() {
    const newKey = newDraftKey();
    dispatch({ type: "duplicateCell", key: cell.key, newKey });
    onOpenCell(newKey);
  }

  function removeCell() {
    dispatch({ type: "removeCell", key: cell.key });
    if (cell.id === null) onClose();
  }

  function restoreCell() {
    dispatch({ type: "restoreCell", key: cell.key });
  }

  function openSibling(sibling: CellDraft | undefined) {
    if (sibling !== undefined) onOpenCell(sibling.key);
  }

  function renderColumn(column: CellColumn) {
    const wideClass = column.id === lastFieldId ? WIDE_CLASS : undefined;

    if (column.kind === "mode") {
      return (
        <SheetField key={column.id} label={texts.mode} marks={getMarks("mode")} className={wideClass}>
          <ModeField
            cellKey={cell.key}
            mode={cell.mode}
            texts={texts}
            className={cn(TRIGGER_CLASS, getClass("mode"))}
            isInvalid={hasError("mode")}
            isLocked={isLocked}
            dispatch={dispatch}
          />
        </SheetField>
      );
    }
    if (column.kind === "gnbidLength") {
      const isUnused = cell.mode !== "sa";
      return (
        <SheetField key={column.id} label={texts.gnbidLength} marks={getMarks("gnbidLength")} className={wideClass}>
          <GnbidLengthField
            cellKey={cell.key}
            length={cell.gnbidLength}
            texts={texts}
            className={cn(TRIGGER_CLASS, getClass("gnbidLength"), isUnused && UNUSED_FIELD_CLASS)}
            isInvalid={hasError("gnbidLength")}
            isLocked={isLocked || isUnused}
            dispatch={dispatch}
          />
        </SheetField>
      );
    }
    if (column.kind === "number") {
      const { field, label } = column.spec;
      const isUnused = !isFieldInUse(cell, column.spec);
      return (
        <SheetField key={column.id} label={label} marks={getMarks(field)} className={wideClass}>
          <NumberField
            cellKey={cell.key}
            field={field}
            label={label}
            value={getCellNumber(cell, field)}
            className={cn(INPUT_CLASS, getClass(field), isUnused && UNUSED_FIELD_CLASS)}
            isInvalid={hasError(field)}
            isLocked={isLocked || isUnused}
            dispatch={dispatch}
          />
        </SheetField>
      );
    }
    if (column.kind === "flag") {
      const { field, label } = column.spec;
      const isUnused = !isFieldInUse(cell, column.spec) || (field === "isEGsm" && isEGsmBlocked(band));
      return (
        <SheetSwitch
          key={column.id}
          label={label}
          isChecked={!isUnused && getCellFlag(cell, field)}
          isLocked={isLocked || isUnused}
          onCheckedChange={(isOn) => dispatch({ type: "setCell", key: cell.key, patch: toFlagPatch(field, isOn) })}
        />
      );
    }
    if (column.kind !== "confirmed") return null;

    return (
      <SheetSwitch
        key={column.id}
        label={texts.confirmed}
        isChecked={cell.isConfirmed}
        isLocked={isTickLocked}
        onCheckedChange={(isOn) => dispatch({ type: "setCell", key: cell.key, patch: { isConfirmed: isOn } })}
      />
    );
  }

  return (
    <>
      <div className="flex min-h-13 shrink-0 items-center gap-2 border-b py-2 pr-12 pl-4">
        <GenerationTag>{spec.generation}</GenerationTag>
        <SheetTitle className="min-w-0 flex-1 truncate text-[15px] font-semibold">
          {t("stations:edit.cells.sheet.title", { rat: spec.name, position: Math.max(index + 1, 1), total: Math.max(siblings.length, 1) })}
        </SheetTitle>
      </div>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3.5 pb-4">
        <CellErrors cell={cell} errors={errors} texts={texts} isLocked={isLocked} dispatch={dispatch} className="mb-3" />
        <div className="grid grid-cols-2 gap-3">
          <SheetField label={texts.band} marks={getMarks("bandId")}>
            <BandField
              cellKey={cell.key}
              bandId={cell.bandId}
              band={band}
              bands={lookups.planBands[cell.rat]}
              isNewRow={cell.id === null}
              texts={texts}
              className={cn(TRIGGER_CLASS, getClass("bandId"))}
              isInvalid={hasError("bandId")}
              isLocked={isLocked}
              dispatch={dispatch}
            />
          </SheetField>
          <SheetField label={texts.sector} marks={getMarks("sectorKey")}>
            <SectorField
              cellKey={cell.key}
              sectorKey={cell.sectorKey}
              sectors={draft.sectors}
              texts={texts}
              className={cn(TRIGGER_CLASS, getClass("sectorKey"))}
              isInvalid={hasError("sectorKey")}
              isLocked={isLocked}
              dispatch={dispatch}
            />
          </SheetField>
          {fieldColumns.map(renderColumn)}
          {spec.computedId !== null && hasComputedId && spec.nodeField !== null && spec.cellIdField !== null ? (
            <SheetField
              label={t("stations:edit.cells.sheet.computed", {
                name: spec.computedId.label,
                node: CELL_NUMBER_LABELS[spec.nodeField],
                cell: CELL_NUMBER_LABELS[spec.cellIdField],
              })}
              className={hasOddFields ? undefined : WIDE_CLASS}
            >
              <div className={COMPUTED_CLASS}>{computeCellId(cell) ?? EMPTY_TEXT}</div>
            </SheetField>
          ) : null}
          <SheetField label={t("stations:edit.cells.columns.cellType")} marks={getMarks("cellType")}>
            <TypeField
              cellKey={cell.key}
              cellType={cell.cellType}
              texts={texts}
              className={cn(TRIGGER_CLASS, getClass("cellType"))}
              isLocked={isLocked}
              dispatch={dispatch}
            />
          </SheetField>
          <SheetField label={texts.note} marks={getMarks("notes")}>
            <Input
              type="text"
              {...NO_AUTOFILL_PROPS}
              aria-label={texts.note}
              value={cell.notes}
              onChange={(event) => dispatch({ type: "setCell", key: cell.key, patch: { notes: event.target.value } })}
              placeholder={t("common:placeholder.optional")}
              disabled={isLocked}
              className={cn(INPUT_CLASS, getClass("notes"))}
            />
          </SheetField>
          {columns.filter((column) => column.kind === "flag" || column.kind === "confirmed").map(renderColumn)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t px-4 pt-3 pb-5">
        {canEdit ? (
          <Button
            type="button"
            variant="ghost"
            onClick={cell.isDeleted ? restoreCell : removeCell}
            className={cn("cursor-pointer", cell.isDeleted ? null : REMOVE_BUTTON_CLASS)}
          >
            <HugeiconsIcon icon={cell.isDeleted ? Undo02Icon : Delete02Icon} aria-hidden="true" />
            {cell.isDeleted ? texts.restore : texts.remove}
          </Button>
        ) : null}
        {canEdit && !cell.isDeleted ? <IconAction label={texts.duplicate} icon={Copy01Icon} onClick={duplicateCell} /> : null}
        <span className="flex-1" />
        <IconAction
          label={t("stations:edit.cells.sheet.previous")}
          icon={ArrowLeft01Icon}
          variant="outline"
          isDisabled={previousCell === undefined}
          onClick={() => openSibling(previousCell)}
        />
        <IconAction
          label={t("stations:edit.cells.sheet.next")}
          icon={ArrowRight01Icon}
          variant="outline"
          isDisabled={nextCell === undefined}
          onClick={() => openSibling(nextCell)}
        />
        <Button type="button" onClick={onClose} className="cursor-pointer">
          {t("common:actions.done")}
        </Button>
      </div>
    </>
  );
}

export function CellSheet({ edit, cellKey, isOpen, errorsByKey, texts, canConfirm, onOpenCell, onClose }: CellSheetProps) {
  const [shownCell, setShownCell] = useState<CellDraft | null>(null);
  const liveCell = cellKey === null ? undefined : findCell(edit.session.draft, cellKey);
  if (liveCell !== undefined && liveCell !== shownCell) setShownCell(liveCell);

  function changeOpen(open: boolean) {
    if (!open) onClose();
  }

  return (
    <Sheet open={isOpen && liveCell !== undefined} onOpenChange={changeOpen}>
      <SheetContent side="bottom" className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0">
        {shownCell === null ? null : (
          <SheetBody
            edit={edit}
            cell={shownCell}
            errorsByKey={errorsByKey}
            texts={texts}
            canConfirm={canConfirm}
            onOpenCell={onOpenCell}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
