import { Add01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Band } from "@openbts/shared/contract";
import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { cellRowProps } from "../../hooks/useCellNavigation";
import type { StationDraftApi } from "../../hooks/useStationDraft";
import { TEXT_SEPARATOR, findCell } from "../../model/changes";
import { CELL_NUMBER_LABELS, RAT_FIELDS, getCellFlag, getCellNumber } from "../../model/ratFields";
import { newDraftKey } from "../../model/snapshots";
import type { CellDraft, CellNumberField, DraftKey, EditError, Rat, RowKind, SectorDraft } from "../../model/types";
import { useNewReveal } from "../frame/editPage";
import { editTargetProps } from "../frame/editTargets";
import { AreaCodeField } from "./areaCodeField";
import { EMPTY_TEXT, ErrorLine, findSectorLabel, getBandMark } from "./cellFields";
import type { CellColumn } from "./cellGrid";
import { getCellRowClass } from "./cellRow";
import {
  type CellErrorIndex,
  canEditCells,
  getFirstBandId,
  isUnchangedRow,
  isUnchangedTarget,
  listCardErrors,
  listRatColumns,
  listRatTools,
  listRowViews,
} from "./cellRules";
import { CellSheet } from "./cellSheet";
import type { CellTexts } from "./cellTexts";
import { IconAction } from "./ratCardHeader";
import { ToolsMenu } from "./toolsMenu";
import { UnchangedToggle } from "./unchangedToggle";
import { GenerationTag } from "@/features/shared/RatGenerationLabel";
import { getBandLabel } from "@/features/station-details/station/utils/bands";
import { cn } from "@/lib/utils";

type PhoneCellListProps = {
  edit: StationDraftApi;
  rats: readonly Rat[];
  errorsByKey: CellErrorIndex;
  texts: CellTexts;
  canConfirm: boolean;
  isNewCellConfirmed: boolean;
};

type PhoneRatSectionProps = Omit<PhoneCellListProps, "rats"> & {
  rat: Rat;
  onOpenCell: (cellKey: DraftKey) => void;
};

type PhoneCellRowProps = {
  cell: CellDraft;
  rowKind: RowKind;
  errors: readonly EditError[];
  band: Band | undefined;
  sectors: readonly SectorDraft[];
  columns: readonly CellColumn[];
  texts: CellTexts;
  onOpen: (cellKey: DraftKey) => void;
};

type SheetTarget = {
  cellKey: DraftKey;
  isOpen: boolean;
};

const HEADLINE_FIELDS: Record<Rat, CellNumberField> = { nr: "pci", lte: "pci", umts: "cid", gsm: "cid" };

function getBandText(cell: CellDraft, band: Band | undefined, texts: CellTexts): string {
  if (band !== undefined) return getBandLabel(band, texts.language) ?? band.name;
  return cell.bandId === null ? texts.unknownBand : EMPTY_TEXT;
}

function listCellDetails(cell: CellDraft, columns: readonly CellColumn[]): string[] {
  return columns.flatMap((column) => {
    if (column.kind === "mode") return cell.mode === null ? [] : [cell.mode.toUpperCase()];
    if (column.kind === "flag") return getCellFlag(cell, column.spec.field) ? [column.spec.label] : [];
    if (column.kind !== "number" || column.spec.field === HEADLINE_FIELDS[cell.rat]) return [];

    const value = getCellNumber(cell, column.spec.field);
    return value === null ? [] : [`${column.spec.label} ${value}`];
  });
}

function PhoneCellRowInner({ cell, rowKind, errors, band, sectors, columns, texts, onOpen }: PhoneCellRowProps) {
  const headlineField = HEADLINE_FIELDS[cell.rat];
  const headline = getCellNumber(cell, headlineField);
  const details = listCellDetails(cell, columns);
  const mark = band === undefined ? null : getBandMark(band);

  return (
    <div {...cellRowProps(cell.key)} className={cn("relative border-t border-border/60", getCellRowClass(cell, rowKind))}>
      <button
        type="button"
        onClick={() => onOpen(cell.key)}
        className="flex min-h-14 w-full cursor-pointer items-center gap-2 py-1.5 pr-1.5 pl-3.5 text-left outline-none focus-visible:bg-muted/50"
      >
        <span className={cn("min-w-0 flex-1", cell.isDeleted && "text-muted-foreground line-through")}>
          <span className="flex items-center gap-1.5 text-sm leading-5">
            <span className="font-semibold">{getBandText(cell, band, texts)}</span>
            {mark === null ? null : <span className="text-[12.5px] text-muted-foreground">{mark}</span>}
            <span aria-hidden="true" className="text-muted-foreground/40">
              ·
            </span>
            <span>{findSectorLabel(sectors, cell.sectorKey) ?? EMPTY_TEXT}</span>
            <span className="flex-1" />
            {headline === null ? null : (
              <span className="font-mono text-[13px]">
                {CELL_NUMBER_LABELS[headlineField]} {headline}
              </span>
            )}
          </span>
          <span className="block truncate font-mono text-xs leading-4 text-muted-foreground">
            {details.length === 0 ? EMPTY_TEXT : details.join(TEXT_SEPARATOR)}
          </span>
        </span>
        <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {errors.length === 0 ? null : <ErrorLine errors={errors} className="px-3.5 pb-1.5" />}
    </div>
  );
}

