import type { ReactNode } from "react";

import { cellRowProps } from "../../hooks/useCellNavigation";
import type { CellNumberField, FieldMark } from "../../model/types";
import { type FieldLook, getFieldClass } from "../frame/fieldLook";
import { DELETED_CLASS, EMPTY_TEXT, FieldCell, LOCKED_CLASS } from "./cellFields";
import type { CellColumn } from "./cellGrid";
import { CELL_ROW_CLASS, ROW_KIND_CLASSES } from "./cellRow";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type LockedValue = {
  text: string;
  aside?: string;
  look: FieldLook;
  struck?: string;
  title?: string;
  isMuted?: boolean;
};

export type LockedRowTone = "new" | "changed" | "conflict" | "removed";

type LockedCellRowProps = {
  rowKey: string;
  label: string;
  columns: readonly CellColumn[];
  values: Readonly<Partial<Record<string, LockedValue>>>;
  isConfirmMarked: boolean;
  confirmedLabel: string;
  tone: LockedRowTone;
  tail: ReactNode;
  renderNumberControl?: (field: CellNumberField) => ReactNode;
  children?: ReactNode;
};

type LockedValueCellProps = {
  column: CellColumn;
  value: LockedValue;
  isRemoved: boolean;
  control?: ReactNode;
};

type LockedTickCellProps = {
  field: string;
  label: string;
  isMarked: boolean;
  isRemoved: boolean;
};

const MISSING_VALUE: LockedValue = { text: EMPTY_TEXT, look: "plain", isMuted: true };
const VALUE_CLASS = cn(
  "flex h-7 w-full items-center gap-1 overflow-hidden rounded-md border border-input px-[7px]",
  "text-[13px] leading-[18px] whitespace-nowrap",
);
const TICK_MARK_CLASS = "border-amber-500/55 ring-2 ring-amber-500/55 dark:border-amber-500/55";
export const LOCKED_ROW_TONE_CLASSES: Record<LockedRowTone, string> = {
  new: ROW_KIND_CLASSES.new,
  changed: ROW_KIND_CLASSES.changed,
  conflict: ROW_KIND_CLASSES.deleted,
  removed: "bg-muted/15",
};

function listStruckMarks(value: LockedValue, isRemoved: boolean): FieldMark[] | undefined {
  if (isRemoved || value.struck === undefined) return undefined;
  return [{ tone: "database", value: { text: value.struck } }];
}

function LockedValueCell({ column, value, isRemoved, control }: LockedValueCellProps) {
  const lookClass = isRemoved ? DELETED_CLASS : cn(getFieldClass(value.look, false, true), value.isMuted === true && "text-muted-foreground");
  const hasControl = control !== null && control !== undefined;
  const content = (
    <span className={cn(VALUE_CLASS, column.kind === "number" && "font-mono", hasControl && "min-w-0 flex-1", lookClass)}>
      <span className={column.kind === "band" ? "font-semibold" : undefined}>{value.text}</span>
      {value.aside === undefined ? null : <span className="text-xs text-muted-foreground">{value.aside}</span>}
    </span>
  );

  return (
    <FieldCell
      field={column.id}
      marks={listStruckMarks(value, isRemoved)}
      title={isRemoved ? undefined : value.title}
      marksClassName={hasControl ? "ml-[22px]" : undefined}
    >
      {hasControl ? (
        <div className="flex min-w-0 items-center gap-1.5">
          {control}
          {content}
        </div>
      ) : (
        content
      )}
    </FieldCell>
  );
}

function LockedTickCell({ field, label, isMarked, isRemoved }: LockedTickCellProps) {
  return (
    <FieldCell field={field} title={label}>
      <div className="flex h-7 items-center justify-center">
        <Checkbox
          aria-label={label}
          checked
          disabled
          className={cn(LOCKED_CLASS, isRemoved && "opacity-50", isMarked && !isRemoved && TICK_MARK_CLASS)}
        />
      </div>
    </FieldCell>
  );
}

export function LockedCellRow({
  rowKey,
  label,
  columns,
  values,
  isConfirmMarked,
  confirmedLabel,
  tone,
  tail,
  renderNumberControl,
  children,
}: LockedCellRowProps) {
  const isRemoved = tone === "removed";

  return (
    <div role="group" aria-label={label} {...cellRowProps(rowKey)} className={cn(CELL_ROW_CLASS, LOCKED_ROW_TONE_CLASSES[tone])}>
      {columns.map((column) =>
        column.kind === "confirmed" ? (
          <LockedTickCell key={column.id} field={column.id} label={confirmedLabel} isMarked={isConfirmMarked} isRemoved={isRemoved} />
        ) : (
          <LockedValueCell
            key={column.id}
            column={column}
            value={values[column.id] ?? MISSING_VALUE}
            isRemoved={isRemoved}
            control={column.kind === "number" ? renderNumberControl?.(column.spec.field) : undefined}
          />
        ),
      )}
      <div className="flex min-h-7 min-w-0 flex-wrap-reverse items-center justify-end gap-0.5">{tail}</div>
      {children}
    </div>
  );
}
