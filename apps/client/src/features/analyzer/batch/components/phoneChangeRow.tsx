import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { BAND_COLUMN_ID, type RowValues, SECTOR_COLUMN_ID, getRowRat } from "../model/batchRows";
import { type FieldChoice, listFieldChoices } from "../model/fieldSelection";
import { type ChangeRowProps, RestoreButton, RowNotes, getRowTone, useSourceText } from "./changeRow";
import { FieldCheckbox } from "./fieldCheckbox";
import { Button } from "@/components/ui/button";
import { GenerationTag } from "@/features/shared/RatGenerationLabel";
import type { CellColumn } from "@/features/station-editing/components/cells/cellGrid";
import { LOCKED_ROW_TONE_CLASSES, type LockedValue } from "@/features/station-editing/components/cells/lockedCellRow";
import { EditPageHeadSeparator } from "@/features/station-editing/components/frame/editPageHead";
import { cellRowProps } from "@/features/station-editing/hooks/useCellNavigation";
import { RAT_FIELDS } from "@/features/station-editing/model/ratFields";
import type { CellNumberField, Rat } from "@/features/station-editing/model/types";
import { cn } from "@/lib/utils";

type NumberEntry = {
  field: string;
  label: string;
  value: LockedValue;
};

type NumberTextProps = {
  entry: NumberEntry;
  isHeadline: boolean;
};

type NumberFieldProps = NumberTextProps & {
  choice: FieldChoice | undefined;
  isIncluded: boolean;
  isLocked: boolean;
  onChange: ChangeRowProps["onChange"];
};

const HEADLINE_FIELDS: Record<Rat, CellNumberField> = { nr: "pci", lte: "pci", umts: "cid", gsm: "cid" };
const STRUCK_CLASS = "text-amber-600 dark:text-amber-400";

function listNumberEntries(columns: readonly CellColumn[], values: RowValues): NumberEntry[] {
  return columns.flatMap((column) => {
    const value = column.kind === "number" ? values[column.id] : undefined;
    return column.kind !== "number" || value === undefined ? [] : [{ field: column.id, label: column.spec.label, value }];
  });
}

function pickHeadline(entries: readonly NumberEntry[], rat: Rat): NumberEntry | undefined {
  return (
    entries.find((entry) => entry.value.look === "changed" || entry.value.struck !== undefined) ??
    entries.find((entry) => entry.field === HEADLINE_FIELDS[rat]) ??
    entries.at(0)
  );
}

function NumberText({ entry, isHeadline }: NumberTextProps) {
  const { t } = useTranslation();
  const { label, value } = entry;
  const isChanged = value.look !== "plain";

  return (
    <span className="whitespace-nowrap">
      {label}{" "}
      {value.struck === undefined ? null : (
        <>
          <s title={t("stations:edit.marks.databaseValue")} className={STRUCK_CLASS}>
            {value.struck}
          </s>{" "}
        </>
      )}
      <span className={cn(isChanged && "text-foreground", isChanged && isHeadline && "font-semibold", value.isMuted && "text-muted-foreground")}>
        {value.text}
      </span>
    </span>
  );
}

function NumberField({ entry, isHeadline, choice, isIncluded, isLocked, onChange }: NumberFieldProps) {
  const text = <NumberText entry={entry} isHeadline={isHeadline} />;
  if (choice === undefined) return text;

  return (
    <FieldCheckbox choice={choice} isIncluded={isIncluded} isLocked={isLocked} onChange={onChange}>
      {text}
    </FieldCheckbox>
  );
}

export function PhoneChangeRow({
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
  const rat = getRowRat(row);
  const band = values[BAND_COLUMN_ID];
  const sector = values[SECTOR_COLUMN_ID];
  const entries = listNumberEntries(columns, values);
  const choices = sourceRow === undefined || isRemoved ? [] : listFieldChoices(sourceRow);
  const included = new Set(listFieldChoices(row).map((choice) => choice.field));
  const headline = pickHeadline(entries, rat);
  const headlineChoice = headline === undefined ? undefined : choices.find((choice) => choice.field === headline.field);
  const details = entries.filter((entry) => entry !== headline);
  const struckClass = isRemoved ? "text-muted-foreground line-through" : undefined;

  return (
    <div
      role="group"
      aria-label={t("cellAnalyzer:batch.rowLabel", { row: row.index + 1 })}
      {...cellRowProps(row.key)}
      className={cn(
        "relative flex min-h-14 items-center gap-2 border-t border-border/60 py-1.5 pr-1.5 pl-3.5 first:border-t-0",
        LOCKED_ROW_TONE_CLASSES[getRowTone(row, isRemoved, conflict !== undefined)],
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <p className={cn("flex items-center gap-1.5 text-sm leading-5", choices.length > 0 && "flex-wrap", struckClass)}>
          <GenerationTag>{RAT_FIELDS[rat].generation}</GenerationTag>
          {band === undefined ? null : <span className="font-semibold">{band.text}</span>}
          {band === undefined || band.aside === undefined ? null : <span className="text-[12.5px] text-muted-foreground">{band.aside}</span>}
          {sector === undefined ? null : (
            <>
              <EditPageHeadSeparator />
              <span>{sector.text}</span>
            </>
          )}
          {row.action === "create" && !isRemoved ? (
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{t("cellAnalyzer:batch.newCellShort")}</span>
          ) : null}
          <span className="flex-1" />
          {headline === undefined || isRemoved ? null : (
            <span className="font-mono text-[13px]">
              <NumberField
                entry={headline}
                isHeadline
                choice={headlineChoice}
                isIncluded={headlineChoice !== undefined && included.has(headlineChoice.field)}
                isLocked={isLocked}
                onChange={onChange}
              />
            </span>
          )}
        </p>
        <p
          className={cn(
            "flex gap-x-2 font-mono text-xs leading-4 text-muted-foreground",
            choices.length > 0 ? "flex-wrap items-center" : "overflow-hidden",
            isRemoved && "line-through",
          )}
        >
          {details.map((entry) => {
            const choice = choices.find((candidate) => candidate.field === entry.field);
            return (
              <NumberField
                key={entry.field}
                entry={entry}
                isHeadline={false}
                choice={choice}
                isIncluded={choice !== undefined && included.has(choice.field)}
                isLocked={isLocked}
                onChange={onChange}
              />
            );
          })}
        </p>
        <p className={cn("truncate text-xs leading-4 text-muted-foreground", isRemoved && "line-through")}>{sourceText}</p>
        {isRemoved ? null : (
          <RowNotes
            row={row}
            conflict={conflict}
            spreadCount={spreadCount}
            isBandMissing={isBandMissing}
            isExcluded={isExcluded}
            refusals={refusals}
            lineClassName="pt-0.5"
          />
        )}
        {isRemoved || conflict === undefined ? null : (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={isLocked}
            onClick={() => onChange({ type: "keepRow", index: row.index, rivals: conflict.rivals })}
            className="mt-1 cursor-pointer self-start"
          >
            {t("cellAnalyzer:batch.keepRow")}
          </Button>
        )}
      </div>
      {isRemoved ? (
        <RestoreButton isDisabled={isLocked} onClick={() => onChange({ type: "restoreRow", index: row.index })} />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("submissions:batch.removeCell", { row: row.index + 1 })}
          disabled={isLocked}
          onClick={() => onChange({ type: "removeRow", index: row.index })}
          className="shrink-0 cursor-pointer text-muted-foreground"
        >
          <HugeiconsIcon icon={Delete02Icon} aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
