import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { type StationDraftApi, useEditText } from "../../hooks/useStationDraft";
import { getFieldState, parseDigits } from "../../model/changes";
import { findMostFrequentAreaCode } from "../../model/draftReducer";
import { CELL_NUMBER_LABELS, RAT_FIELDS, carriesAreaCode, getAreaCodeField, getCellNumber } from "../../model/ratFields";
import type { Rat } from "../../model/types";
import { findFieldError } from "../../model/validate";
import { editTargetProps } from "../frame/editTargets";
import { FieldMarks } from "../frame/wasLine";
import { EMPTY_TEXT, MOST_DIGITS, NUMBER_INPUT_CLASS, getControlClass } from "./cellFields";
import { canEditCells } from "./cellRules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

type AreaCodeFieldProps = {
  edit: StationDraftApi;
  rat: Rat;
};

const STANDALONE_SUFFIX = " (SA)";
const INPUT_WIDTH_CLASSES: Record<Rat, string> = { nr: "w-[76px]", lte: "w-[66px]", umts: "w-[66px]", gsm: "w-[66px]" };
const LABEL_CLASS = "flex shrink-0 items-center gap-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground";
const MIXED_CLASS = "flex items-center gap-1.5 text-xs font-medium whitespace-nowrap text-amber-700 dark:text-amber-400";

export function AreaCodeField({ edit, rat }: AreaCodeFieldProps) {
  const { t } = useTranslation();
  const text = useEditText();
  const { session, context, dispatch } = edit;
  const { draft } = session;
  const canEdit = canEditCells(edit);
  const areaCode = draft.areaCodes[rat];
  const field = getAreaCodeField(rat);
  const fieldLabel = CELL_NUMBER_LABELS[field];
  const ratName = RAT_FIELDS[rat].name;
  const targetProps = editTargetProps({ scope: "areaCode", rat, field });
  const carriers = draft.cells.filter((cell) => cell.rat === rat && !cell.isDeleted && carriesAreaCode(cell));
  if (carriers.length === 0) return null;

  if (areaCode.mode === "perCell") {
    const valueCount = new Set(carriers.map((cell) => getCellNumber(cell, field))).size;
    const unifiedValue = findMostFrequentAreaCode(draft.cells, rat) ?? EMPTY_TEXT;

    return (
      <div {...targetProps} className="flex shrink-0 items-center gap-2">
        <span className={MIXED_CLASS}>
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="size-3.5 shrink-0" />
          {t("stations:edit.cells.areaCode.mixed", { field: fieldLabel, count: valueCount })}
        </span>
        {canEdit ? (
          <Tooltip>
            <TooltipTrigger
              onClick={() => dispatch({ type: "unifyAreaCode", rat })}
              render={<Button type="button" variant="outline" size="sm" className="cursor-pointer" />}
            >
              {t("stations:edit.cells.areaCode.unify")}
            </TooltipTrigger>
            <TooltipContent>{t("stations:edit.cells.areaCode.unifyHint", { rat: ratName, field: fieldLabel, value: unifiedValue })}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    );
  }

  const fieldState = getFieldState(session, context, { scope: "areaCode", rat });
  const error = findFieldError(edit.errors, { scope: "areaCode", rat, field });
  const isReview = session.kind === "review";
  const isInvalid = error !== undefined;
  const hint = error === undefined ? t("stations:edit.cells.areaCode.sharedHint", { rat: ratName }) : text.formatError(error);
  const lookClass = getControlClass(fieldState, { showsCorrections: isReview, isInvalid, isDeleted: false });

  return (
    <label {...targetProps} title={hint} className={LABEL_CLASS}>
      {rat === "nr" ? `${fieldLabel}${STANDALONE_SUFFIX}` : fieldLabel}
      <Input
        type="text"
        inputMode="numeric"
        {...NO_AUTOFILL_PROPS}
        aria-label={t("stations:edit.cells.areaCode.sharedLabel", { field: fieldLabel, rat: ratName })}
        aria-invalid={isInvalid ? true : undefined}
        maxLength={MOST_DIGITS}
        value={areaCode.value === null ? "" : String(areaCode.value)}
        onChange={(event) => dispatch({ type: "setAreaCode", rat, value: parseDigits(event.target.value) })}
        disabled={!canEdit}
        className={cn(NUMBER_INPUT_CLASS, INPUT_WIDTH_CLASSES[rat], "text-foreground", lookClass)}
      />
      {isReview && fieldState.marks.length > 0 ? <FieldMarks marks={fieldState.marks} variant="struck" className="mt-0 pl-0" /> : null}
    </label>
  );
}
