import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Band, CellType, NrMode } from "@openbts/shared/contract";
import type { ReactNode } from "react";

import { CELL_CONTROL_PROPS, cellFieldProps } from "../../hooks/useCellNavigation";
import { useEditText } from "../../hooks/useStationDraft";
import { TEXT_SEPARATOR, UNCHANGED_FIELD, parseDigits } from "../../model/changes";
import { type CellPatch, type DraftDispatch, toNumberPatch } from "../../model/draftReducer";
import { MAX_SECTORS, OMNIDIRECTIONAL_DEGREES } from "../../model/ratFields";
import { newDraftKey } from "../../model/snapshots";
import type {
  CellDraft,
  CellField,
  CellNumberField,
  CellRowState,
  DraftKey,
  EditError,
  EditKind,
  FieldMark,
  FieldState,
  SectorDraft,
} from "../../model/types";
import { getFieldClass, getFieldLook } from "../frame/fieldLook";
import { FieldMarks } from "../frame/wasLine";
import type { CellTexts } from "./cellTexts";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RAILWAY_GSM_LABEL } from "@/features/admin/reference/utils/bands";
import { CellTypeSelect } from "@/features/shared/CellTypeSelect";
import { getBandCode, getBandDuplexMark, getBandLabel } from "@/features/station-details/station/utils/bands";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";
import type { CellType as LegacyCellType } from "@/types/station";

type ControlView = {
  showsCorrections: boolean;
  isInvalid: boolean;
  isDeleted: boolean;
};

type CellAccess = {
  editKind: EditKind;
  canEdit: boolean;
  canConfirm: boolean;
};

type CellFieldView = {
  isLocked: boolean;
  isTickLocked: boolean;
  hasError: (field: CellField) => boolean;
  getClass: (field: CellField) => string;
  getMarks: (field: CellField) => readonly FieldMark[] | undefined;
};

type FieldCellProps = {
  field: string;
  marks?: readonly FieldMark[];
  title?: string;
  className?: string;
  marksClassName?: string;
  children: ReactNode;
};

type ControlProps = {
  className: string;
  isInvalid: boolean;
  isLocked: boolean;
};

type BandFieldProps = ControlProps & {
  cellKey: DraftKey;
  bandId: number | null;
  band: Band | undefined;
  bands: readonly Band[];
  isNewRow: boolean;
  texts: CellTexts;
  dispatch: DraftDispatch;
};

type BandValueProps = Pick<BandFieldProps, "bandId" | "band" | "isNewRow" | "texts">;

type BandItemsProps = {
  bands: readonly Band[];
  band: Band | undefined;
  language: string;
};

type SectorFieldProps = ControlProps & {
  cellKey: DraftKey;
  sectorKey: DraftKey | null;
  sectors: readonly SectorDraft[];
  texts: CellTexts;
  dispatch: DraftDispatch;
  onSectorAdded?: (sectorKey: DraftKey) => void;
};

type SectorItemsProps = Pick<SectorFieldProps, "sectors" | "texts">;

type ModeFieldProps = ControlProps & {
  cellKey: DraftKey;
  mode: NrMode | null;
  texts: CellTexts;
  dispatch: DraftDispatch;
};

type NumberFieldProps = ControlProps & {
  cellKey: DraftKey;
  field: CellNumberField;
  label: string;
  value: number | null;
  dispatch: DraftDispatch;
};

type CheckFieldProps = {
  label: string;
  isChecked: boolean;
  isLocked: boolean;
  onCheckedChange: (isChecked: boolean) => void;
};

type ComputedValueProps = {
  value: number | null;
  isDeleted: boolean;
};

type TypeFieldProps = {
  cellKey: DraftKey;
  cellType: CellType | null;
  texts: CellTexts;
  className: string;
  isLocked: boolean;
  dispatch: DraftDispatch;
};

type ErrorLineProps = {
  errors: readonly EditError[];
  className?: string;
};

export const EMPTY_TEXT = "-";

