import { useId } from "react";
import { useTranslation } from "react-i18next";

import { type MeasurementField, parseFieldValue, readFieldRange } from "../../utils/measurementSettings";
import { WARNING_TEXT_CLASS } from "../classNames";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

type MeasurementNumberFieldProps = {
  field: MeasurementField;
  label: string;
  unit?: string;
  hint: string;
  warning?: string | null;
  text: string;
  onTextChange: (text: string) => void;
};

export function MeasurementNumberField({ field, label, unit, hint, warning = null, text, onTextChange }: MeasurementNumberFieldProps) {
  const { t } = useTranslation("admin");
  const inputId = useId();
  const hintId = useId();
  const isInvalid = parseFieldValue(field, text) === null;

  let help = hint;
  if (isInvalid) help = t("settings.measurements.range", readFieldRange(field));
  else if (warning !== null) help = warning;

  return (
    <Field className="min-w-0">
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          {...NO_AUTOFILL_PROPS}
          id={inputId}
          inputMode="numeric"
          spellCheck={false}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          aria-invalid={isInvalid || undefined}
          aria-describedby={hintId}
          className="tabular-nums"
        />
        {unit === undefined ? null : (
          <InputGroupAddon align="inline-end" aria-hidden="true">
            {unit}
          </InputGroupAddon>
        )}
      </InputGroup>
      <p id={hintId} className={cn("text-sm text-muted-foreground", isInvalid ? "text-destructive" : warning !== null && WARNING_TEXT_CLASS)}>
        {help}
      </p>
    </Field>
  );
}
