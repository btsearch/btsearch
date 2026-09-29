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
      <TooltipTrigger render={<span />} className="inline-flex cursor-default items-center gap-0.5">
        <HugeiconsIcon icon={icon} className={cn(iconSize, "text-foreground")} aria-hidden="true" />
        <span className="sr-only">{label}</span>
        <span className="text-emerald-600">{speed}</span>
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
          {hasDl ? <SpeedItem direction="dl" speed={dl} iconSize={iconSize} /> : null}
          {hasDl && hasUl ? <span className="mx-0.5 text-muted-foreground/40">/</span> : null}
          {hasUl ? <SpeedItem direction="ul" speed={ul} iconSize={iconSize} /> : null}
        </>
      )}
    </span>
  );
}
