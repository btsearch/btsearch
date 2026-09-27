import { ArrowDataTransferVerticalIcon, ArrowDown02Icon, ArrowUp02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SPEED_DIRECTIONS = {
  dl: { icon: ArrowDown02Icon, label: "Downlink" },
  ul: { icon: ArrowUp02Icon, label: "Uplink" },
  both: { icon: ArrowDataTransferVerticalIcon, label: "Downlink / Uplink" },
};

type SpeedItemProps = {
  direction: keyof typeof SPEED_DIRECTIONS;
  speed: string;
  iconSize: string;
};

function SpeedItem({ direction, speed, iconSize }: SpeedItemProps) {
  const { icon, label } = SPEED_DIRECTIONS[direction];

  return (
    <Tooltip>
      <TooltipTrigger tabIndex={-1}>
        <span className="inline-flex items-center gap-0.5 cursor-default">
          <HugeiconsIcon icon={icon} className={cn(iconSize, "text-foreground")} />
          <span className="text-emerald-600">{speed}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

type DirectionalSpeedBadgeProps = {
  dl: string | null | undefined;
  ul: string | null | undefined;
  iconSize?: string;
};

export function DirectionalSpeedBadge({ dl, ul, iconSize = "size-2.5" }: DirectionalSpeedBadgeProps) {
  const hasDl = dl !== null && dl !== undefined;
  const hasUl = ul !== null && ul !== undefined;
  if (!hasDl && !hasUl) return null;

  return (
    <span className="inline-flex items-center gap-0.5 font-semibold">
      {hasDl && dl === ul ? (
        <SpeedItem direction="both" speed={dl} iconSize={iconSize} />
      ) : (
        <>
          {hasDl && <SpeedItem direction="dl" speed={dl} iconSize={iconSize} />}
          {hasDl && hasUl && <span className="text-muted-foreground/40 mx-0.5">/</span>}
          {hasUl && <SpeedItem direction="ul" speed={ul} iconSize={iconSize} />}
        </>
      )}
    </span>
  );
}
