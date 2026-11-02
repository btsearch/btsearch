import { useState } from "react";
import { useTranslation } from "react-i18next";

import { getPasswordLengthProblem } from "../../utils/password";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { PasswordInput } from "@/features/settings/components/passwordInput";

type NewPasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (password: string) => void;
  disabled: boolean;
};

export function NewPasswordField({ id, label, value, onChange, disabled }: NewPasswordFieldProps) {
  const { t } = useTranslation("admin");
  const [isTouched, setIsTouched] = useState(false);

  const problem = getPasswordLengthProblem(value);
  let errorText: string | null = null;
  if (problem === "long") errorText = t("users.shared.errors.passwordTooLong");
  else if (problem === "short" && isTouched && value !== "") errorText = t("common:password.tooShort");

  return (
    <Field data-invalid={errorText !== null || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <PasswordInput
        id={id}
        value={value}
        onChange={onChange}
        onBlur={() => setIsTouched(true)}
        autoComplete="new-password"
        invalid={errorText !== null}
        disabled={disabled}
        required
      />
      {errorText !== null ? <FieldError>{errorText}</FieldError> : <FieldDescription>{t("settings:security.password.rules")}</FieldDescription>}
    </Field>
  );
}
