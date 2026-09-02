import type { ReactNode } from "react";

import { Checkbox as ShadcnCheckbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
  className?: string;
};

export function Checkbox({ checked, onChange, children, className }: CheckboxProps) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md text-sm transition-all cursor-pointer border border-transparent",
        !checked && "hover:bg-muted dark:hover:bg-muted/50",
        checked && "bg-primary/5 border-primary/30 dark:border-primary/20 dark:bg-primary/10",
        className,
      )}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(!checked)}
    >
      <ShadcnCheckbox checked={checked} tabIndex={-1} className="size-3.5 pointer-events-none [&>[data-slot=checkbox-indicator]>svg]:size-3" />
      {children}
    </button>
  );
}
