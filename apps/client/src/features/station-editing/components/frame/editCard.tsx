import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { type ReactNode, useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type EditCardProps = {
  title: ReactNode;
  icon?: IconSvgElement;
  lead?: ReactNode;
  count?: ReactNode;
  extras?: ReactNode;
  aside?: ReactNode;
  actions?: ReactNode;
  barFooter?: ReactNode;
  children: ReactNode;
  isCollapsible?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  isBarSticky?: boolean;
  ariaLabel?: string;
  className?: string;
  barClassName?: string;
};

const BAR_CLASS = "px-4 py-2.5 border-b flex items-center justify-between gap-2";
const STICKY_BAR_CLASS = "sticky top-0 z-[3] rounded-t-[13px] bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))]";
const HEADING_CLASS = "flex min-w-0 items-center gap-2";

export function EditCard({
  title,
  icon,
  lead,
  count,
  extras,
  aside,
  actions,
  barFooter,
  children,
  isCollapsible = false,
  open,
  onOpenChange,
  isBarSticky = false,
  ariaLabel,
  className,
  barClassName,
}: EditCardProps) {
  const [isOpenInside, setIsOpenInside] = useState(true);
  const isOpen = !isCollapsible || (open ?? isOpenInside);

  function handleOpenChange(nextOpen: boolean) {
    setIsOpenInside(nextOpen);
    onOpenChange?.(nextOpen);
  }

  const heading = (
    <>
      {icon === undefined ? null : <HugeiconsIcon icon={icon} className="size-4 shrink-0 text-muted-foreground" />}
      {lead}
      <span className="font-semibold text-sm">{title}</span>
      {count === undefined ? null : <span className="text-xs text-muted-foreground">{count}</span>}
      {extras}
    </>
  );
  const headingBlock = isCollapsible ? (
    <CollapsibleTrigger className={cn(HEADING_CLASS, "cursor-pointer select-none group")}>
      <HugeiconsIcon
        icon={ArrowDown01Icon}
        className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-0 -rotate-90"
      />
      {heading}
    </CollapsibleTrigger>
  ) : (
    <div className={HEADING_CLASS}>{heading}</div>
  );
  const bar = (
    <div className={isBarSticky ? STICKY_BAR_CLASS : "bg-muted/50"}>
      <div className={cn(BAR_CLASS, barClassName)}>
        {aside === undefined ? (
          headingBlock
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {headingBlock}
            {aside}
          </div>
        )}
        {actions === undefined ? null : <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {isOpen ? barFooter : null}
    </div>
  );
  const bodyClass = isBarSticky ? "overflow-hidden rounded-b-[13px]" : undefined;
  const card = (
    <section aria-label={ariaLabel} className={cn("border rounded-xl", isBarSticky ? "relative" : "overflow-hidden", className)}>
      {bar}
      {isCollapsible ? <CollapsibleContent className={bodyClass}>{children}</CollapsibleContent> : <div className={bodyClass}>{children}</div>}
    </section>
  );

  if (!isCollapsible) return card;
  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      {card}
    </Collapsible>
  );
}
