import { type ReactNode, useId } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ToolbarSelectItem = { value: string; label: string };

type ToolbarFieldProps = {
  label: string;
  showLabel: boolean;
  children: ReactNode;
};

type ToolbarSelectProps = {
  label: string;
  showLabel?: boolean;
  value: string;
  items: ToolbarSelectItem[];
  onValueChange: (value: unknown) => void;
  triggerClassName: string;
};

export function ToolbarField({ label, showLabel, children }: ToolbarFieldProps) {
  const labelId = useId();
  if (!showLabel) return children;

  return (
    <div role="group" aria-labelledby={labelId} className="flex min-w-0 items-center gap-1.5">
      <span id={labelId} className="w-20 shrink-0 text-sm text-muted-foreground sm:w-auto">
        {label}
      </span>
      {children}
    </div>
  );
}

export function ToolbarSelect({ label, showLabel = false, value, items, onValueChange, triggerClassName }: ToolbarSelectProps) {
  return (
    <ToolbarField label={label} showLabel={showLabel}>
      <Select value={value} onValueChange={onValueChange} items={items}>
        <SelectTrigger aria-label={label} className={cn("h-8 min-w-0 flex-1 sm:flex-none", triggerClassName)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ToolbarField>
  );
}
