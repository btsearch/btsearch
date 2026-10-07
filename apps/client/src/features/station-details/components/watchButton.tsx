import { Notification01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { useStationWatch } from "../hooks/useStationWatch";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import type { StationSource } from "@/types/station";

type WatchButtonProps = {
  stationId: number;
  source?: StationSource;
  className?: string;
  labelClassName?: string;
};

export function WatchButton({ stationId, source = "internal", className, labelClassName }: WatchButtonProps) {
  const { t } = useTranslation("stationDetails");
  const { data: session } = authClient.useSession();
  const { watched, isLoading, isPending, setWatched } = useStationWatch(stationId, source, !!session?.user);

  if (!session?.user) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={t("watchStation")}
      aria-pressed={watched}
      disabled={isLoading || isPending}
      className={cn(className, watched ? "bg-primary/10 text-primary hover:text-primary hover:[&_svg]:text-primary" : "text-muted-foreground")}
      onClick={() => setWatched(!watched)}
    >
      {isPending ? <Spinner className="size-4" /> : <HugeiconsIcon icon={Notification01Icon} className="size-4" strokeWidth={2} />}
      <span className={labelClassName}>{watched ? t("watchingStation") : t("watchStation")}</span>
    </Button>
  );
}
