import { useId } from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

type ReasonFieldProps = {
  label: string;
  placeholder: string;
  hint?: string;
  value: string;
  isDisabled?: boolean;
  onChange: (value: string) => void;
};

export const REASON_MAX_LENGTH = 500;

export function ReasonField({ label, placeholder, hint, value, isDisabled = false, onChange }: ReasonFieldProps) {
  const fieldId = useId();
  const hintId = useId();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={fieldId}>{label}</Label>
        <span className="text-[11px] leading-4 text-muted-foreground tabular-nums">
          {value.length} / {REASON_MAX_LENGTH}
        </span>
      </div>
      <Textarea
        {...NO_AUTOFILL_PROPS}
        id={fieldId}
        value={value}
        rows={3}
        maxLength={REASON_MAX_LENGTH}
        placeholder={placeholder}
        disabled={isDisabled}
        aria-describedby={hint === undefined ? undefined : hintId}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint === undefined ? null : (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
