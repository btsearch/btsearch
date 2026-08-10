import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { type ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function MobileFilterChip({
  active,
  children,
  contentClassName,
  count = 0,
  icon,
  label,
  onOpenChange,
}: {
  active: boolean;
  children: ReactNode;
  contentClassName?: string;
  count?: number;
  icon: IconSvgElement;
  label: string;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted",
            )}
          />
        }
      >
        <HugeiconsIcon icon={icon} className="size-3.5 shrink-0" />
        <span>{label}</span>
        {count > 0 ? (
          <span
            className={cn(
              "inline-flex size-4 items-center justify-center rounded-full text-[10px] leading-none",
              active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {count}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        className={cn("max-h-[62svh] w-[min(20rem,calc(100vw-1rem))] overflow-y-auto", contentClassName)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function MobileFilterPanelTitle({ children }: { children: ReactNode }) {
  return <div className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</div>;
}
