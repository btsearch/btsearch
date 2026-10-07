import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  showLabel?: boolean;
  maxLength?: number;
  className?: string;
  inputClassName?: string;
};

export const REFERENCE_FILTER_LABEL_CLASS = "text-xs leading-4 font-medium text-muted-foreground";

export function SearchField({ value, onChange, label, placeholder, showLabel = true, maxLength, className, inputClassName }: SearchFieldProps) {
  const { t } = useTranslation("common");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const clearLabel = t("actions.clear");

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      {showLabel ? (
        <Label htmlFor={inputId} className={REFERENCE_FILTER_LABEL_CLASS}>
          {label}
        </Label>
      ) : null}
      <div className="relative">
        <HugeiconsIcon
          icon={Search01Icon}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={inputRef}
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={placeholder}
          aria-label={showLabel ? undefined : label}
          maxLength={maxLength}
          {...NO_AUTOFILL_PROPS}
          spellCheck={false}
          className={cn("pr-8 pl-8", inputClassName)}
        />
        {value === "" ? null : (
          <Tooltip>
            <TooltipTrigger
              aria-label={clearLabel}
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer text-muted-foreground"
                />
              }
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
            >
              <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>{clearLabel}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
