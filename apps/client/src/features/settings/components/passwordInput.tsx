import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

export function PasswordInput({
  id,
  value,
  onChange,
  onBlur,
  autoComplete,
  placeholder,
  invalid = false,
  disabled = false,
  required = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
}) {
  const { t } = useTranslation("settings");
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? t("security.password.hide") : t("security.password.show");

  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        required={required}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label={toggleLabel} title={toggleLabel} onClick={() => setVisible((current) => !current)}>
          <HugeiconsIcon icon={visible ? ViewOffSlashIcon : ViewIcon} />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
