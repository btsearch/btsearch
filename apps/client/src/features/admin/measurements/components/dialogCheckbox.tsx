import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { SETTINGS_DESCRIPTION_CLASS } from "@/features/settings/components/settingsPrimitives";

type DialogCheckboxProps = {
  label: string;
  description?: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function DialogCheckbox({ label, description, checked, disabled, onCheckedChange }: DialogCheckboxProps) {
  const checkboxId = useId();

  return (
    <div className="flex items-start gap-2">
      <Checkbox id={checkboxId} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} className="mt-0.5 cursor-pointer" />
      <label htmlFor={checkboxId} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium">{label}</span>
        {description === undefined ? null : <span className={SETTINGS_DESCRIPTION_CLASS}>{description}</span>}
      </label>
    </div>
  );
}
