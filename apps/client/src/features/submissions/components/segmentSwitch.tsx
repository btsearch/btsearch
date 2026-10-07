import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SegmentSwitchProps = {
  label: string;
  children: ReactNode;
};

type SegmentButtonProps = {
  label: string;
  icon: IconSvgElement;
  isActive: boolean;
  isDisabled: boolean;
  isDestructive?: boolean;
  hasAutoFocus?: boolean;
  onClick: () => void;
};

const BUTTON_CLASS = cn(
  "flex h-7 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium",
  "transition-[color,background-color,box-shadow] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:cursor-default",
);

function getStateClass(isActive: boolean, isDestructive: boolean): string {
  if (isActive) return cn("bg-background text-foreground shadow-sm ring-1", isDestructive ? "ring-destructive/70" : "ring-foreground/50");
  const hoverClass = isDestructive ? "enabled:hover:bg-destructive/5" : "enabled:hover:bg-background/50";
  return cn("text-muted-foreground enabled:hover:text-foreground", hoverClass);
}

export function SegmentSwitch({ label, children }: SegmentSwitchProps) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center rounded-lg border bg-card p-0.5 shadow-sm">
      {children}
    </div>
  );
}

export function SegmentButton({ label, icon, isActive, isDisabled, isDestructive = false, hasAutoFocus = false, onClick }: SegmentButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isActive}
      disabled={isDisabled}
      autoFocus={hasAutoFocus}
      onClick={onClick}
      className={cn(BUTTON_CLASS, getStateClass(isActive, isDestructive))}
    >
      <HugeiconsIcon icon={icon} className={cn("size-3.5", isDestructive ? "text-destructive" : null)} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