const NO_SECTOR_VALUE = "-";
const NEW_SECTOR_VALUE = "+";
const BAND_WITHOUT_E_GSM_MHZ = 1800;
const NR_MODES: readonly NrMode[] = ["nsa", "sa"];
const NR_MODE_NAMES: Record<NrMode, string> = { nsa: "NSA (Non-Standalone)", sa: "SA (Standalone)" };
const LEGACY_CELL_TYPES: Record<CellType, LegacyCellType> = { macro: "MACROCELL", micro: "MICROCELL", pico: "PICOCELL", femto: "FEMTOCELL" };
const CELL_TYPES_BY_LEGACY: Record<LegacyCellType, CellType> = { MACROCELL: "macro", MICROCELL: "micro", PICOCELL: "pico", FEMTOCELL: "femto" };

export const LOCKED_CLASS = cn(
  "disabled:cursor-default disabled:bg-transparent disabled:opacity-100 dark:disabled:bg-transparent",
  "data-disabled:cursor-default data-disabled:opacity-100",
);
export const DELETED_CLASS = "text-muted-foreground line-through";
const TRIGGER_CLASS = "w-full min-w-0 cursor-pointer gap-1 pr-1 pl-2 text-[13px] [&>svg]:size-3";
const CHECK_CLASS = "cursor-pointer after:-inset-x-1 after:-inset-y-1.5";
const COMPUTED_CLASS = "flex h-7 items-center overflow-hidden px-0.5 font-mono text-[13px] leading-[18px] whitespace-nowrap text-muted-foreground";

export const ROW_INPUT_CLASS = "h-7 rounded-md px-[7px] text-[13px] leading-[18px] md:text-[13px]";
export const NUMBER_INPUT_CLASS = cn(ROW_INPUT_CLASS, "font-mono");
export const MOST_DIGITS = 10;
export const UNUSED_FIELD_CLASS = "border-dashed";

export function getControlClass(fieldState: FieldState | undefined, view: ControlView): string {
  const look = getFieldLook(fieldState ?? UNCHANGED_FIELD, view.showsCorrections);
  return cn(getFieldClass(look, view.isInvalid, true), LOCKED_CLASS, view.isDeleted && DELETED_CLASS);
}

export function getCellFieldView(cell: CellDraft, state: CellRowState, errors: readonly EditError[], access: CellAccess): CellFieldView {
  const isReview = access.editKind === "review";
  const isLocked = !access.canEdit || cell.isDeleted;
  const isTickLocked = isLocked || !access.canConfirm || (isReview && cell.id !== null);

  function hasError(field: CellField): boolean {
    return errors.some((error) => error.target.field === field);
  }

  function getClass(field: CellField): string {
    return getControlClass(state.fields[field], { showsCorrections: isReview, isInvalid: hasError(field), isDeleted: cell.isDeleted });
  }

  function getMarks(field: CellField): readonly FieldMark[] | undefined {
    return isReview ? state.fields[field]?.marks : undefined;
  }

  return { isLocked, isTickLocked, hasError, getClass, getMarks };
}

function getSectorLabel(sector: SectorDraft, index: number): string {
  return sector.degrees === null ? `A${index + 1}` : `${sector.degrees}°`;
}

export function findSectorLabel(sectors: readonly SectorDraft[], sectorKey: DraftKey | null): string | null {
  const index = sectorKey === null ? -1 : sectors.findIndex((sector) => sector.key === sectorKey);
  const sector = sectors[index];
  return sector === undefined ? null : getSectorLabel(sector, index);
}

export function getBandMark(band: Band): string | null {
  return getBandCode(band) ?? (band.rat === "umts" ? band.code : null);
}

export function isEGsmBlocked(band: Band | undefined): boolean {
  return band !== undefined && band.rat === "gsm" && band.labelMhz === BAND_WITHOUT_E_GSM_MHZ;
}

function toBandPatch(band: Band): CellPatch {
  return isEGsmBlocked(band) ? { bandId: band.id, flags: { isEGsm: false } } : { bandId: band.id };
}

function describeBandOption(band: Band, isLabelShared: boolean): string {
  const marks: string[] = [];
  const mark = getBandMark(band);
  const duplex = getBandDuplexMark(band);

  if (mark !== null) marks.push(mark);
  if (band.variant === "railway") marks.push(RAILWAY_GSM_LABEL);
  if (isLabelShared && duplex !== null) marks.push(duplex);
  return marks.join(TEXT_SEPARATOR);
}