const PhoneCellRow = memo(PhoneCellRowInner);

function PhoneRatSection({ edit, rat, errorsByKey, texts, canConfirm, isNewCellConfirmed, onOpenCell }: PhoneRatSectionProps) {
  const { t } = useTranslation();
  const [showsUnchanged, setShowsUnchanged] = useState(false);
  const revealedTarget = useNewReveal();

  const { session, lookups, dispatch } = edit;
  const spec = RAT_FIELDS[rat];
  const canEdit = canEditCells(edit);
  const rows = listRowViews(edit, rat, errorsByKey);
  if (revealedTarget !== null && isUnchangedTarget(revealedTarget, rows)) setShowsUnchanged(true);

  const unchangedCount = session.kind === "review" ? rows.filter(isUnchangedRow).length : 0;
  const shownRows = unchangedCount > 0 && !showsUnchanged ? rows.filter((row) => !isUnchangedRow(row)) : rows;
  const columns = listRatColumns(edit, rat);
  const tools = listRatTools(edit, rat, canConfirm);
  const cardErrors = listCardErrors(edit.errors, rat);

  function addCell() {
    const newKey = newDraftKey();
    dispatch({ type: "addCell", rat, isConfirmed: isNewCellConfirmed, bandId: getFirstBandId(edit, rat), newKey });
    onOpenCell(newKey);
  }

  return (
    <section
      {...editTargetProps({ scope: "cell", rat })}
      aria-label={t("stations:edit.cells.cardLabel", { rat: spec.name })}
      className="border-t first:border-t-0"
    >
      <div className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 bg-muted/40 py-1 pr-1.5 pl-3">
        <GenerationTag>{spec.generation}</GenerationTag>
        <span className="text-sm font-semibold">{spec.name}</span>
        <span className="text-[12.5px] whitespace-nowrap text-muted-foreground">{t("common:labels.cells", { count: edit.counters[rat].total })}</span>
        <span className="flex-1" />
        <AreaCodeField edit={edit} rat={rat} />
        {tools.length > 0 ? <ToolsMenu edit={edit} rat={rat} tools={tools} isLabelled={false} /> : null}
        {canEdit ? <IconAction label={t("stations:cells.addCell")} icon={Add01Icon} size="icon-sm" onClick={addCell} /> : null}
      </div>
      {cardErrors.length > 0 ? <ErrorLine errors={cardErrors} className="border-t px-3.5 py-1.5" /> : null}
      {shownRows.map((row) => (
        <PhoneCellRow
          key={row.cell.key}
          cell={row.cell}
          rowKind={row.state.kind}
          errors={row.errors}
          band={row.cell.bandId === null ? undefined : lookups.bandsById.get(row.cell.bandId)}
          sectors={session.draft.sectors}
          columns={columns}
          texts={texts}
          onOpen={onOpenCell}
        />
      ))}
      {unchangedCount > 0 ? (
        <UnchangedToggle count={unchangedCount} isShown={showsUnchanged} onToggle={() => setShowsUnchanged((isShown) => !isShown)} />
      ) : null}
    </section>
  );
}

export function PhoneCellList({ edit, rats, errorsByKey, texts, canConfirm, isNewCellConfirmed }: PhoneCellListProps) {
  const [sheetTarget, setSheetTarget] = useState<SheetTarget | null>(null);
  const revealedTarget = useNewReveal();
  const openCell = useCallback((cellKey: DraftKey) => setSheetTarget({ cellKey, isOpen: true }), []);
  const revealedKey = revealedTarget?.scope === "cell" ? revealedTarget.key : undefined;
  if (revealedKey !== undefined && findCell(edit.session.draft, revealedKey) !== undefined) setSheetTarget({ cellKey: revealedKey, isOpen: true });

  function closeSheet() {
    setSheetTarget((target) => (target === null ? null : { cellKey: target.cellKey, isOpen: false }));
  }

  return (
    <>
      {rats.map((rat) => (
        <PhoneRatSection
          key={rat}
          edit={edit}
          rat={rat}
          errorsByKey={errorsByKey}
          texts={texts}
          canConfirm={canConfirm}
          isNewCellConfirmed={isNewCellConfirmed}
          onOpenCell={openCell}
        />
      ))}
      <CellSheet
        edit={edit}
        cellKey={sheetTarget?.cellKey ?? null}
        isOpen={sheetTarget?.isOpen ?? false}
        errorsByKey={errorsByKey}
        texts={texts}
        canConfirm={canConfirm}
        onOpenCell={openCell}
        onClose={closeSheet}
      />
    </>
  );
}
