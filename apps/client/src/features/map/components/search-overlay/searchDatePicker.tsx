import { enUS, pl } from "date-fns/locale";

import { Calendar } from "@/components/ui/calendar";

export function SearchDatePicker({ language, onPick }: { language: string; onPick: (date: Date) => void }) {
  return (
    <Calendar
      mode="single"
      classNames={{ root: "w-full" }}
      className="bg-transparent [&_td]:aspect-auto [&_[data-day]]:aspect-auto [&_[data-day]]:h-8"
      locale={language === "pl-PL" ? pl : enUS}
      onSelect={(date) => {
        if (date) onPick(date);
      }}
    />
  );
}
