import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type CollapsibleSectionProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
};

export function CollapsibleSection({ title, children, defaultOpen = true, className }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={className}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <h2>
          <CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider transition-colors group-hover:text-foreground">
              {title}
            </span>
            <HugeiconsIcon icon={ArrowDown01Icon} className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out [&[hidden]:not([hidden='until-found'])]:hidden data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
          <div className="pt-3">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
