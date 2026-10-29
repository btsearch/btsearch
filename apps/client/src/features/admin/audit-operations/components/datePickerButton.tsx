import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { enUS, pl } from "date-fns/locale";
import type { Matcher } from "react-day-picker";
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

function parseInputDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

interface DatePickerButtonProps {
  value: string;
  earliest?: string;
  latest?: string;
  onChange: (value: string) => void;
  label: string;
}

export function DatePickerButton({ value, earliest = "", latest = "", onChange, label }: DatePickerButtonProps) {
  const { i18n } = useTranslation();
  const selected = value ? parseInputDate(value) : undefined;
  const locale = i18n.language === "pl-PL" ? pl : enUS;
  const unavailableDays: Matcher[] = [];
  if (earliest) unavailableDays.push({ before: parseInputDate(earliest) });
  if (latest) unavailableDays.push({ after: parseInputDate(latest) });

  return (
    <Popover>
      <PopoverTrigger
        aria-label={value ? `${label}: ${value}` : undefined}
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
        <Calendar
          mode="single"
          selected={selected}
          disabled={unavailableDays}
          onSelect={(date) => onChange(date ? formatDateForInput(date) : "")}
          locale={locale}
        />
      </PopoverContent>
    </Popover>
  );
}
