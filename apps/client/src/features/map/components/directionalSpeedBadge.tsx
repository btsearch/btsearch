import { ArrowDown02Icon, ArrowUp02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type DirectionalSpeedBadgeProps = {
  dl: string | null | undefined;
  ul: string | null | undefined;
  iconSize?: string;
};

export function DirectionalSpeedBadge({ dl, ul, iconSize = "size-2.5" }: DirectionalSpeedBadgeProps) {
  if ((dl === null || dl === undefined) && (ul === null || ul === undefined)) return null;

  return (
    <span className="inline-flex items-center gap-0.5 font-semibold">
      {dl !== null && dl !== undefined && (
        <Tooltip>
          <TooltipTrigger tabIndex={-1}>
            <span className="inline-flex items-center gap-0.5 cursor-default">
              <HugeiconsIcon icon={ArrowDown02Icon} className={cn(iconSize, "text-foreground")} />
              <span className="text-emerald-600">{dl}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>Downlink</TooltipContent>
        </Tooltip>
      )}
      {dl !== null && dl !== undefined && ul !== null && ul !== undefined && <span className="text-muted-foreground/40 mx-0.5">/</span>}
      {ul !== null && ul !== undefined && (
        <Tooltip>
          <TooltipTrigger tabIndex={-1}>
            <span className="inline-flex items-center gap-0.5 cursor-default">
              <HugeiconsIcon icon={ArrowUp02Icon} className={cn(iconSize, "text-foreground")} />
              <span className="text-emerald-600">{ul}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>Uplink</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}
