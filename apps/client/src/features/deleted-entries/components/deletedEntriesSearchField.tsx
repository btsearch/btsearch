import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type DeletedEntriesSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  className?: string;
  inputClassName?: string;
};

export function DeletedEntriesSearchField({ value, onChange, id, label, className, inputClassName }: DeletedEntriesSearchFieldProps) {
  const { t } = useTranslation(["deletedEntries", "common"]);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={cn("relative", className)}>
      <HugeiconsIcon
        icon={Search01Icon}
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={t("deletedEntries.filters.searchPlaceholder")}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        className={cn("pl-8 pr-8", inputClassName)}
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("common:actions.clear")}
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
