import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { enUS, pl } from "date-fns/locale";
import { useTranslation } from "react-i18next";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface DatePickerButtonProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
}

export function DatePickerButton({ value, onChange, label }: DatePickerButtonProps) {
  const { i18n } = useTranslation();
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  const locale = i18n.language === "pl-PL" ? pl : enUS;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "h-8 rounded-lg border bg-transparent px-2.5 text-sm transition-colors flex items-center gap-2 min-w-32.5",
          "border-input dark:bg-input/30 dark:hover:bg-input/50 hover:bg-muted",
          value ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <HugeiconsIcon icon={Calendar03Icon} className="size-3.5 text-muted-foreground shrink-0" />
        <span className="truncate">{value || label}</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={selected} onSelect={(date) => onChange(date ? formatDateForInput(date) : "")} locale={locale} />
      </PopoverContent>
    </Popover>
  );
}
