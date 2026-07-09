import { Notification01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authClient } from "@/lib/authClient";
import { cn } from "@/lib/utils";

import { useStationWatch } from "../hooks/useStationWatch";

type WatchButtonProps = {
  stationId: number;
  source?: "internal" | "uke";
  size?: "sm" | "md";
  className?: string;
};

export function WatchButton({ stationId, source = "internal", size = "sm", className }: WatchButtonProps) {
  const { t } = useTranslation("stationDetails");
  const { data: session } = authClient.useSession();
  const { watched, isLoading, isPending, setWatched } = useStationWatch(stationId, source, !!session?.user);

  if (!session?.user) return null;

  const label = watched ? t("unwatchStation") : t("watchStation");
  const buttonSize = size === "md" ? "icon-sm" : "icon-xs";
  const iconSize = size === "md" ? "size-4" : "size-3.5";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size={buttonSize}
            aria-label={label}
            aria-pressed={watched}
            title={label}
            disabled={isLoading || isPending}
            className={cn(className, watched ? "bg-primary/10 text-primary hover:text-primary hover:[&_svg]:text-primary" : "text-muted-foreground")}
            onClick={() => setWatched(!watched)}
          />
        }
      >
        {isPending ? <Spinner className={iconSize} /> : <HugeiconsIcon icon={Notification01Icon} className={iconSize} strokeWidth={2} />}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
