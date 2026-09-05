import type { ReactNode } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type FilterProps = {
  label: string;
  value: string;
  options: { value: string; label: string; content?: ReactNode }[];
  onChange: (value: string) => void;
};

export function Filter({ label, value, options, onChange }: FilterProps) {
  const selected = options.find((option) => option.value === value);

  return (
    <div className="grid min-w-32 gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value} items={options} onValueChange={(next) => onChange(next ?? "all")}>
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue>{selected?.content ?? selected?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.content ?? option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
