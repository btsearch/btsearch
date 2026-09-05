import { Notification01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

import { useStationWatch } from "../hooks/useStationWatch";

type WatchButtonProps = {
  stationId: number;
  source?: "internal" | "uke";
  size?: "sm" | "md";
  className?: string;
  showLabel?: boolean;
  labelClassName?: string;
  showTooltip?: boolean;
};

export function WatchButton({
  stationId,
  source = "internal",
  size = "sm",
  className,
  showLabel = false,
  labelClassName,
  showTooltip = true,
}: WatchButtonProps) {
  const { t } = useTranslation("stationDetails");
  const { data: session } = authClient.useSession();
  const { watched, isLoading, isPending, setWatched } = useStationWatch(stationId, source, !!session?.user);

  if (!session?.user) return null;

  const actionLabel = watched ? t("unwatchStation") : t("watchStation");
  const visibleLabel = watched ? t("watchingStation") : t("watchStation");
  const buttonSize = size === "md" ? "icon-sm" : "icon-xs";
  const iconSize = size === "md" ? "size-4" : "size-3.5";
  const buttonContent = (
    <>
      {isPending ? <Spinner className={iconSize} /> : <HugeiconsIcon icon={Notification01Icon} className={iconSize} strokeWidth={2} />}
      {showLabel ? <span className={labelClassName}>{visibleLabel}</span> : null}
    </>
  );

  if (!showTooltip) {
    return (
      <Button
        type="button"
        variant="ghost"
        size={buttonSize}
        aria-label={actionLabel}
        aria-pressed={watched}
        disabled={isLoading || isPending}
        className={cn(className, watched ? "bg-primary/10 text-primary hover:text-primary hover:[&_svg]:text-primary" : "text-muted-foreground")}
        onClick={() => setWatched(!watched)}
      >
        {buttonContent}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size={buttonSize}
            aria-label={actionLabel}
            aria-pressed={watched}
            title={actionLabel}
            disabled={isLoading || isPending}
            className={cn(className, watched ? "bg-primary/10 text-primary hover:text-primary hover:[&_svg]:text-primary" : "text-muted-foreground")}
            onClick={() => setWatched(!watched)}
          />
        }
      >
        {buttonContent}
      </TooltipTrigger>
      <TooltipContent>{actionLabel}</TooltipContent>
    </Tooltip>
  );
}
