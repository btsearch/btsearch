import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";

import type { FieldChoice } from "../model/fieldSelection";
import type { BatchAction } from "../model/reviewState";
import { Checkbox } from "@/components/ui/checkbox";
import { CELL_NUMBER_LABELS, RAT_FIELDS } from "@/features/station-editing/model/ratFields";
import { cn } from "@/lib/utils";

type FieldCheckboxProps = {
  choice: FieldChoice;
  isIncluded: boolean;
  isLocked: boolean;
  onChange: (action: BatchAction) => void;
  className?: string;
  children?: ReactNode;
};

export function FieldCheckbox({ choice, isIncluded, isLocked, onChange, className, children }: FieldCheckboxProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const valueId = `${inputId}-value`;
  const isDisabled = isLocked || choice.required;

  return (
    <label
      htmlFor={inputId}
      className={cn("inline-flex min-h-11 items-center gap-1.5 md:min-h-8", isDisabled ? "cursor-default" : "cursor-pointer", className)}
      title={choice.required ? t("submissions:batch.requiredForNewCells") : undefined}
    >
      <Checkbox
        id={inputId}
        checked={choice.required || isIncluded}
        disabled={isDisabled}
        aria-label={t("submissions:batch.includeField", {
          field: CELL_NUMBER_LABELS[choice.field],
          rat: RAT_FIELDS[choice.rat].name,
          row: choice.index + 1,
        })}
        aria-describedby={valueId}
        onCheckedChange={(checked) => onChange({ type: "setFields", fields: [choice], included: checked === true })}
      />
      {children}
      <span id={valueId} className="sr-only">
        {choice.stored === null ? null : (
          <>
            {t("submissions:batch.currentValue")} {choice.stored}{" "}
          </>
        )}
        {t("submissions:batch.newValue")} {choice.value}
        {choice.required ? <> {t("submissions:batch.requiredField")}</> : null}
      </span>
    </label>
  );
}
