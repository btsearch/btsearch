import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { currentMonth, toMonth, toMonthStart } from "../../lib/periods";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function MonthPickerButton({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) {
  const { t, i18n } = useTranslation("statistics");
  const date = new Date(toMonthStart(value));
  const label = date.toLocaleDateString(i18n.language, { month: "long", timeZone: "UTC", year: "numeric" });

  return (
    <Popover>
      <PopoverTrigger
        render={<Button type="button" variant="outline" className="min-w-36 cursor-pointer justify-start gap-2 font-normal" />}
        aria-label={`${t("filters.month")}: ${label}`}
      >
        <HugeiconsIcon icon={Calendar03Icon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate capitalize">{label}</span>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <DatePickerInput
          value={date}
          max={new Date(toMonthStart(currentMonth()))}
          onChange={(nextDate) => onValueChange(nextDate !== null ? toMonth(nextDate) : currentMonth())}
        />
      </PopoverContent>
    </Popover>
  );
}
