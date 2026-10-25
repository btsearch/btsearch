import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

type TrustWeightFieldProps = {
  value: string;
  hint: string;
  isInvalid: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
};

export function TrustWeightField({ value, hint, isInvalid, disabled, onChange }: TrustWeightFieldProps) {
  const { t } = useTranslation("admin");
  const inputId = useId();
  const messageId = useId();

  return (
    <Field data-invalid={isInvalid || undefined}>
      <FieldLabel htmlFor={inputId}>{t("measurements.weight")}</FieldLabel>
      <Input
        {...NO_AUTOFILL_PROPS}
        id={inputId}
        value={value}
        inputMode="decimal"
        disabled={disabled}
        aria-invalid={isInvalid || undefined}
        aria-describedby={messageId}
        className="w-30"
        onChange={(event) => onChange(event.target.value)}
      />
      {isInvalid ? (
        <FieldError id={messageId}>{t("measurements.person.weightInvalid")}</FieldError>
      ) : (
        <FieldDescription id={messageId}>{hint}</FieldDescription>
      )}
    </Field>
  );
}
