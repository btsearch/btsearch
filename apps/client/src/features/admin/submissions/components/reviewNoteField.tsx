import { useId } from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EDIT_LIMITS } from "@/features/station-editing/model/validate";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

type ReviewNoteFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  showsCount?: boolean;
};

export function ReviewNoteField({ label, placeholder, value, onChange, rows = 3, showsCount = false }: ReviewNoteFieldProps) {
  const fieldId = useId();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={fieldId}>{label}</Label>
        {showsCount ? (
          <span className="text-[11px] leading-4 text-muted-foreground tabular-nums">
            {value.length} / {EDIT_LIMITS.submissionNote}
          </span>
        ) : null}
      </div>
      <Textarea
        {...NO_AUTOFILL_PROPS}
        id={fieldId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={EDIT_LIMITS.submissionNote}
      />
    </div>
  );
}
