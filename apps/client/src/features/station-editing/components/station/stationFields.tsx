import type { ReactNode } from "react";

import { type StationDraftApi, useEditText } from "../../hooks/useStationDraft";
import { getFieldState } from "../../model/changes";
import type { EditError, FieldMark, FieldTarget, StationField } from "../../model/types";
import { findFieldError } from "../../model/validate";
import { editTargetProps } from "../frame/editTargets";
import { getFieldClass, getFieldLook } from "../frame/fieldLook";
import { FieldMarks } from "../frame/wasLine";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type StationFieldView = {
  target: FieldTarget;
  controlId: string;
  labelId: string;
  errorId: string;
  error: EditError | undefined;
  marks: readonly FieldMark[];
  className: string;
  isCompact: boolean;
};

export type FieldControlProps = ReturnType<typeof getControlProps>;

type FieldGroupProps = {
  view: StationFieldView;
  label: ReactNode;
  isLabelLinked?: boolean;
  className?: string;
  children: ReactNode;
};

const NO_MARKS: readonly FieldMark[] = [];
const COLUMNS_CLASS = "grid-cols-[160px_minmax(0,1fr)] gap-x-4";
const COMPACT_COLUMNS_CLASS = "grid-cols-[132px_minmax(0,1fr)] gap-x-3";

export function getFieldColumnsClass(isCompact: boolean): string {
  return isCompact ? COMPACT_COLUMNS_CLASS : COLUMNS_CLASS;
}

export function getStationFieldView(edit: StationDraftApi, field: StationField, idPrefix: string): StationFieldView {
  const { session } = edit;
  const isReview = session.kind === "review";
  const target: FieldTarget = { scope: "station", field };
  const state = getFieldState(session, edit.context, target);
  const error = findFieldError(edit.errors, target);

  return {
    target,
    controlId: `${idPrefix}-${field}`,
    labelId: `${idPrefix}-${field}-label`,
    errorId: `${idPrefix}-${field}-error`,
    error,
    marks: isReview ? state.marks : NO_MARKS,
    className: getFieldClass(getFieldLook(state, isReview), error !== undefined),
    isCompact: session.kind === "form",
  };
}

export function getControlProps(view: StationFieldView) {
  return {
    ...editTargetProps(view.target),
    id: view.controlId,
    "aria-invalid": view.error === undefined ? undefined : true,
    "aria-describedby": view.error === undefined ? undefined : view.errorId,
  };
}

export function FieldGroup({ view, label, isLabelLinked = true, className, children }: FieldGroupProps) {
  const text = useEditText();

  return (
    <div className={cn("flex min-w-0 flex-col", view.isCompact ? "gap-1.5" : "gap-2", className)}>
      <Label id={view.labelId} htmlFor={isLabelLinked ? view.controlId : undefined} className={view.isCompact ? "text-xs" : undefined}>
        {label}
      </Label>
      {children}
      {view.error === undefined ? null : (
        <p id={view.errorId} className="-mt-1 text-xs text-destructive">
          {text.formatError(view.error)}
        </p>
      )}
      <FieldMarks marks={view.marks} className="-mt-1" />
    </div>
  );
}