export function ErrorLine({ errors, className }: ErrorLineProps) {
  const text = useEditText();
  const messages = [...new Set(errors.map((error) => text.formatError(error)))];

  return (
    <div role="alert" className={cn("flex items-start gap-1.5 text-xs leading-4 text-destructive", className)}>
      <HugeiconsIcon icon={AlertCircleIcon} aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span className="min-w-0">{messages.join(TEXT_SEPARATOR)}</span>
    </div>
  );
}

export function FieldCell({ field, marks, title, className, marksClassName, children }: FieldCellProps) {
  return (
    <div {...cellFieldProps(field)} title={title} className={cn("min-w-0", className)}>
      {children}
      {marks === undefined || marks.length === 0 ? null : <FieldMarks marks={marks} variant="struck" className={marksClassName} />}
    </div>
  );
}

function BandValue({ bandId, band, isNewRow, texts }: BandValueProps) {
  if (band === undefined) {
    const placeholder = isNewRow ? texts.selectBand : texts.unknownBand;
    return <span className="truncate text-muted-foreground">{bandId === null ? placeholder : EMPTY_TEXT}</span>;
  }

  const mark = getBandMark(band);
  return (
    <>
      <span className="font-semibold">{getBandLabel(band, texts.language)}</span>
      {mark === null ? null : <span className="text-xs text-muted-foreground">{mark}</span>}
    </>
  );
}

function BandItems({ bands, band, language }: BandItemsProps) {
  const options = band === undefined || bands.includes(band) ? bands : [...bands, band];
  const entries = options.map((option) => ({ option, label: getBandLabel(option, language) ?? option.name }));
  const labelCounts = new Map<string, number>();
  for (const { label } of entries) labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);

  return (
    <>
      {entries.map(({ option, label }) => {
        const marks = describeBandOption(option, (labelCounts.get(label) ?? 0) > 1);
        return (
          <SelectItem key={option.id} value={String(option.id)}>
            <span className="font-semibold">{label}</span>
            {marks === "" ? null : <span className="text-muted-foreground">{marks}</span>}
          </SelectItem>
        );
      })}
    </>
  );
}

export function BandField({ cellKey, bandId, band, bands, isNewRow, texts, className, isInvalid, isLocked, dispatch }: BandFieldProps) {
  function changeBand(value: string | null) {
    const nextBand = bands.find((option) => String(option.id) === value);
    if (nextBand !== undefined) dispatch({ type: "setCell", key: cellKey, patch: toBandPatch(nextBand) });
  }

  return (
    <Select value={bandId === null ? null : String(bandId)} onValueChange={changeBand} disabled={isLocked}>
      <SelectTrigger
        size="sm"
        aria-label={texts.band}
        aria-invalid={isInvalid ? true : undefined}
        className={cn(TRIGGER_CLASS, className)}
        {...CELL_CONTROL_PROPS}
      >
        <SelectValue className="min-w-0">
          <BandValue bandId={bandId} band={band} isNewRow={isNewRow} texts={texts} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <BandItems bands={bands} band={band} language={texts.language} />
      </SelectContent>
    </Select>
  );
}

function SectorItems({ sectors, texts }: SectorItemsProps) {
  return (
    <>
      <SelectItem value={NO_SECTOR_VALUE}>{EMPTY_TEXT}</SelectItem>
      {sectors.map((sector, index) => (
        <SelectItem key={sector.key} value={sector.key}>
          {getSectorLabel(sector, index)}
          {sector.degrees === OMNIDIRECTIONAL_DEGREES ? <span className="text-muted-foreground">{texts.omnidirectional}</span> : null}
        </SelectItem>
      ))}
      <SelectItem value={NEW_SECTOR_VALUE} disabled={sectors.length >= MAX_SECTORS} className="text-muted-foreground">
        {texts.newSector}
      </SelectItem>
    </>
  );
}

