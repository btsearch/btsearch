import type { KeyboardEvent } from "react";

import { navigateRowHorizontal } from "../rowNav";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type DetailInputCellProps = {
  field: string;
  placeholder: string;
  value: number | "";
  error?: boolean;
  disabled?: boolean;
  max?: number;
  onDetailChange: (field: string, value: number | boolean | undefined) => void;
};

export function DetailInputCell({ field, placeholder, value, error, disabled, max, onDetailChange }: DetailInputCellProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    navigateRowHorizontal(e);
    const tr = (e.target as HTMLElement).closest("tr");
    if (!tr) return;
    if (e.key === "Enter" || (e.key === "ArrowDown" && e.ctrlKey)) {
      e.preventDefault();
      const nextTr = tr.nextElementSibling as HTMLElement | null;
      nextTr?.querySelector<HTMLInputElement>(`input[data-field="${field}"]`)?.focus({ focusVisible: true });
    } else if (e.key === "ArrowUp" && e.ctrlKey) {
      e.preventDefault();
      const prevTr = tr.previousElementSibling as HTMLElement | null;
      prevTr?.querySelector<HTMLInputElement>(`input[data-field="${field}"]`)?.focus({ focusVisible: true });
    }
  };

  return (
    <td className="px-1.5 py-1">
      <Input
        type="number"
        min={0}
        max={max}
        placeholder={placeholder}
        value={value}
        data-field={field}
        data-nav-cell
        onChange={(e) => onDetailChange(field, e.target.value ? Number.parseInt(e.target.value, 10) : undefined)}
        onKeyDown={handleKeyDown}
        className={cn("h-7 w-24 font-mono text-sm", error && "border-destructive")}
        disabled={disabled}
      />
    </td>
  );
}

export function DetailComputedCell({ value }: { value: number | null }) {
  return (
    <td className="px-1.5 py-1">
      <span className="font-mono text-sm text-muted-foreground">{value !== null ? value : "-"}</span>
    </td>
  );
}
