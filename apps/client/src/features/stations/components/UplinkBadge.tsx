import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatSpeedMbps, formatUplinkLabel, uplinkTypeKey } from "@/lib/format/uplink";
import { cn } from "@/lib/utils";
import type { StationUplink } from "@/types/station";

type UplinkBadgeProps = {
  uplink: StationUplink;
  className?: string;
};

const uplinkClassName: Record<string, string> = {
  fiber: "text-sky-600 dark:text-sky-400",
  microwave: "text-amber-600 dark:text-amber-400",
};

export function UplinkBadge({ uplink, className }: UplinkBadgeProps) {
  const { t } = useTranslation("common");
  const typeLabel = t(`labels.${uplinkTypeKey(uplink.type)}`);
  const hasDetails = typeof uplink.speed === "number" || !!uplink.model;

  if (!hasDetails)
    return (
      <span className={cn("inline-flex w-fit text-[11px] font-semibold leading-none", uplinkClassName[uplink.type], className)}>{typeLabel}</span>
    );

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className={cn("inline-flex w-fit text-[11px] font-semibold leading-none cursor-help", uplinkClassName[uplink.type], className)} />
        }
      >
        {formatUplinkLabel(uplink, typeLabel)}
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="space-y-0.5">
          {typeof uplink.speed === "number" ? (
            <p>
              {t("labels.uplinkSpeed")}: {formatSpeedMbps(uplink.speed)}
            </p>
          ) : null}
          {uplink.model ? (
            <p>
              {t("labels.uplinkModel")}: {uplink.model}
            </p>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