export function SectorField({ cellKey, sectorKey, sectors, texts, className, isInvalid, isLocked, dispatch, onSectorAdded }: SectorFieldProps) {
  const label = findSectorLabel(sectors, sectorKey);

  function changeSector(value: string | null) {
    if (value !== NEW_SECTOR_VALUE) {
      const nextKey = value === null || value === NO_SECTOR_VALUE ? null : value;
      dispatch({ type: "setCell", key: cellKey, patch: { sectorKey: nextKey } });
      return;
    }

    const newKey = newDraftKey();
    dispatch({ type: "addSector", newKey });
    dispatch({ type: "setCell", key: cellKey, patch: { sectorKey: newKey } });
    onSectorAdded?.(newKey);
  }

  return (
    <Select value={label === null ? NO_SECTOR_VALUE : sectorKey} onValueChange={changeSector} disabled={isLocked}>
      <SelectTrigger
        size="sm"
        aria-label={texts.sector}
        aria-invalid={isInvalid ? true : undefined}
        className={cn(TRIGGER_CLASS, className)}
        {...CELL_CONTROL_PROPS}
      >
        <SelectValue className={cn("min-w-0", label === null && "text-muted-foreground")}>{label ?? EMPTY_TEXT}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SectorItems sectors={sectors} texts={texts} />
      </SelectContent>
    </Select>
  );
}

export function ModeField({ cellKey, mode, texts, className, isInvalid, isLocked, dispatch }: ModeFieldProps) {
  function changeMode(value: string | null) {
    const nextMode = NR_MODES.find((option) => option === value);
    if (nextMode !== undefined) dispatch({ type: "setCell", key: cellKey, patch: { mode: nextMode } });
  }

  return (
    <Select value={mode} onValueChange={changeMode} disabled={isLocked}>
      <SelectTrigger
        size="sm"
        aria-label={texts.mode}
        aria-invalid={isInvalid ? true : undefined}
        className={cn(TRIGGER_CLASS, className)}
        {...CELL_CONTROL_PROPS}
      >
        <SelectValue className="min-w-0">{mode === null ? EMPTY_TEXT : mode.toUpperCase()}</SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-48">
        {NR_MODES.map((option) => (
          <SelectItem key={option} value={option}>
            {NR_MODE_NAMES[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function NumberField({ cellKey, field, label, value, className, isInvalid, isLocked, dispatch }: NumberFieldProps) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      {...NO_AUTOFILL_PROPS}
      {...CELL_CONTROL_PROPS}
      aria-label={label}
      aria-invalid={isInvalid ? true : undefined}
      maxLength={MOST_DIGITS}
      value={value === null ? "" : String(value)}
      onChange={(event) => dispatch({ type: "setCell", key: cellKey, patch: toNumberPatch(field, parseDigits(event.target.value)) })}
      disabled={isLocked}
      className={cn(NUMBER_INPUT_CLASS, className)}
    />
  );
}

export function ComputedValue({ value, isDeleted }: ComputedValueProps) {
  return <div className={cn(COMPUTED_CLASS, isDeleted && "line-through")}>{value ?? EMPTY_TEXT}</div>;
}

export function CheckField({ label, isChecked, isLocked, onCheckedChange }: CheckFieldProps) {
  return (
    <div className="flex h-7 items-center justify-center">
      <Checkbox
        aria-label={label}
        checked={isChecked}
        onCheckedChange={(checked) => onCheckedChange(checked === true)}
        disabled={isLocked}
        className={CHECK_CLASS}
        {...CELL_CONTROL_PROPS}
      />
    </div>
  );
}

export function TypeField({ cellKey, cellType, texts, className, isLocked, dispatch }: TypeFieldProps) {
  function changeType(legacyType: LegacyCellType | null) {
    dispatch({ type: "setCell", key: cellKey, patch: { cellType: legacyType === null ? null : CELL_TYPES_BY_LEGACY[legacyType] } });
  }

  return (
    <CellTypeSelect
      value={cellType === null ? null : LEGACY_CELL_TYPES[cellType]}
      onChange={changeType}
      disabled={isLocked}
      ariaLabel={texts.cellType}
      className={cn("data-[size=default]:h-7 rounded-md", TRIGGER_CLASS, className)}
    />
  );
}
